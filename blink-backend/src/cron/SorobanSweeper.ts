/**
 * @file SorobanSweeper.ts
 * @description Background cron service for blockchain synchronization and ledger reconciliation.
 */

import crypto from 'crypto';
import { db } from '../db';
import { transactions, users, escrows, subAccounts } from '../schema'; 
import { logger } from '../logger';
import { eq, and, lt, sql } from 'drizzle-orm'; 
import { rpc, scValToNative, TransactionBuilder, Keypair, Networks, Contract, nativeToScVal } from '@stellar/stellar-sdk';
import { EmailService } from '../services/EmailService';
import { SorobanService } from '../services/SorobanService';
import { NotificationService } from '../services/NotificationService'; // Ensure this is imported for alerts
import { sseService } from '../services/SSEService';

const SERVER_URL = process.env.VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const USDC_CONTRACT_ID = process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

export class SorobanSweeper {
    private server: rpc.Server;
    private isRunning: boolean = false;

    constructor() {
        this.server = new rpc.Server(SERVER_URL);
    }

    // ==========================================
    // ⚡ FAST REAL-TIME DEPOSIT LISTENER
    // ==========================================
    public async pollForDeposits() {
        if (this.isRunning) return; // Prevent overlapping 10-second polling cycles
        this.isRunning = true;
        
        try {
            const networkLatestLedgerRes = await this.server.getLatestLedger();
            const latestLedger = networkLatestLedgerRes.sequence;

            const startLedger = Math.max(1, latestLedger - 50);

            const response = await this.server.getEvents({
                startLedger: startLedger,
                filters: [{ type: "contract", contractIds: [USDC_CONTRACT_ID] }]
            });

            if (!response.events || response.events.length === 0) {
                this.isRunning = false;
                return;
            }

            for (const event of response.events) {
                await this.processEvent(event);
            }

        } catch (error: any) {
            logger.error({ err: error.message || error }, "[Soroban Sweeper] RPC Node connection error during deposit polling.");
        } finally {
            this.isRunning = false;
        }
    }

    // ==========================================
    // ⚙️ THE MATURITY CRANK (Yield Harvester)
    // ==========================================
    public async runMaturityCrank() {
        try {
            const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);

            const maturingVaults = await db.select()
                .from(escrows)
                .where(
                    and(
                        eq(escrows.status, 'Active'), 
                        eq(escrows.agreementType, 'Lock'),
                        lt(escrows.claimableAfter, fourHoursFromNow) 
                    )
                )
                .limit(100); // 🛡️ OOM PROTECTION BATCHING

            if (maturingVaults.length === 0) return;

            logger.info(`[Maturity Crank] Found ${maturingVaults.length} vaults entering the 4-hour settlement window.`);

            for (const vault of maturingVaults) {
                if (!vault.contractId) continue;

                try {
                    await SorobanService.executeCrankTransaction(vault.contractId);
                    const maturedAt = new Date().toISOString();

                    await db.update(escrows)
                        .set({ 
                            status: 'Ready',
                            timeline: sql`timeline || ${JSON.stringify([{ 
                                state: "Ready", 
                                timestamp: maturedAt, 
                                metadata: { notes: "Yield harvested. Funds are fully liquid and ready for instant claim." } 
                            }])}::jsonb`
                        })
                        .where(eq(escrows.id, vault.id));
                        
                    logger.info(`[Maturity Crank] ✅ Vault ${vault.contractId} unwound successfully. DB Status updated to 'Ready'.`);

                } catch (e: any) {
                    const errorMsg = e.message || "";
                    if (errorMsg.includes("#5") || errorMsg.includes("TimeLockNotExpired")) {
                        logger.debug(`[Maturity Crank] Vault ${vault.contractId} rejected by VM (Network Time out of sync). Retrying next cycle.`);
                    } else if (errorMsg.includes("#8") || errorMsg.includes("VaultNotReady")) {
                        await db.update(escrows).set({ status: 'Ready' }).where(eq(escrows.id, vault.id));
                        logger.info(`[Maturity Crank] 🏥 Healed Vault ${vault.contractId} state. Already unwound on-chain.`);
                    } else {
                        logger.error({ err: e }, `[Maturity Crank] ❌ Failed to crank vault ${vault.contractId}`);
                    }
                }
            }
        } catch (error) {
            logger.error({ err: error }, "[Maturity Crank] Critical Error in Harvester Engine");
        }
    }


    // ==========================================
    // 🏥 ESCROW DEPLOYMENT HEALER
    // ==========================================
    public async reconcileStuckEscrows() {
        try {
            // 🌟 STRICT FIX: 20 minutes (Must be > Frontend TimeBounds)
            const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

            const stuckEscrows = await db.select()
                .from(escrows)
                .where(
                    and(
                        eq(escrows.status, 'Pending'),
                        lt(escrows.createdAt, twentyMinutesAgo)
                    )
                )
                .limit(100); // 🛡️ OOM PROTECTION BATCHING

            if (stuckEscrows.length === 0) return;

            for (const escrow of stuckEscrows) {
                try {
                    const isSubAccount = !!escrow.subAccountId;
                    const targetAccountId = escrow.subAccountId || escrow.creatorId;
                    const refundAmount = escrow.amountLocked;
                    const sweeperTime = new Date().toISOString();

                    let isOnChain = false;
                    
                    const txRecord = await db.select().from(transactions).where(eq(transactions.reference, escrow.claimId)).limit(1);
                    
                    if (txRecord.length > 0 && txRecord[0].txHash) {
                        try {
                            const txStatus = await this.server.getTransaction(txRecord[0].txHash);
                            if (txStatus.status === "SUCCESS") isOnChain = true;
                        } catch (e) { isOnChain = false; }
                    }

                    if (isOnChain) {
                        await db.transaction(async (tx) => {
                            await tx.update(escrows)
                                .set({ 
                                    status: 'Active',
                                    timeline: sql`timeline || ${JSON.stringify([{ state: "Active", timestamp: sweeperTime, metadata: { notes: "Recovered by Sweeper: Confirmed on-chain" } }])}::jsonb`
                                })
                                .where(eq(escrows.id, escrow.id));
                            
                            await tx.update(transactions)
                                .set({ status: 'completed' })
                                .where(eq(transactions.reference, escrow.claimId));
                        });
                        logger.info(`[Soroban Sweeper] 🏥 Healed escrow ${escrow.claimId} -> Active`);
                        
                    } else {
                        const refundAmountNum = parseFloat(refundAmount as string || "0");
                        
                        await db.transaction(async (tx) => {
                            await tx.update(escrows)
                                .set({ 
                                    status: 'Failed',
                                    timeline: sql`timeline || ${JSON.stringify([{ state: "Failed", timestamp: sweeperTime, metadata: { notes: "Sweeper timeout: Deemed failed, funds securely refunded" } }])}::jsonb`
                                })
                                .where(eq(escrows.id, escrow.id));

                            // 🛡️ STRICT NUMERIC ROLLBACK FIX: Prevent Reverse Phantom Multiplier
                            if (isSubAccount) {
                                await tx.update(subAccounts).set({ balance: sql`CAST(${subAccounts.balance} AS NUMERIC) + ${refundAmountNum}` }).where(eq(subAccounts.id, targetAccountId));
                            } else {
                                await tx.update(users).set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${refundAmountNum}` }).where(eq(users.id, targetAccountId));
                            }

                            if (escrow.batchId) {
                                await tx.insert(transactions).values({
                                    userId: targetAccountId,
                                    type: "deposit",
                                    amount: refundAmountNum.toString(),
                                    status: "completed",
                                    reference: `REFUND-TIMEOUT-${escrow.claimId}`,
                                    description: `Batch Timeout Refund (${escrow.recipientEmail})`,
                                    note: `Automated sweeper refund for failed bulk deployment.`
                                });
                            } else {
                                await tx.update(transactions)
                                    .set({ status: 'failed' })
                                    .where(eq(transactions.reference, escrow.claimId));
                            }
                        });
                        logger.info(`[Soroban Sweeper] ♻️ Auto-refunded ${refundAmount} USDC for failed escrow ${escrow.claimId}`);
                    }
                } catch (innerError) {
                    logger.error({ err: innerError }, `[Soroban Sweeper] Failed to reconcile escrow ${escrow.claimId}`);
                }
            }
        } catch (error) {
            logger.error({ err: error }, "[Soroban Sweeper] Critical Error in Escrow Reconciliation");
        }
    }


    // ==========================================
    // 🔓 STALLED WITHDRAWAL HEALER
    // ==========================================
    public async reconcileStuckWithdrawals() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            const stuckWithdrawals = await db.select()
                .from(escrows)
                .where(
                    and(
                        eq(escrows.status, 'claim_processing'),
                        lt(escrows.lockedAt, fiveMinutesAgo)
                    )
                )
                .limit(100); // 🛡️ OOM PROTECTION BATCHING

            if (stuckWithdrawals.length === 0) return;

            logger.info(`[Soroban Sweeper] Found ${stuckWithdrawals.length} stalled withdrawals. Checking on-chain states...`);

            for (const escrow of stuckWithdrawals) {
                try {
                    let isVaultEmpty = false;
                    
                    if (escrow.contractId && escrow.contractId.startsWith("C")) {
                        try {
                            const adminKey = Keypair.fromSecret(process.env.TREASURY_SECRET || process.env.PLATFORM_FUNDING_SECRET!);
                            const account = await this.server.getAccount(adminKey.publicKey());
                            const usdc = new Contract(USDC_CONTRACT_ID);

                            const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: process.env.NODE_ENV === "production" ? Networks.PUBLIC : Networks.TESTNET })
                                .addOperation(usdc.call("balance", nativeToScVal(escrow.contractId, { type: "address" })))
                                .setTimeout(30).build();

                            const simResult = await this.server.simulateTransaction(tx);
                            if (rpc.Api.isSimulationSuccess(simResult)) {
                                const rawBalance = Number(scValToNative(simResult.result!.retval));
                                if (rawBalance === 0) isVaultEmpty = true;
                            }
                        } catch (e) {
                            logger.warn(`[Soroban Sweeper] Could not verify vault balance for ${escrow.contractId}. Skipping...`);
                            continue; 
                        }
                    }

                    if (isVaultEmpty) {
                        const payoutAmount = parseFloat(escrow.amountLocked as string || "0");
                        const sweeperTime = new Date().toISOString();
                        
                        await db.transaction(async (tx) => {
                            await tx.update(escrows)
                                .set({ 
                                    status: 'claim_completed',
                                    timeline: sql`timeline || ${JSON.stringify([{ state: "claim_completed", timestamp: sweeperTime, metadata: { notes: "Recovered by Sweeper: Withdrawal confirmed on-chain" } }])}::jsonb`
                                })
                                .where(eq(escrows.id, escrow.id));
                                
                            await tx.update(transactions)
                                .set({ status: 'completed' })
                                .where(eq(transactions.reference, escrow.claimId));

                            if (escrow.isInternal && escrow.targetUserId) {
                                await tx.update(transactions)
                                    .set({ status: 'completed' })
                                    .where(eq(transactions.reference, `${escrow.claimId}_incoming`));

                                await tx.insert(transactions).values({
                                    userId: escrow.targetUserId as string,
                                    type: 'deposit',
                                    amount: payoutAmount.toString(),
                                    reference: `${escrow.claimId}_sweeper_settlement`,
                                    status: 'completed',
                                    description: `Escrow Claim Deposit`,
                                    note: `Liquid deposit from claimed escrow payment (${escrow.claimId}). Recovered automatically by Network Sweeper.`
                                });

                                // 🛡️ STRICT NUMERIC CAST FIX: Prevent Reverse Phantom Multiplier
                                await tx.update(users)
                                    .set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${payoutAmount}` })
                                    .where(eq(users.id, escrow.targetUserId as string));
                            }
                        });
                        logger.info(`[Soroban Sweeper] 🏥 Healed stuck withdrawal ${escrow.claimId} -> claim_completed (Ledger Synced)`);
                    } else {
                        await db.update(escrows)
                            .set({ 
                                status: 'Active', 
                                lockedAt: null as any,
                                timeline: sql`timeline || ${JSON.stringify([{ state: "Active", timestamp: new Date().toISOString(), metadata: { notes: "Sweeper unlocked stalled withdrawal attempt. Ready to retry." } }])}::jsonb`
                            })
                            .where(eq(escrows.id, escrow.id));
                        logger.info(`[Soroban Sweeper] 🔓 Unlocked stalled withdrawal ${escrow.claimId} -> Active`);
                    }
                } catch (innerErr) {
                    logger.error({ err: innerErr }, `[Soroban Sweeper] Failed to reconcile withdrawal ${escrow.claimId}`);
                }
            }
        } catch (error) {
            logger.error({ err: error }, "[Soroban Sweeper] Critical Error in Withdrawal Reconciliation");
        }
    }

    // ==========================================
    // 🛡️ DIRECT TRANSACTION HEALER (Server Crash Recovery)
    // NEW FIX: Heals withdrawals that crashed the server before the DB committed
    // ==========================================
    public async reconcileStuckTransactions() {
        try {
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            
            const stuckTxs = await db.select()
                .from(transactions)
                .where(
                    and(
                        eq(transactions.status, 'processing'),
                        eq(transactions.type, 'withdrawal'),
                        lt(transactions.createdAt, fifteenMinutesAgo)
                    )
                )
                .limit(100); // 🛡️ OOM PROTECTION BATCHING

            if (stuckTxs.length === 0) return;

            for (const tx of stuckTxs) {
                try {
                    let isOnChain = false;
                    if (tx.txHash && tx.txHash !== "processing...") {
                        try {
                            const txStatus = await this.server.getTransaction(tx.txHash);
                            if (txStatus.status === "SUCCESS") isOnChain = true;
                        } catch (e) { isOnChain = false; }
                    }

                    if (!isOnChain) {
                        // ♻️ Safe Rollback: Network never confirmed it. Server likely died beforehand.
                        const refundAmountNum = parseFloat(tx.amount || "0");
                        await db.transaction(async (txDB) => {
                            await txDB.update(transactions).set({ status: 'failed', description: 'Server timeout before broadcast. Refunded.' }).where(eq(transactions.id, tx.id));
                            // 🛡️ STRICT NUMERIC ROLLBACK FIX
                            await txDB.update(users).set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${refundAmountNum}` }).where(eq(users.id, tx.userId));
                        });
                        logger.info(`[Soroban Sweeper] ♻️ Auto-refunded ${refundAmountNum} USDC for crashed transaction ${tx.reference}`);
                    } else {
                        // 🛑 Danger: Network accepted it, but Fiat API status is unknown (Schrödinger's State). Freeze it.
                        await db.update(transactions).set({ status: 'locked', trackingState: 'manual_intervention_required' }).where(eq(transactions.id, tx.id));
                        logger.warn(`[Soroban Sweeper] 🛑 Froze orphaned transaction ${tx.reference}. Alerted Admin.`);
                        
                        // Alert Admin if NotificationService is available
                        try {
                            await NotificationService.alertAdmin('fiat_alert', 'CRITICAL: Orphaned Withdrawal', `Tx ${tx.reference} executed on-chain but dropped locally. Requires manual reconciliation!`);
                        } catch(e) {}
                    }
                } catch (innerErr) {
                    logger.error({ err: innerErr }, `[Soroban Sweeper] Failed to reconcile transaction ${tx.reference}`);
                }
            }
        } catch (error) {
            logger.error({ err: error }, "[Soroban Sweeper] Critical Error in Transaction Reconciliation");
        }
    }


    // ==========================================
    // BLOCKCHAIN DEPOSIT SWEEPER (Listener)
    // ==========================================
    private async processEvent(event: rpc.Api.EventResponse) {
        try {
            const topics = event.topic;
            if (!topics || topics.length < 3) return;

            const eventType = scValToNative(topics[0]);
            if (eventType !== "transfer") return;

            const fromAddress = scValToNative(topics[1]);
            const toAddress = scValToNative(topics[2]);
            const stroopsAmount = scValToNative(event.value);
            const parsedAmount = Number(stroopsAmount) / 10000000;

            if (isNaN(parsedAmount) || parsedAmount <= 0) return;

            const isInternalVault = await db.select().from(escrows).where(eq(escrows.contractId, fromAddress)).limit(1);
            if (isInternalVault.length > 0) return; 

            try {
                const userRecord = await db.select().from(users).where(eq(users.walletAddress, toAddress)).limit(1);
                if (userRecord.length === 0) return; 
                const user = userRecord[0];

                const existingTx = await db.select().from(transactions).where(eq(transactions.txHash, event.txHash)).limit(1);
                if (existingTx.length > 0) return; 

                logger.info(`[Soroban Sweeper] Valid USDC transfer found! Hash: ${event.txHash}. Crediting $${parsedAmount} to User: ${user.id}`);

                const uniqueReference = `ONCHAIN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

                // Variable to hold the absolute truth from the database
                let absoluteNewBalance: string | null = null; 

                await db.transaction(async (txDB) => {
                    await txDB.insert(transactions).values({
                        userId: user.id,
                        type: "deposit",
                        amount: parsedAmount.toString(),
                        status: "completed",
                        trackingState: "settled",
                        description: "On-Chain Direct USDC Deposit",
                        reference: uniqueReference,
                        network: "crypto_transfer",
                        fiatAmount: parsedAmount.toString(),
                        fiatCurrency: "USDC",
                        exchangeRate: "1.00",
                        txHash: event.txHash,
                        note: JSON.stringify({
                            blockchainSourceWallet: fromAddress,
                            ledgerSequence: event.ledger,
                            closedAt: event.ledgerClosedAt
                        })
                    });

                    // 🛡️ ATOMIC DEPOSIT FIX: Execute addition and RETURN the absolute new balance
                    const [updatedUser] = await txDB.update(users)
                        .set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${parsedAmount}` })
                        .where(eq(users.id, user.id))
                        .returning();
                        
                    absoluteNewBalance = updatedUser.balance; // CAPTURE IT
                });

                logger.info(`[Soroban Sweeper] Successfully credited vault state for User ${user.id} with $${parsedAmount} USDC.`);

                if (user.email) {
                    const transactionDate = new Date().toLocaleString('en-US', { 
                        timeZone: user.timezone || 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                    });

                    EmailService.sendDepositSuccess(
                        user.email,
                        `${parsedAmount} USDC`,
                        uniqueReference,
                        transactionDate 
                    ).then(() => {
                        logger.info(`[Soroban Sweeper] Deposit confirmation email sent to ${user.email}`);
                    }).catch((emailErr) => {
                        logger.error({ err: emailErr }, "[Soroban Sweeper] Failed to send email via Resend, but DB was updated.");
                    });
                }

                // THE MISSING LINK: Broadcast the payload to the frontend WebSocket!
                sseService.emitToUser(user.id, 'DEPOSIT_COMPLETED', {
                    status: 'completed',
                    amount: parsedAmount.toString(),
                    fiatAmount: parsedAmount.toString(),
                    accountId: user.id,
                    newBalance: absoluteNewBalance, // THE ABSOLUTE STATE FIX
                    transaction: {
                        id: uniqueReference,
                        reference: uniqueReference,
                        type: 'deposit',
                        amount: parsedAmount.toString(),
                        status: 'completed',
                        description: "On-Chain Direct USDC Deposit"
                    }
                });

            } catch (dbError: any) {
                logger.warn(`[Soroban Sweeper] Database timeout/cold-start while processing hash ${event.txHash}. Will retry next cycle.`);
                return; 
            }

        } catch (parseError: any) {
            logger.error({ err: parseError.message, txHash: event.txHash }, "[Soroban Sweeper] Error parsing XDR from ledger event.");
        }
    }
}
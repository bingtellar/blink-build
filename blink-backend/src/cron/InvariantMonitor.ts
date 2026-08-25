import cron from "node-cron";
import { rpc, Contract, Networks, Keypair, TransactionBuilder, scValToNative, Account, nativeToScVal, xdr, Address, Horizon } from "@stellar/stellar-sdk";
import { notInArray, isNotNull, and, asc, sql, gt } from "drizzle-orm";
import Redis from "ioredis";
import { db } from "../db"; 
import { escrows } from "../schema"; 
import { logger } from "../logger";
import { NotificationService } from "../services/NotificationService";

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NODE_ENV === 'production' ? Networks.PUBLIC : Networks.TESTNET;
const USDC_CONTRACT_ID = process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";
const FACTORY_CONTRACT_ID = process.env.FACTORY_CONTRACT_ID;
const PLATFORM_FUNDING_SECRET = process.env.PLATFORM_FUNDING_SECRET;

const server = new rpc.Server(SOROBAN_RPC_URL);

const HORIZON_URL = process.env.NODE_ENV === 'production' ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const horizonServer = new Horizon.Server(HORIZON_URL);

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const STRIKE_KEY = 'invariant_monitor:consecutive_strikes';

let isReconciling = false;
let localFallbackStrikes = 0; 

export async function runInvariantCheck() {
    if (isReconciling) return;
    isReconciling = true;

    try {
        if (!PLATFORM_FUNDING_SECRET || !FACTORY_CONTRACT_ID) {
            throw new Error("Missing critical environment variables for Invariant Check.");
        }

        // ==========================================
        // 0. THE SPAM GUARD
        // ==========================================
        const factoryKey = xdr.ScVal.scvLedgerKeyContractInstance();
        try {
            const factoryEntry = await server.getContractData(FACTORY_CONTRACT_ID, factoryKey);
            if (factoryEntry) {
                const instanceMap = factoryEntry.val.contractData().val().instance().storage();
                if (instanceMap) {
                    const isPausedEntry = instanceMap.find((item: any) => {
                        try { return scValToNative(item.key()) === "PAUSED"; } 
                        catch { return false; }
                    });
                    if (isPausedEntry && scValToNative(isPausedEntry.val()) === true) {
                        logger.info("🛑 [Sentinel] Factory is currently PAUSED on-chain. Standing down.");
                        isReconciling = false;
                        return;
                    }
                }
            }
        } catch (e) {
            logger.warn("⚠️ [Sentinel] Could not read Factory state. Proceeding with audit.");
        }

        const simKeypair = Keypair.fromSecret(PLATFORM_FUNDING_SECRET);
        const account = new Account(simKeypair.publicKey(), "0"); 
        const usdcContract = new Contract(USDC_CONTRACT_ID);

        let totalMissingDeficit = 0;
        let vaultsAudited = 0;

        let globalLiabilities = 0;
        let globalAssets = 0;

        // ==========================================
        // 1. DB PAGINATION: Strict Keyset Cursor
        // ==========================================
        const DB_BATCH_SIZE = 1000;
        let lastSeenId: string | null = null;
        let hasMoreRecords = true;

        while (hasMoreRecords) {
            const queryConditions = [
                isNotNull(escrows.contractId),
                notInArray(escrows.status, ['claim_completed', 'refunded', 'claim_canceled', 'failed'])
            ];

            if (lastSeenId) queryConditions.push(gt(escrows.id, lastSeenId));

            const monitoredVaults = await db.select({ 
                    id: escrows.id, 
                    contractId: escrows.contractId, 
                    principal: escrows.amountLocked,
                    status: escrows.status 
                })
                .from(escrows)
                .where(and(...queryConditions))
                .orderBy(asc(escrows.id)) 
                .limit(DB_BATCH_SIZE);

            if (monitoredVaults.length === 0) {
                hasMoreRecords = false;
                break;
            }

            lastSeenId = monitoredVaults[monitoredVaults.length - 1].id;
            
            // ==========================================
            // 2. ZERO-TRUST CONCURRENCY AUDIT
            // ==========================================
            const CONCURRENCY_LIMIT = 25; 
            
            for (let i = 0; i < monitoredVaults.length; i += CONCURRENCY_LIMIT) {
                const chunk = monitoredVaults.slice(i, i + CONCURRENCY_LIMIT);
                
                await Promise.all(chunk.map(async (vault) => {
                    if (!vault.contractId || !vault.contractId.startsWith("C") || vault.contractId.includes("MOCK")) return;

                    let assumedDeficit = Number(vault.principal); 
                    const dbStatus = String(vault.status).toLowerCase();

                    try {
                        const instanceKey = xdr.ScVal.scvLedgerKeyContractInstance();
                        let entry;
                        try {
                            entry = await server.getContractData(vault.contractId, instanceKey);
                        } catch (e: any) {
                            const errMsg = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
                            if (errMsg.includes("Not Found") || errMsg.includes("404")) {
                                logger.warn(`🗄️ [ARCHIVED VAULT] Vault ${vault.contractId} was archived by the Stellar network.`);
                            } else {
                                logger.warn(`⚠️ [RPC ERROR] Could not read vault ${vault.contractId}. Skipping.`);
                            }
                            return; 
                        }

                        if (!entry) return; 

                        const storageMap = entry.val.contractData().val().instance().storage();
                        let stateData: any = null;
                        
                        if (storageMap && Array.isArray(storageMap)) {
                            const stateEntry = storageMap.find((item: any) => {
                                try { return scValToNative(item.key()) === "STATE"; } 
                                catch { return false; }
                            });
                            if (stateEntry) stateData = scValToNative(stateEntry.val());
                        }

                        if (!stateData) return; 

                        // 1. Fetch DB Truth
                        const dbPrincipalUsdc = Number(vault.principal);

                        // 2. Fetch Blockchain Truth
                        const expectedBufferUsdc = Number(stateData.buffer_amount || 0) / 10_000_000;
                        const amountClaimedRaw = Number(stateData.amount_claimed || 0);
                        const strategySharesRaw = Number(stateData.strategy_shares || 0);
                        const rawPrincipal = Number(stateData.principal || 0);
                        const onChainPrincipalUsdc = rawPrincipal / 10_000_000;

                        // 🌟 CROSS-ENVIRONMENT STATE VALIDATION
                        const isStateSpoofed = Math.abs(dbPrincipalUsdc - onChainPrincipalUsdc) > 0.05;

                        // Clamp remaining principal based on DB truth
                        const remainingPrincipalUsdc = Math.max(0, dbPrincipalUsdc - (amountClaimedRaw / 10_000_000));

                        let onChainStatus = "Active";
                        if (stateData.status) {
                            onChainStatus = typeof stateData.status === 'object' ? Object.keys(stateData.status)[0] : String(stateData.status);
                        }

                        let requiredMinimum = 0;

                        if (['Claimed', 'Refunded', 'Cancelled'].includes(onChainStatus)) {
                            if (['claim_processing', 'claim_started', 'admin_cancelling', 'sender_cancelling'].includes(dbStatus)) {
                                requiredMinimum = 0; 
                            } else {
                                logger.error(`🚨 [UNAUTHORIZED BYPASS] Vault ${vault.contractId} illegally closed without backend API!`);
                                requiredMinimum = dbPrincipalUsdc; 
                            }
                        } else {
                            if (amountClaimedRaw > 0 && ['active', 'ready'].includes(dbStatus)) {
                                logger.error(`🚨 [MATH EXPLOIT] Unauthorized claim detected on ${vault.contractId} while DB is resting!`);
                                requiredMinimum = dbPrincipalUsdc;
                            } else if (isStateSpoofed) {
                                logger.error(`🚨 [STATE SPOOFING] DB expects $${dbPrincipalUsdc}, but on-chain state claims $${onChainPrincipalUsdc} on vault ${vault.contractId}!`);
                                requiredMinimum = remainingPrincipalUsdc;
                            } else {
                                if (strategySharesRaw > 0) {
                                    requiredMinimum = expectedBufferUsdc; 
                                } else {
                                    requiredMinimum = remainingPrincipalUsdc; 
                                }
                            }
                        }

                        assumedDeficit = requiredMinimum;
                        globalLiabilities += requiredMinimum;

                        const vaultTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
                            .addOperation(usdcContract.call("balance", new Address(vault.contractId).toScVal()))
                            .setTimeout(30).build();

                        let vaultSim;
                        try {
                            vaultSim = await server.simulateTransaction(vaultTx);
                        } catch (networkError) {
                            logger.warn(`⚠️ [Sentinel] Vault ${vault.contractId} RPC simulation timeout. Skipping.`);
                            return;
                        }

                        if (!rpc.Api.isSimulationSuccess(vaultSim) || !vaultSim.result) {
                            logger.error(`🚨 [CONTRACT PANIC] Vault ${vault.contractId} simulation reverted! Assuming capital loss.`);
                            totalMissingDeficit += assumedDeficit;
                            return;
                        }

                        const actualBalanceUsdc = Number(BigInt(scValToNative(vaultSim.result.retval).toString())) / 10_000_000;
                        globalAssets += actualBalanceUsdc;

                        if (actualBalanceUsdc < (requiredMinimum - 0.05)) {
                            totalMissingDeficit += (requiredMinimum - actualBalanceUsdc);
                        }
                        
                        vaultsAudited++;
                        
                    } catch (vaultLevelError: any) {
                        logger.error(`🚨 [Sentinel] Parse exception on vault ${vault.contractId}: ${vaultLevelError.message}. Assuming capital loss.`);
                        totalMissingDeficit += assumedDeficit; 
                    }
                }));
            }
        }

        // ==========================================
        // 🌟 SAVE TELEMETRY TO REDIS FOR ADMIN DASHBOARD
        // ==========================================
        try {
            await redis.set('invariant_monitor:telemetry', JSON.stringify({
                web2Liabilities: globalLiabilities,
                web3Assets: globalAssets,
                deficit: totalMissingDeficit,
                activeVaults: vaultsAudited,
                lastAuditTime: new Date().toISOString()
            }));
        } catch (e) {
            logger.error("Failed to write telemetry to Redis cache.");
        }

        // ==========================================
        // 3. REDIS STRIKE SYSTEM & INFRASTRUCTURE FALLBACK
        // ==========================================
        if (totalMissingDeficit > 0) {
            let currentStrikes = 0;
            
            try {
                currentStrikes = await redis.incr(STRIKE_KEY);
                await redis.expire(STRIKE_KEY, 180); 
                localFallbackStrikes = currentStrikes; 
            } catch (redisError) {
                logger.error("🚨 [Sentinel] Redis is offline! Falling back to local node memory.");
                localFallbackStrikes++;
                currentStrikes = localFallbackStrikes;
            }
            
            logger.warn(`⚠️ [PROTOCOL LEAK] Strike ${currentStrikes}/2. Cryptographically Proven Missing: -$${totalMissingDeficit.toFixed(2)} USDC`);
            
            // 🌟 THE FIX: FIRE THE EARLY WARNING TO OPS ON STRIKE 1
            if (currentStrikes === 1) {
                await NotificationService.alertAdmin(
                    'system_alert', 
                    '⚠️ EARLY WARNING: ANOMALY DETECTED (STRIKE 1)', 
                    `A cryptographic deficit of -$${totalMissingDeficit.toFixed(2)} USDC was just detected. The Sentinel is verifying. If this persists for 60 seconds, the protocol will autonomously freeze.`
                );
            }
            
            if (currentStrikes >= 2) {
                logger.error(`🚨 [DEFCON 1] STRIKE TWO CONFIRMED. INITIATING PROTOCOL LOCKDOWN.`);
                await executeGlobalKillSwitch(totalMissingDeficit);
                
                try { await redis.del(STRIKE_KEY); } catch (e) {}
                localFallbackStrikes = 0; 
            }
        } else {
            try {
                const existingStrikes = await redis.get(STRIKE_KEY);
                if (existingStrikes && Number(existingStrikes) > 0) {
                    logger.info(`✅ [Sentinel] Deficit resolved naturally. Strike counter reset.`);
                    await redis.del(STRIKE_KEY); 
                } else if (vaultsAudited > 0) {
                    logger.debug(`✅ [Sentinel] Cryptographic Invariants Verified (${vaultsAudited} vaults audited).`);
                }
            } catch (redisError) {
                if (localFallbackStrikes > 0) {
                    logger.info(`✅ [Sentinel] Deficit resolved (Local Fallback). Strike counter reset.`);
                    localFallbackStrikes = 0;
                }
            }
        }

    } catch (error: any) {
        logger.warn(`[Sentinel] Reconciliation safely aborted: ${error.message}`);
    } finally {
        isReconciling = false;
    }
}

async function executeGlobalKillSwitch(deficitAmount: number) {
    const MAX_RETRIES = 5;
    const adminKeypair = Keypair.fromSecret(PLATFORM_FUNDING_SECRET!);
    const factoryContract = new Contract(FACTORY_CONTRACT_ID!);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Get sequence number from Soroban RPC for the Transaction Builder
            const accountInfo = await server.getAccount(adminKeypair.publicKey());
            
            // 2. Get the actual XLM balance from the Horizon Network
            let availableXlm = 100; // Safe default
            try {
                const horizonAccount = await horizonServer.loadAccount(adminKeypair.publicKey());
                availableXlm = Number(horizonAccount.balances.find((b: any) => b.asset_type === "native")?.balance || "0");
            } catch (e) {
                logger.warn("⚠️ [Kill Switch] Horizon unavailable for fee check. Defaulting to 10 XLM surge fee.");
            }

            let dynamicEmergencyFee = "100000000"; // 10 XLM
            if (availableXlm < 10) dynamicEmergencyFee = "10000000"; // 1 XLM
            if (availableXlm < 1) dynamicEmergencyFee = "1000000"; // 0.1 XLM

            const pauseTx = new TransactionBuilder(accountInfo, { fee: dynamicEmergencyFee, networkPassphrase: NETWORK_PASSPHRASE })
                .addOperation(factoryContract.call("admin_pause_factory", nativeToScVal(true, { type: 'bool' })))
                .setTimeout(60)
                .build();

            const preparedTx = await server.prepareTransaction(pauseTx) as any;
            preparedTx.sign(adminKeypair);
            
            const sentTx = await server.sendTransaction(preparedTx);
            
            if (sentTx.status === "ERROR") {
                const errorPayload = (sentTx as any).errorResultXdr || JSON.stringify(sentTx);
                throw new Error(`tx_error_${errorPayload}`);
            }
            
            let txStatus = await server.getTransaction(sentTx.hash);
            let pollAttempts = 0;
            
            while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && pollAttempts < 20) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              txStatus = await server.getTransaction(sentTx.hash);
              pollAttempts++;
            }

            if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
              throw new Error(`Kill Switch rejected by ledger. Status: ${txStatus.status}`);
            }
            
            // This single call now handles BOTH the Admin UI and the Telegram Pager flawlessly.
            await NotificationService.alertAdmin(
                'system_alert', 
                '🚨 DEFCON 1: PROTOCOL FROZEN', 
                `Confirmed smart contract deficit of -$${deficitAmount.toFixed(2)} USDC. Factory paused on-chain. All new escrows and deposits are halted.`
            );

            try {
                const telegramMsg = `🚨 *DEFCON 1: BLINK PROTOCOL FROZEN* 🚨\n\n` +
                                    `*Issue:* Vault Buffer Invariant Failed (Confirmed Strike 2)\n` +
                                    `*Deficit/Unverifiable:* -$${deficitAmount.toFixed(2)} USDC\n` +
                                    `*Action:* Factory Circuit Breaker Engaged.\n\n` +
                                    `_All new escrows and deposits are halted. Check server logs for the leaked Contract IDs._`;
                
                if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: telegramMsg, parse_mode: 'Markdown' })
                    });
                }
            } catch (telegramErr) {
                logger.error("Failed to dispatch Telegram Kill Switch alert, but Blockchain freeze succeeded.");
            }

            logger.info(`🛑 Kill Switch engaged and CONFIRMED ON LEDGER on attempt ${attempt}. Hash: ${sentTx.hash}`);
            return; 

        } catch (e: any) {
            const errorMsg = e.message?.toLowerCase() || "";
            if (errorMsg.includes('txbadseq') || errorMsg.includes('bad_seq') || errorMsg.includes('tx_error')) {
                logger.warn(`⚠️ [Kill Switch] Pre-flight network rejection (Attempt ${attempt}/${MAX_RETRIES}). Forcing retry...`);
                await new Promise(res => setTimeout(res, 2000));
                continue;
            }
            logger.error({ err: e }, "🚨 FAILED TO ENGAGE KILL SWITCH. UNEXPECTED ERROR.");
            break;
        }
    }
}
import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db'; 
import { transactions, users, escrows } from '../schema';
import { logger } from '../logger';
import { eq, or, sql, desc } from 'drizzle-orm';
import { NotificationService } from '../services/NotificationService';
import { sseService } from '../services/SSEService';
import { EmailService } from '../services/EmailService'; 
import { rpc, TransactionBuilder, Keypair, Contract, Address, nativeToScVal } from '@stellar/stellar-sdk'; 

// Import the shared helpers from your FiatController
import { getStellarConfig, executeOnChainRefund } from './FiatController';

export const WebhookController = {

    handleWebhook: async (req: Request, res: Response) => {
        try {
            const signatureHeader = req.headers['x-bingtellar-signature'] as string;
            const webhookSecret = process.env.BINGTELLAR_WEBHOOK_SECRET;

            logger.info(`[Webhook] 📥 Incoming Request to /webhook/bingtellar...`);

            if (!signatureHeader || !webhookSecret) {
                logger.error(`[Webhook] 🚨 Missing Signature or Secret in ENV.`);
                return res.status(401).send("Unauthorized");
            }

            const rawBodyBuffer = (req as any).rawBody;
            if (!rawBodyBuffer) {
                logger.error(`[Webhook] 🚨 Missing req.rawBody! Express JSON parser must be configured with a verify buffer function.`);
                return res.status(400).send("Missing raw payload buffer");
            }
        
            const payloadStr = rawBodyBuffer.toString('utf8');
            let isValid = false;
        
            if (signatureHeader.includes('v1=')) {
                const parts = signatureHeader.split(',');
                const timestampPart = parts.find(p => p.startsWith('t='));
                const timestamp = timestampPart ? timestampPart.split('=')[1] : '';
                const v1Signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.split('=')[1]);

                const signaturePayload = `${timestamp}.${payloadStr}`;
                const expectedSig = crypto.createHmac('sha256', webhookSecret).update(signaturePayload).digest('hex');

                isValid = v1Signatures.some(sig => {
                    try {
                        const sigBuf = Buffer.from(sig, 'hex');
                        const expBuf = Buffer.from(expectedSig, 'hex');
                        return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
                    } catch {
                        return false;
                    }
                });
            } else {
                const expectedSig = crypto.createHmac('sha256', webhookSecret).update(payloadStr).digest('hex');
                try {
                    const sigBuf = Buffer.from(signatureHeader, 'hex');
                    const expBuf = Buffer.from(expectedSig, 'hex');
                    isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
                } catch {
                    isValid = false;
                }
            }

            if (!isValid) {
                logger.error(`[Webhook] 🚨 Invalid Signature. HMAC verification failed.`);
                return res.status(401).send("Invalid signature");
            }

            // ====================================================================
            // 🌟 OMNI-MATCH IDENTIFIER EXTRACTION
            // ====================================================================
            const { event, eventType, data } = req.body;
            const activeEvent = event || eventType;
            const normalizedEvent = String(activeEvent || '').toLowerCase().trim();
        
            // 1. Extract raw values
            const incomingRefRaw = req.body.reference || data?.reference;
            const incomingOrderIdRaw = data?.orderId || req.body.orderId || data?.id || req.body.partnerId;

            // 2. Strip "auto_" prefix
            const incomingRef = typeof incomingRefRaw === 'string' ? incomingRefRaw.replace(/^auto_/, '') : incomingRefRaw;
            const incomingOrderId = typeof incomingOrderIdRaw === 'string' ? incomingOrderIdRaw.replace(/^auto_/, '') : incomingOrderIdRaw;

            logger.info(`[Webhook] 🔍 Extracted Identifiers -> Event: ${normalizedEvent} | Ref: ${incomingRef} | OrderID: ${incomingOrderId}`);

            if ((incomingRef && String(incomingRef).startsWith('BTO-TEST')) || (incomingOrderId && String(incomingOrderId).startsWith('BTO-TEST'))) {
                logger.info("✅ Received simulated Bingtellar webhook.");
                return res.status(200).json({ success: true, message: "Test webhook received and verified!" });
            }

            if (!incomingRef && !incomingOrderId) {
                logger.warn(`[Webhook] ⚠️ No valid identifier found in payload. Safely ignored.`);
                return res.status(200).send("No identifier, ignoring.");
            }

            // ====================================================================
            // 🌟 BULLETPROOF HYBRID LOOKUP (TRANSACTIONS & ESCROWS)
            // ====================================================================
            let txRecord = null;

            const directConditions = [];
            if (incomingRef) directConditions.push(eq(transactions.reference, String(incomingRef)));
            if (incomingOrderId) directConditions.push(eq(transactions.reference, String(incomingOrderId)));

            const directMatch = directConditions.length > 0
                ? await db.select().from(transactions).where(or(...directConditions)).limit(1)
                : [];

            if (directMatch.length > 0) {
                txRecord = directMatch[0];
            } else {
                const recentTxs = await db.select().from(transactions).orderBy(desc(transactions.id)).limit(100);
                txRecord = recentTxs.find((t) => {
                    if (incomingRef && t.reference === incomingRef) return true;
                    if (incomingOrderId && (t.reference === incomingOrderId || t.id === incomingOrderId)) return true;
                    try {
                        const meta = typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata;
                        if (meta) {
                            const storedOrderId = meta.bingtellarOrderId || meta.orderId;
                            if (incomingOrderId && storedOrderId === incomingOrderId) return true;
                            if (incomingRef && storedOrderId === incomingRef) return true;
                        }
                    } catch (e) {}
                    return false;
                }) || null;
            }

            // 🌟 THE BATCH FIAT ESCROW FALLBACK (The Exploit Fix)
            let escrowRecord = null;
            if (!txRecord) {
                const escrowConditions = [];
                if (incomingRef) escrowConditions.push(eq(escrows.claimId, String(incomingRef)));
                if (incomingOrderId) escrowConditions.push(eq(escrows.claimId, String(incomingOrderId)));

                if (escrowConditions.length > 0) {
                    const escrowMatch = await db.select().from(escrows).where(or(...escrowConditions)).limit(1);
                    if (escrowMatch.length > 0) escrowRecord = escrowMatch[0];
                }
            }

            if (!txRecord && !escrowRecord) {
                logger.warn(`[Webhook] ⚠️ Transaction/Escrow not found in DB for Ref: "${incomingRef}" or OrderID: "${incomingOrderId}". Safely acknowledged.`);
                return res.status(200).send("Record not found, ignoring.");
            }

            // ==========================================
            // 🚦 ROUTER A: FIAT DELIVERED FOR BATCH ESCROW
            // ==========================================
            if (escrowRecord) {
                logger.info(`[Webhook] 🎯 Matched Webhook to Escrow Record: ${escrowRecord.id} (Claim: ${escrowRecord.claimId})`);
                
                if (normalizedEvent === 'withdrawal.successful' || normalizedEvent === 'payout_completed' || normalizedEvent === 'payout.completed' || normalizedEvent === 'payout.successful') {
                    const newTimeline = [...(escrowRecord.timeline as any[]), {
                        state: 'fiat_delivered',
                        timestamp: new Date().toISOString(),
                        metadata: { notes: "Fiat successfully delivered to recipient's bank." }
                    }];
                    
                    await db.update(escrows).set({
                        status: 'claim_completed',
                        timeline: newTimeline
                    }).where(eq(escrows.id, escrowRecord.id));
                    
                    // 🌟 Real-time batch finalizer!
                    if (escrowRecord.batchId) {
                        const batchSiblings = await db.select({ status: escrows.status }).from(escrows).where(eq(escrows.batchId, escrowRecord.batchId));
                        const allCompleted = batchSiblings.every(s => ['claim_completed', 'claimed', 'refunded', 'claim_canceled', 'cancelled', 'failed', 'expired'].includes((s.status || '').toLowerCase()));
                        if (allCompleted) {
                            await db.update(transactions).set({ status: 'completed', updatedAt: new Date() }).where(eq(transactions.reference, escrowRecord.batchId));
                        }
                    }
                } else if (normalizedEvent.includes('failed') || normalizedEvent.includes('rejected')) {
                    const refundReason = data?.reason || "Bank Network Rejection";
                    const newTimeline = [...(escrowRecord.timeline as any[]), {
                        state: 'fiat_failed',
                        timestamp: new Date().toISOString(),
                        metadata: { notes: `Fiat payout failed: ${refundReason}` }
                    }];
                    await db.update(escrows).set({ status: 'failed', timeline: newTimeline }).where(eq(escrows.id, escrowRecord.id));
                }
                
                return res.status(200).send("Webhook successfully processed for Escrow.");
            }

            // ==========================================
            // 🚦 ROUTER B: STANDARD TRANSACTION
            // ==========================================
            
            // 🛡️ TS COMPILER FIX: Explicitly prove to TypeScript that txRecord cannot be null here
            if (!txRecord) {
                logger.error(`[Webhook] 🚨 Critical state resolution failure.`);
                return res.status(500).send("State resolution failed.");
            }

            logger.info(`[Webhook] 🎯 Matched Webhook to Database Transaction: ${txRecord.id} (Ref: ${txRecord.reference})`);
        
            const tx = txRecord;
            const userRecord = await db.select().from(users).where(eq(users.id, tx.userId)).limit(1);
            const user = userRecord[0];

            if (tx.status === 'completed' || tx.status === 'failed') {
                logger.info(`[Webhook] ⏭️ Transaction ${tx.id} already finalized (${tx.status}). Ignoring.`);
                return res.status(200).send("Transaction already finalized.");
            }

            // ==========================================
            // 🚦 THE UNIFIED EVENT ROUTER
            // ==========================================
            if (
                normalizedEvent === 'withdrawal.successful' ||
                normalizedEvent === 'payout_completed' ||
                normalizedEvent === 'payout.completed' ||
                normalizedEvent === 'payout.successful' ||
                normalizedEvent === 'ledger.outbound'
            ) {
                logger.info(`[Webhook] ✅ Executing SUCCESS database update for ${tx.reference}...`);
            
                const fiatLeg = req.body.fiat_leg || data?.fiat_leg || {};
                const rates = req.body.rates || data?.rates || {};
            
                const executionRate = rates.execution_exchange_rate || tx.exchangeRate;
                const netFiatAmount = fiatLeg.amount || req.body.fiatAmount || data?.fiatAmount || data?.amount || data?.fiat_paid || tx.fiatAmount;
                const railFee = fiatLeg.rail_fee ?? 50.00;
                const grossFiatAmount = fiatLeg.gross_amount || (Number(tx.amount) * Number(executionRate));

                await db.update(transactions).set({
                    status: 'completed',
                    trackingState: 'delivered',
                    fiatAmount: String(netFiatAmount),
                    railFee: String(railFee),
                    exchangeRate: String(executionRate),
                    metadata: {
                        ...((tx.metadata as object) || {}),
                        grossFiatAmount: String(grossFiatAmount),
                        railFee: String(railFee),
                        deliveryProvider: fiatLeg.delivery_provider || data?.providerReference || 'PALMPAY_API'
                    }
                }).where(eq(transactions.id, tx.id));
            
                logger.info(`[Webhook] 📡 Emitting SSE TRANSACTION_SETTLED to User: ${tx.userId}`);
                sseService.emitToUser(tx.userId, 'TRANSACTION_SETTLED', {
                    id: tx.id,
                    reference: tx.reference,
                    status: 'completed',
                    trackingState: 'delivered',
                    fiatAmount: netFiatAmount,
                    grossFiatAmount: grossFiatAmount,
                    railFee: railFee,
                    exchangeRate: executionRate
                });

                await NotificationService.alertAdmin(
                    'fiat_alert',
                    'Withdrawal Delivered',
                    `Withdrawal of $${Number(tx.amount).toFixed(2)} (Net: ${tx.fiatCurrency} ${netFiatAmount}, Rail Fee: ${railFee}) for ${user?.email || tx.userId} was successfully delivered to bank.`
                );

                const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : (tx.metadata || {});
                const guestRecipientEmail = meta.recipientDetails?.email;

                if (guestRecipientEmail) {
                    try {
                        await EmailService.sendClaimPayoutSuccess(
                            guestRecipientEmail,
                            `${tx.fiatCurrency} ${Number(netFiatAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 
                            tx.reference || 'N/A'
                        );
                        logger.info(`[Webhook] ✉️ Claim payout receipt emailed to Recipient: ${guestRecipientEmail}`);
                        
                        if (user?.email) {
                            await EmailService.sendSenderClaimNotification(user.email, tx.reference || 'N/A');
                        }
                    } catch (emailErr: any) {
                        logger.error(`[Webhook] ⚠️ Failed to send claim receipt to ${guestRecipientEmail}: ${emailErr.message}`);
                    }
                } else if (user?.email) {
                    try {
                        await EmailService.sendWithdrawalSuccess(
                            user.email as string,
                            Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }), 
                            `${tx.fiatCurrency} ${Number(netFiatAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 
                            tx.reference || 'N/A',
                            new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        );
                        logger.info(`[Webhook] ✉️ Standard withdrawal receipt emailed to User: ${user.email}`);
                    } catch (emailErr: any) {
                        logger.error(`[Webhook] ⚠️ Failed to send withdrawal receipt email to ${user.email}: ${emailErr.message}`);
                    }
                }
          
            } else if (
                normalizedEvent === 'withdrawal.failed' ||
                normalizedEvent === 'payout_failed' ||
                normalizedEvent === 'payout.failed' ||
                normalizedEvent === 'payout.rejected'
            ) {
                logger.warn(`[Webhook] ❌ Executing FAILURE database update for ${tx.reference}...`);
            
                const refundReason = data?.reason || "Bank Network Rejection (Async)";
                const refundHash = user?.walletAddress
                    ? await executeOnChainRefund(user.walletAddress, Number(tx.amount), refundReason)
                    : null;

                await db.update(transactions).set({
                    status: 'failed',
                    trackingState: 'refunded',
                    note: JSON.stringify({ originalTx: tx.txHash, refundTx: refundHash, reason: refundReason })
                }).where(eq(transactions.id, tx.id));

                sseService.emitToUser(tx.userId, 'TRANSACTION_SETTLED', {
                    id: tx.id,
                    reference: tx.reference,
                    status: 'failed',
                    trackingState: 'refunded'
                });

                await NotificationService.alertAdmin(
                    'fiat_alert',
                    'Withdrawal Failed & Refunded',
                    `Withdrawal for ${user?.email || tx.userId} ($${Number(tx.amount).toFixed(2)}) failed at bank. User auto-refunded.`
                );

            } else if (
                normalizedEvent === 'deposit.successful' ||
                normalizedEvent === 'payin.completed' ||
                normalizedEvent === 'onramp.completed'
            ) {
                const { rpcUrl, networkPassphrase, nativeTokenId } = getStellarConfig();
                const TREASURY_SECRET = process.env.PLATFORM_FUNDING_SECRET;
            
                let sendHash = null;
                if (user?.walletAddress && TREASURY_SECRET) {
                    const amountInStroops = BigInt(Math.floor(Number(tx.amount) * 10000000));
                    const server = new rpc.Server(rpcUrl);
                    const adminKeypair = Keypair.fromSecret(TREASURY_SECRET);
                    const tokenContract = new Contract(nativeTokenId);
                    const adminAccount = await server.getAccount(adminKeypair.publicKey());

                    const contractTx = new TransactionBuilder(adminAccount, { fee: "1000", networkPassphrase })
                        .addOperation(tokenContract.call("mint", new Address(user.walletAddress).toScVal(), nativeToScVal(amountInStroops, { type: 'i128' })))
                        .setTimeout(30).build();

                    contractTx.sign(adminKeypair);
                    const sendResponse = await server.sendTransaction(contractTx);
                    sendHash = sendResponse.hash;
                }

                await db.transaction(async (txDB) => {
                    await txDB.update(users)
                        .set({ balance: sql`${users.balance} + ${Number(tx.amount)}` })
                        .where(eq(users.id, tx.userId));

                    await txDB.update(transactions)
                        .set({
                            status: 'completed',
                            trackingState: 'credited',
                            ...(sendHash && { txHash: sendHash })
                        })
                        .where(eq(transactions.id, tx.id));
                });

                sseService.emitToUser(tx.userId, 'TRANSACTION_SETTLED', {
                    id: tx.id,
                    reference: tx.reference,
                    status: 'completed',
                    trackingState: 'credited'
                });
          
                await NotificationService.alertAdmin(
                    'fiat_alert',
                    'Deposit Settled',
                    `Deposit of $${Number(tx.amount).toFixed(2)} for ${user?.email || tx.userId} settled and credited on-chain.`
                );

                if (user?.email) {
                    try {
                        await EmailService.sendDepositSuccess(
                            user.email as string, 
                            `$${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC`,
                            tx.reference || 'N/A', 
                            new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        );
                        logger.info(`[Webhook] ✉️ Deposit receipt emailed to ${user.email}`);
                    } catch (emailErr: any) {
                        logger.error(`[Webhook] ⚠️ Failed to send deposit email to ${user.email}: ${emailErr.message}`);
                    }
                }
            }

            res.status(200).send("Webhook securely processed.");
        } catch (error: any) {
            logger.error(`Webhook Processing Error: ${error.message}`);
            res.status(500).send("Internal server error");
        }
    }
};
import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { escrows, transactions, users, otps } from '../schema';
import { eq, desc, sql, or, and } from 'drizzle-orm';
import { logger } from '../logger';
import { CryptoService } from '../utils/CryptoService';
import { SorobanService } from '../services/SorobanService';
import { enqueueEscrowDeployment } from '../services/QueueService';
import { NotificationService } from '../services/NotificationService';
import { EmailService } from '../services/EmailService';
import { rpc, TransactionBuilder, Networks, Keypair, Contract, Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { sseService } from '../services/SSEService';

const IS_MAINNET = process.env.NODE_ENV === 'production';
const HORIZON_URL = IS_MAINNET ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;

export const EscrowController = {

  // ==========================================
  // 🔒 AUTHENTICATED ROUTES (SENDER)
  // ==========================================

  buildDeployTx: async (req: Request, res: Response) => {
    try {
      const { recipients } = req.body;
      if (!recipients || !Array.isArray(recipients)) return res.status(400).json({ error: "Invalid payload" });

      const factoryContractId = process.env.FACTORY_CONTRACT_ID || "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB"; 
      const vaultWasmHash = process.env.VAULT_WASM_HASH || crypto.randomBytes(32).toString('hex'); 
      const assetAddress = process.env.TESTNET_USDC || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";
      const defindexAddress = process.env.DEFINDEX_VAULT_ADDRESS || "CDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB";
      
      const platformAddress = process.env.TREASURY_ADDRESS;
      if (!platformAddress) {
        throw new Error("Server misconfiguration: Missing TREASURY_ADDRESS environment variable.");
      }

      const isBulk = recipients.length > 1;
      const masterBulkCode = crypto.randomInt(100000, 999999).toString();

      const payloads = recipients.map(recipient => {
        const amountStroops = Math.floor(parseFloat(recipient.amount) * 10_000_000).toString();
        const feeStroops = Math.floor(parseFloat(recipient.feeAmount || "0") * 10_000_000).toString();
        
        let agreementTypeStr = "Instant", claimableAtSecs = "0", expiryTimestamp = "0";

        if (recipient.claimableAfter) {
          agreementTypeStr = "Lock";
          claimableAtSecs = Math.floor(new Date(recipient.claimableAfter).getTime() / 1000).toString();
        }
        
        if (recipient.dueDate) {
          agreementTypeStr = "Lock";
          expiryTimestamp = Math.floor(new Date(recipient.dueDate).getTime() / 1000).toString();
        }

        const claimCode = recipient.claimCode || (isBulk ? masterBulkCode : crypto.randomInt(100000, 999999).toString());
        const cleanClaimCode = String(claimCode).trim();
        const claimHashHex = crypto.createHash('sha256').update(cleanClaimCode).digest('hex');
        const yieldPolicyMap: Record<string, string> = { split: "Split", recipient: "Recipient", sender: "Sender" };
        const mappedYieldPolicy = yieldPolicyMap[recipient.yieldRecipient?.toLowerCase() || "split"] || "Split";

        return {
          claimCode,
          args: { factoryContractId, vaultWasmHash, agreementTypeStr, assetAddress, feeStroops, claimHashHex, claimableAtSecs, defindexAddress, expiryTimestamp, platformAddress, principalStroops: amountStroops, yieldPolicyStr: mappedYieldPolicy }
        };
      });

      res.json({ payloads });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to build deploy tx");
      res.status(500).json({ error: "Internal server error building smart contract args." });
    }
  },

  createEscrow: async (req: Request, res: Response) => {
    try {
      const { creatorId, amountLocked, feeAmount, recipientEmail, title, claimableAfter, contractId, expiryDate, notifyOnClaim, claimCode, note } = req.body;
      const tokenUserId = (req as any).user.userId || (req as any).user.id;
      
      if (tokenUserId !== creatorId) return res.status(403).json({ error: "Forbidden: Cannot create an escrow for another user." });

      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      if (!idempotencyKey) return res.status(400).json({ error: "Missing x-idempotency-key header." });

      const existingTx = await db.select().from(escrows).where(eq(escrows.idempotencyKey, idempotencyKey)).limit(1);
      if (existingTx.length > 0) return res.status(200).json({ escrow: existingTx[0] });

      let agreementType: "Instant" | "Lock" = "Instant";
      let parsedClaimableAfter = claimableAfter ? new Date(claimableAfter) : null;
      let parsedExpiryDate = expiryDate ? new Date(expiryDate) : null;
      if (parsedClaimableAfter || parsedExpiryDate) agreementType = "Lock";

      let realContractId = contractId || null;
      if (realContractId && realContractId.length > 56) realContractId = realContractId.substring(0, 56); 

      const claimId = `trx${Math.random().toString(36).substr(2, 9)}`;

      const userRecord = await db.select().from(users).where(eq(users.id, creatorId)).limit(1);
      if (userRecord.length === 0) throw new Error("User not found");
      const dbUser = userRecord[0]; 
      
      const escrowNote = note || (title && title !== "General Service" ? title : null);
      const cleanAmountLocked = parseFloat(amountLocked) || 0;
      const cleanFeeAmount = parseFloat(feeAmount || "0") || 0;
      
      if (cleanAmountLocked <= 0) {
          return res.status(400).json({ error: "Transaction amount must be greater than $0.00." });
      }

      const trueTotalDeductionStr = (cleanAmountLocked + cleanFeeAmount).toFixed(2);
      const dbUserBalance = parseFloat(dbUser.balance as string || "0");
      
      if (dbUserBalance < parseFloat(trueTotalDeductionStr)) {
          return res.status(400).json({ 
             error: `Insufficient balance. Required: $${trueTotalDeductionStr}. Available: $${dbUserBalance.toFixed(2)}` 
          });
      }

      const targetUserRecord = await db.select().from(users).where(eq(users.email, recipientEmail.toLowerCase())).limit(1);
      const isInternalUser = targetUserRecord.length > 0;
      const targetUserId = isInternalUser ? targetUserRecord[0].id : null;

      // 🌟 REFACTORED 1: Proper Postgres ACID Transaction
      const [userUpdateRes, newEscrowRes, newTxRes] = await db.transaction(async (tx) => {
        const upUser = await tx.update(users)
          .set({ balance: sql`${users.balance} - ${trueTotalDeductionStr}` })
          .where(and(eq(users.id, creatorId), sql`${users.balance} >= ${trueTotalDeductionStr}`))
          .returning();
        
        const insEscrow = await tx.insert(escrows).values({
          creatorId, targetUserId, isInternal: isInternalUser,
          claimId, amountLocked, feeAmount: feeAmount || "0.00", recipientEmail, title, agreementType, 
          status: 'pending', note: escrowNote, 
          claimableAfter: parsedClaimableAfter, expiryDate: parsedExpiryDate, dueDate: parsedExpiryDate,   
          contractId: realContractId, idempotencyKey, notifySenderOnClaim: notifyOnClaim, otp: claimCode,
          timeline: [{ state: "Pending_Network", timestamp: new Date().toISOString(), metadata: { notes: "Awaiting Soroban deployment" } }]
        }).returning();
        
        const insTx = await tx.insert(transactions).values({
          userId: creatorId, amount: trueTotalDeductionStr, type: "payment", reference: claimId, idempotencyKey,
          status: "pending", description: `Blink Escrow: Payment to ${recipientEmail}`,
          txHash: realContractId, note: escrowNote 
        }).returning();

        if (isInternalUser) {
          await tx.insert(transactions).values({
            userId: targetUserId as string, amount: amountLocked, type: "incoming_escrow", 
            reference: `${claimId}_incoming`, status: "pending", idempotencyKey: `${idempotencyKey}_incoming`,
            description: `Incoming Payment from ${dbUser.businessName || dbUser.firstName}`,
            note: escrowNote 
          });
        }

        return [upUser, insEscrow, insTx];
      });

      if (!userUpdateRes || userUpdateRes.length === 0) {
        throw new Error("Insufficient balance or concurrent transaction conflict.");
      }

      await NotificationService.alertAdmin('escrow_alert', 'New Escrow Locked', `Funds secured in escrow: ${title}.`);
      
      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
      const creatorName = dbUser.businessName || (dbUser.firstName ? `${dbUser.firstName} ${dbUser.lastName || ''}`.trim() : null) || "A Blink User";
      const senderEmail = dbUser.email; 
      
      try {
        const emailPromises = [];
        const formattedSingleAmount = parseFloat(amountLocked).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        emailPromises.push(EmailService.sendEscrowClaimCode(senderEmail, `${formattedSingleAmount} USDC`, claimCode || "XXXXXX", recipientEmail));

        if (isInternalUser) {
            emailPromises.push(EmailService.sendEscrowReceived(
                recipientEmail, creatorName, 
                `${FRONTEND_URL}/dashboard`, 
                escrowNote || "You have a pending internal transfer."
            ));
        } else {
            emailPromises.push(EmailService.sendEscrowReceived(
                recipientEmail, creatorName, 
                `${FRONTEND_URL}/claim/${claimId}`, 
                escrowNote
            ));
        }

        const results = await Promise.all(emailPromises);
        results.forEach((res: any, index) => {
            if (res && res.error) {
                console.error(`\n❌ [Email API Error - Dispatch ${index + 1}]:`, res.error);
            }
        });
      } catch (emailErr: any) {
        logger.error({ err: emailErr }, "Failed to dispatch escrow emails.");
      }

      res.json({
        escrow: newEscrowRes[0],
        newBalance: userUpdateRes[0].balance 
      });
    } catch (error: any) { 
      if (error.code === '23505') return res.status(409).json({ error: "Transaction is already being processed." });
      res.status(400).json({ error: error.message || 'Failed to create escrow' }); 
    }
  },

  createBulkEscrows: async (req: Request, res: Response) => {
    try {
      const { creatorId, bulkData, subAccountId, note } = req.body;
      const tokenUserId = (req as any).user.userId || (req as any).user.id;
      
      if (tokenUserId !== creatorId) return res.status(403).json({ error: "Forbidden: Cannot create escrows for another user." });

      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      if (!idempotencyKey) return res.status(400).json({ error: "Missing x-idempotency-key header." });

      const existingTx = await db.select().from(transactions).where(eq(transactions.idempotencyKey, idempotencyKey)).limit(1);
      if (existingTx.length > 0) return res.status(200).json({ success: true, message: "Bulk transaction already processed." });

      if (!bulkData || bulkData.length === 0) return res.status(400).json({ error: "Empty batch payload" });

      const batchId = `BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const sharedOtp = bulkData[0].claimCode; 

      let totalPrincipal = 0;
      const perTxRate = 0.10;
      const MIN_BATCH_FEE = 1.00;
      const MAX_BATCH_FEE = 15.00; 
      
      const rawCalculatedFee = bulkData.length * perTxRate;
      const totalFees = Math.min(Math.max(rawCalculatedFee, MIN_BATCH_FEE), MAX_BATCH_FEE);
      const distributedFeePerTx = totalFees / bulkData.length;

      const newEscrowsData: any[] = [];
      const incomingTransactionsData: any[] = [];
      const queuePayloads: { claimId: string; signedXdr: string }[] = [];
      const emailsToSend: { recipientEmail: string; amountLocked: string; claimCode: string; claimId: string; note?: string, isInternal: boolean }[] = [];

      for (let i = 0; i < bulkData.length; i++) {
        const item = bulkData[i];
        const claimId = `TRX${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        
        let agreementType = "Instant";
        if (item.claimableAfter || item.expiryDate) agreementType = "Lock";

        const amountNum = parseFloat(item.amountLocked);
        totalPrincipal += amountNum;

        const escrowNote = item.note || (item.title && item.title !== "General Service" ? item.title : null);

        const targetUserRecord = await db.select().from(users).where(eq(users.email, item.recipientEmail.toLowerCase())).limit(1);
        const isInternalUser = targetUserRecord.length > 0;
        const targetUserId = isInternalUser ? targetUserRecord[0].id : null;

        newEscrowsData.push({
          creatorId, targetUserId, isInternal: isInternalUser, claimId, batchId, 
          amountLocked: amountNum.toFixed(2), feeAmount: distributedFeePerTx.toFixed(4), 
          recipientEmail: item.recipientEmail, title: item.title, agreementType,
          status: 'pending', note: escrowNote, 
          claimableAfter: item.claimableAfter ? new Date(item.claimableAfter) : null, 
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null, dueDate: item.expiryDate ? new Date(item.expiryDate) : null,   
          notifySenderOnClaim: false, 
          otp: item.claimCode || sharedOtp, 
          timeline: [{ state: "Pending_Network", timestamp: new Date().toISOString(), metadata: { notes: "Awaiting Soroban bulk deployment" } }]
        });

        if (isInternalUser) {
            incomingTransactionsData.push({
                userId: targetUserId as string, amount: amountNum.toFixed(2), type: "incoming_escrow", 
                reference: `${claimId}_incoming`, status: "pending", idempotencyKey: `${idempotencyKey}_${i}_incoming`,
                description: `Incoming Payment from Blink User`,
                note: escrowNote
            });
        }

        queuePayloads.push({ claimId, signedXdr: item.signedXdr });
        emailsToSend.push({
          recipientEmail: item.recipientEmail, amountLocked: amountNum.toFixed(2), claimCode: item.claimCode || sharedOtp, claimId, note: escrowNote, isInternal: isInternalUser
        });
      }

      const totalAggregateDeductionStr = (totalPrincipal + totalFees).toFixed(2);
      const totalAggregateDeduction = parseFloat(totalAggregateDeductionStr);
      let committedEscrows: any[] = [];
      let newBalance = "0.00";

      const userRecord = await db.select().from(users).where(eq(users.id, creatorId)).limit(1);
      if (parseFloat(userRecord[0].balance || "0") < totalAggregateDeduction) {
          throw new Error("Insufficient funds for bulk payment");
      }

      // 🌟 REFACTORED 2: Proper Postgres ACID Transaction
      const batchResults = await db.transaction(async (tx) => {
          const upUser = await tx.update(users)
              .set({ balance: sql`${users.balance} - ${totalAggregateDeduction}` })
              .where(and(eq(users.id, creatorId), sql`${users.balance} >= ${totalAggregateDeduction}`))
              .returning();

          await tx.insert(transactions).values({
              userId: creatorId, subAccountId: subAccountId || null, type: 'bulk_payment',
              amount: totalAggregateDeductionStr, reference: batchId, idempotencyKey,
              status: 'processing', description: `Bulk Payout (${bulkData.length} recipients)`,
              note: note || "Bulk Escrow Transfer",
              metadata: { totalPrincipal: totalPrincipal.toFixed(2), totalFees: totalFees.toFixed(2), sharedOtp } as any
          });

          const insEscrows = await tx.insert(escrows).values(newEscrowsData).returning();

          if (incomingTransactionsData.length > 0) {
              await tx.insert(transactions).values(incomingTransactionsData);
          }

          return [upUser, null, insEscrows]; // Maintain array return structure
      });

      const userUpdateRes = batchResults[0] as any[];
      if (!userUpdateRes || userUpdateRes.length === 0) {
          throw new Error("Insufficient balance or concurrent transaction conflict.");
      }

      newBalance = userUpdateRes[0].balance as string;
      committedEscrows = batchResults[2] as any[];

      Promise.all(
        queuePayloads.map(qp => enqueueEscrowDeployment(qp.claimId, qp.signedXdr))
      ).catch(e => logger.error({ err: e }, "Failed to enqueue a batch of bulk payloads to Redis. Sweeper will refund."));

      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
      const creatorName = (req as any).user?.name || (req as any).user?.firstName || "A Blink User";
      const senderEmail = userRecord[0].email; 
      
      setTimeout(async () => {
        try {
            const formattedTotal = totalPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            await EmailService.sendEscrowClaimCode(
                senderEmail, 
                `${formattedTotal} USDC (Batch Payout)`, 
                sharedOtp, 
                `Bulk Transfer (${bulkData.length} Recipients)`
            );
        } catch (e) {
            console.error("❌ [Bulk Email Error]: Failed to send Master OTP email to sender", e);
        }

        for (const emailData of emailsToSend) {
          try {
            const batchPromises = [];
            
            if (emailData.isInternal) {
                batchPromises.push(EmailService.sendEscrowReceived(
                    emailData.recipientEmail, creatorName, 
                    `${FRONTEND_URL}/dashboard`, 
                    emailData.note || "You have a pending internal transfer."
                ));
            } else {
                batchPromises.push(EmailService.sendEscrowReceived(
                    emailData.recipientEmail, creatorName, 
                    `${FRONTEND_URL}/claim/${emailData.claimId}`, 
                    emailData.note
                ));
            }

            const results = await Promise.all(batchPromises);
            results.forEach((res: any, index) => {
                if (res && res.error) console.error(`\n❌ [Bulk Email Error]:`, res.error);
            });
          } catch(e) { logger.error({err: e}, "Bulk email dispatch failed"); }
        }
      }, 0);

      res.status(201).json({ success: true, message: "Bulk escrows queued successfully", batchId, sharedOtp, newBalance });
    } catch (error: any) { 
      res.status(400).json({ error: error.message || 'Failed to create bulk escrows' }); 
    }
  },

  getBatchEscrows: async (req: Request, res: Response) => {
      try {
          const batchId = req.params.batchId as string;
          const userId = (req as any).user.userId || (req as any).user.id;

          const childEscrows = await db.select()
              .from(escrows)
              .where(
                  and(
                      eq(escrows.batchId, batchId),
                      eq(escrows.creatorId, userId) 
                  )
              )
              .orderBy(desc(escrows.createdAt));

          res.json(childEscrows);
      } catch (error) {
          res.status(500).json({ error: "Failed to fetch batch details" });
      }
  },

  submitSponsored: async (req: Request, res: Response) => {
    try {
      const { signedXdr, claimId } = req.body; 
      
      if (!signedXdr || !claimId) {
        return res.status(400).json({ error: "Missing signedXdr or claimId payload." });
      }

      await enqueueEscrowDeployment(claimId, signedXdr);

      res.json({ 
        success: true, 
        message: "Transaction queued for blockchain deployment.",
        status: "processing"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to enqueue sponsored transaction." });
    }
  },

  cancelEscrow: async (req: Request, res: Response) => {
    try {
      const reference = req.params.reference as string;
      const { reason, signedXdr } = req.body;
      const userId = (req as any).user?.userId || (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
      const activeEscrow = await db.select().from(escrows).where(and(isUUID ? or(eq(escrows.claimId, reference), eq(escrows.id, reference)) : eq(escrows.claimId, reference), eq(escrows.creatorId, userId))).limit(1);

      if (activeEscrow.length === 0) return res.status(404).json({ error: "Not found or denied." });
      const escrowRecord = activeEscrow[0];
      const currentStatus = escrowRecord.status?.toLowerCase() || '';
      
      if (['completed', 'successful', 'failed', 'cancelled', 'claim_canceled', 'expired'].includes(currentStatus)) return res.status(400).json({ error: "Already closed." });

      const timelineStr = typeof escrowRecord.timeline === 'string' ? escrowRecord.timeline : JSON.stringify(escrowRecord.timeline || []);
      if (['claim_processing'].includes(currentStatus) || timelineStr.toLowerCase().includes('otp_verified')) {
         return res.status(403).json({ error: "Cancellation denied: Recipient already initiated withdrawal." });
      }
      if (!['pending', 'processing', 'active', 'ready', 'claim_started'].includes(currentStatus)) return res.status(400).json({ error: "Un-cancellable state." });

      const lockedEscrow = await db.update(escrows).set({ status: 'sender_cancelling', lockedAt: new Date() }).where(and(eq(escrows.id, escrowRecord.id), eq(escrows.status, escrowRecord.status))).returning();
      if (lockedEscrow.length === 0) return res.status(409).json({ error: "State change detected." });

      const hasOnChainContract = escrowRecord.contractId && escrowRecord.contractId.startsWith("C") && !escrowRecord.contractId.includes("MOCK");
      if (hasOnChainContract) {
        if (!signedXdr) {
          await db.update(escrows).set({ status: escrowRecord.status, lockedAt: null as any }).where(eq(escrows.id, escrowRecord.id));
          return res.status(400).json({ error: "Cryptographic signature required." });
        }
        try {
          await SorobanService.submitSponsoredTransaction(signedXdr);
        } catch (blockchainError: any) {
          const errorMsg = blockchainError.message || "";
          if (errorMsg.includes("#8") || errorMsg.toLowerCase().includes("not found")) {
              console.log(`[GHOST RECOVERY]: Vault already destroyed on-chain.`);
          } else if (errorMsg.includes("TIMEOUT")) {
              return res.status(504).json({ error: "Network timeout. Execution may succeed in background. DB locked." });
          } else {
              await db.update(escrows).set({ status: escrowRecord.status, lockedAt: null as any }).where(eq(escrows.id, escrowRecord.id));
              return res.status(500).json({ error: `Smart contract rejected cancellation: ${errorMsg}` });
          }
        }
      }

      const refundAmount = Math.max(0, parseFloat(escrowRecord.amountLocked as string || "0") - 1.00).toFixed(2);
      const currentTimeline = typeof escrowRecord.timeline === 'string' ? JSON.parse(escrowRecord.timeline) : (escrowRecord.timeline || []);
      const updatedTimeline = [...currentTimeline, { state: "claim_canceled", timestamp: new Date().toISOString(), metadata: { notes: reason || "Sender manually cancelled." } }];

      // 🌟 REFACTORED 3: Proper Postgres ACID Transaction
      try { 
          await db.transaction(async (tx) => {
              await tx.update(escrows).set({ status: 'claim_canceled', lockedAt: null as any, timeline: updatedTimeline }).where(eq(escrows.id, escrowRecord.id));
              await tx.update(users).set({ balance: sql`${users.balance} + ${refundAmount}` }).where(eq(users.id, userId));
              await tx.insert(transactions).values({ userId, type: 'deposit', amount: refundAmount, status: 'completed', trackingState: 'refunded', reference: `${escrowRecord.claimId}_refund`, description: 'Refund: Cancellation' });
              
              if (!escrowRecord.batchId) {
                  await tx.update(transactions).set({ status: 'cancelled' }).where(eq(transactions.reference, escrowRecord.claimId as string));
              }
          });
          
          if (escrowRecord.batchId) {
              const batchSiblings = await db.select({ status: escrows.status }).from(escrows).where(eq(escrows.batchId, escrowRecord.batchId));
              const allCompleted = batchSiblings.every(s => ['claim_completed', 'claimed', 'refunded', 'claim_canceled', 'cancelled', 'failed', 'expired'].includes((s.status || '').toLowerCase()));
              if (allCompleted) {
                  await db.update(transactions).set({ status: 'completed', updatedAt: new Date() }).where(eq(transactions.reference, escrowRecord.batchId));
              }
          }
      } catch (dbError) {
        return res.json({ success: true, warning: "Funds refunded on-chain, but DB sync failed." });
      }

      res.status(200).json({ success: true, message: "Transfer cancelled.", refundedAmount: refundAmount });
    } catch (error: any) { res.status(500).json({ error: "Internal server error." }); }
  },

  // ==========================================
  // 🌍 PUBLIC ROUTES (RECIPIENT / CLAIM PORTAL)
  // ==========================================

  getAllEscrows: async (req: Request, res: Response) => {
    try {
      const allEscrows = await db.select({
        id: escrows.claimId, dbId: escrows.id, amountLocked: escrows.amountLocked, displayTitle: escrows.title,
        contractType: escrows.agreementType, note: escrows.note, claimDate: escrows.claimableAfter, expiryDate: escrows.expiryDate,
        status: escrows.status, senderName: escrows.senderName, recipientEmail: escrows.recipientEmail,
        createdAt: escrows.createdAt, timeline: escrows.timeline
      }).from(escrows).orderBy(desc(escrows.createdAt)); 
      res.json(allEscrows);
    } catch (error: any) { res.status(500).json({ error: 'Internal server error' }); }
  },

  getEscrowById: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const result = await db.select({
        escrow: escrows, senderFirstName: users.firstName, senderLastName: users.lastName, senderBusinessName: users.businessName
      })
      .from(escrows)
      .innerJoin(users, eq(escrows.creatorId, users.id)) 
      .where(eq(escrows.claimId, claimId))
      .limit(1);

      if (result.length === 0) return res.status(404).json({ error: "Escrow not found" });

      const fullSenderName = result[0].senderBusinessName || `${result[0].senderFirstName || ''} ${result[0].senderLastName || ''}`.trim() || "A Blink User";

      res.json({ ...result[0].escrow, senderName: fullSenderName });
    } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
  },

  updateStatus: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const { newStatus, note } = req.body;
      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Escrow not found" });

      const currentTimeline = (existing[0].timeline as any[]) || [];
      const newEvent = { state: newStatus, timestamp: new Date().toISOString(), metadata: { notes: note || `Status updated to ${newStatus}` } };

      const updated = await db.update(escrows).set({ status: newStatus, timeline: [...currentTimeline, newEvent] }).where(eq(escrows.claimId, claimId)).returning();
      res.json(updated[0]);
    } catch (error) { res.status(500).json({ error: "Internal server error" }); }
  },

  generateClaimLink: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (!existing.length) return res.status(404).json({ error: "Transaction not found." });

      const timelineStr = typeof existing[0].timeline === 'string' ? existing[0].timeline : JSON.stringify(existing[0].timeline || []);
      if (!timelineStr.includes('OTP_Verified')) {
          return res.status(403).json({ error: "Unauthorized: You must verify the security OTP before generating an execution link." });
      }

      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); 
      const secureToken = CryptoService.generateSecureToken(claimId, expiresAt);
      
      await db.update(escrows).set({ 
          tokenHash: CryptoService.hashForDatabase(secureToken), expiryDate: new Date(expiresAt),
          timeline: sql`timeline || ${JSON.stringify([{ state: 'Link_Generated', timestamp: new Date().toISOString(), metadata: { notes: 'Secure claim link generated.' } }])}::jsonb`
      }).where(eq(escrows.claimId, claimId));
      
      res.json({ link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/claim/${secureToken}` }); 
    } catch (error) { res.status(500).json({ error: "Internal server error" }); }
  },

  verifyClaimCode: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      
      if (existing.length === 0) return res.status(404).json({ error: "Transaction not found" });

      const escrow = existing[0];
      const providedCode = String(req.body.code || req.body.otp || "").trim();

      if (!escrow.otp) return res.status(400).json({ error: "No security code was configured for this transaction." });

      if (providedCode.length !== escrow.otp.length) {
          return res.status(400).json({ error: "Invalid Authentication code format" });
      }

      const isMatch = crypto.timingSafeEqual(
          Buffer.from(providedCode, 'utf-8'),
          Buffer.from(escrow.otp, 'utf-8')
      );

      if (!isMatch) return res.status(400).json({ error: "Invalid Authentication code" });

      const newEvent = { state: 'Claim_Code_Verified', timestamp: new Date().toISOString(), metadata: { notes: 'Recipient successfully verified the Sender Claim Code.' } };
      await db.update(escrows).set({ timeline: sql`timeline || ${JSON.stringify([newEvent])}::jsonb` }).where(eq(escrows.claimId, claimId));
      
      res.json({ success: true, message: "Claim code verified successfully." });
    } catch (error) { 
      logger.error({ err: error }, "Claim Code Verification Failed");
      res.status(500).json({ error: "Internal server error" }); 
    }
  },

  verifyOtp: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      
      if (existing.length === 0) return res.status(404).json({ error: "Transaction not found." });

      const escrow = existing[0];
      const email = escrow.recipientEmail.toLowerCase().trim();
      const providedOtp = String(req.body.otp || "").trim();

      const otpRecords = await db.select().from(otps).where(eq(otps.email, email)).limit(1);
      const otpRecord = otpRecords[0];

      if (!otpRecord) return res.status(400).json({ error: "No verification code found. Please request a new one." });
      if (otpRecord.isUsed) return res.status(400).json({ error: "This code has already been used." });
      
      const now = new Date();
      const expiryWithBuffer = new Date(otpRecord.expiresAt.getTime() + 60 * 60 * 1000); 
      if (now > expiryWithBuffer) {
           return res.status(400).json({ error: "Code has expired. Please request a new one." });
      }

      if (providedOtp.length !== otpRecord.code.length) {
          return res.status(400).json({ error: "Invalid Authentication code format." });
      }

      const isMatch = crypto.timingSafeEqual(
          Buffer.from(providedOtp, 'utf-8'),
          Buffer.from(otpRecord.code, 'utf-8')
      );

      if (!isMatch) return res.status(400).json({ error: "Incorrect verification code." });

      const updateRes = await db.update(otps)
          .set({ isUsed: true, updatedAt: new Date() })
          .where(and(eq(otps.email, email), eq(otps.isUsed, false)))
          .returning();
          
      if (updateRes.length === 0) return res.status(400).json({ error: "Authentication code was just used by another request." });

      const newEvent = { state: 'OTP_Verified', timestamp: new Date().toISOString(), metadata: { notes: 'Recipient verified identity via 2FA.' } };
      const updated = await db.update(escrows).set({ timeline: sql`timeline || ${JSON.stringify([newEvent])}::jsonb` }).where(eq(escrows.claimId, claimId)).returning();
      
      res.json({ success: true, escrow: updated[0] });
    } catch (error) { 
      logger.error({ err: error }, "OTP Verification Failed");
      res.status(500).json({ error: "Internal server error" }); 
    }
  },

  sendRecipientOtp: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      
      if (existing.length === 0) {
          return res.status(404).json({ error: "Transaction not found." });
      }

      const escrow = existing[0];
      const email = escrow.recipientEmail.toLowerCase().trim();

      const withdrawalOtp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 
      
      await db.insert(otps)
        .values({ email, code: withdrawalOtp, expiresAt, isUsed: false })
        .onConflictDoUpdate({ 
            target: otps.email, 
            set: { code: withdrawalOtp, expiresAt, isUsed: false, updatedAt: new Date() } 
        });

      await db.update(escrows).set({ 
        timeline: sql`timeline || ${JSON.stringify([{ state: 'withdrawal_otp_sent', timestamp: new Date().toISOString(), metadata: { notes: 'Withdrawal 2FA OTP dispatched.' } }])}::jsonb`
      }).where(eq(escrows.claimId, claimId));

      await EmailService.sendWithdrawalOtp(escrow.recipientEmail, withdrawalOtp);
      res.json({ success: true, message: "Withdrawal OTP dispatched." });
    } catch (error) { 
      logger.error({ err: error }, "Failed to send Recipient OTP");
      res.status(500).json({ error: "Internal server error" }); 
    }
  },

  processClaim: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string; 
      const { encrypted_token, recipient_wallet, fiatAmount, fiatCurrency, paymentMethod, exchangeRate, railFee, recipientDetails } = req.body;

      const decrypted = CryptoService.verifyAndDecryptToken(encrypted_token);
      if (!decrypted || decrypted.claimId !== claimId) return res.status(401).json({ error: "Invalid claim link." });
      if (Date.now() > decrypted.expiresAt) return res.status(403).json({ error: "Link expired." });

      const checkStatus = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      
      if (checkStatus.length === 0) {
          return res.status(404).json({ error: "Transaction not found." });
      }

      const currentState = checkStatus[0];
      const currentStatusStr = currentState.status?.toLowerCase() || '';

      const providedHash = CryptoService.hashForDatabase(encrypted_token);
      if (currentState.tokenHash && currentState.tokenHash !== providedHash) {
          return res.status(403).json({ error: "This claim link has been regenerated. Please use the newest link sent to your email." });
      }

      if (['completed', 'succeeded', 'claim_completed'].includes(currentStatusStr)) {
          return res.json({ status: "success", transaction_hash: currentState.claimHash, message: "Already claimed." });
      }

      const allowedClaimStates = ['active', 'ready', 'pending', 'claim_started', 'claim_processing'];
      if (!allowedClaimStates.includes(currentStatusStr)) {
          return res.status(409).json({ error: "Claim aborted: This transaction is currently locked by a platform operation or is already closed." });
      }

      let expectedStatus = currentState.status;

      if (currentState.status === 'claim_processing') {
          const lockedAtTime = currentState.lockedAt ? new Date(currentState.lockedAt).getTime() : 0;
          const timeSinceLock = Date.now() - lockedAtTime;

          if (timeSinceLock < 2 * 60 * 1000) {
              return res.status(409).json({ error: "Transaction is actively processing. Please wait a moment." });
          }

          console.warn(`[RECONCILIATION] Claim ${claimId} stuck for > 2 mins. Verifying upstream state...`);

          if (paymentMethod && paymentMethod !== 'external_wallet') {
              try {
                  const BINGTELLAR_API_URL = process.env.BINGTELLAR_API_URL;
                  const BINGTELLAR_API_KEY = process.env.BINGTELLAR_API_KEY;
                  
                  const bingtellarRes = await fetch(`${BINGTELLAR_API_URL}/api/v1/b2b/offramp/orders/${claimId}`, {
                      headers: { "x-api-key": BINGTELLAR_API_KEY! }
                  });
                  
                  if (bingtellarRes.ok) {
                      const orderData = await bingtellarRes.json();
                      if (orderData.status === 'completed' || orderData.status === 'processing') {
                          await db.update(escrows).set({ status: 'claim_completed' }).where(eq(escrows.claimId, claimId));
                          return res.json({ status: "success", message: "Funds have already been successfully routed to your bank." });
                      }
                  }
              } catch (e) {
                  return res.status(503).json({ error: "Verifying transaction state. Please check your bank account or try again shortly." });
              }
          } 
          
          if (currentState.contractId && !currentState.contractId.includes("MOCK")) {
              try {
                  const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
                  const contractData = await server.getContractData(currentState.contractId, xdr.ScVal.scvSymbol("State"));
                  
                  const responseVal: any = contractData?.val;
                  const scVal = responseVal && typeof responseVal.contractData === 'function' 
                      ? responseVal.contractData().val() 
                      : responseVal;
                  
                  if (scVal && typeof scVal.sym === 'function' && scVal.sym()?.toString() === 'Claimed') {
                      await db.update(escrows).set({ status: 'claim_completed' }).where(eq(escrows.claimId, claimId));
                      return res.json({ status: "success", message: "Funds have already been successfully claimed on-chain." });
                  }
              } catch (e) {
                   console.warn(`[RECONCILIATION] Vault still holds funds or RPC unavailable. Safe to unlock.`);
              }
          }

          await db.update(escrows).set({ status: 'claim_started' }).where(eq(escrows.claimId, claimId));
          expectedStatus = 'claim_started'; 
      }

      const dbRecord = await db.update(escrows)
        .set({ 
            status: 'claim_processing',
            lockedAt: new Date()
        })
        .where(
            and(
                eq(escrows.claimId, claimId),
                eq(escrows.status, expectedStatus) 
            )
        ).returning();

      if (!dbRecord.length) {
          return res.status(409).json({ error: "Transaction lock failed due to concurrent update. Please try again." });
      }

      const escrowData = dbRecord[0];
      let stellarTxHash = `tx_${Math.random().toString(36).substr(2, 9)}`;

      const principal = parseFloat(escrowData.amountLocked as string || "0");
      let exactUsdcPayout = principal;
      let actualYieldEarned = 0;

      const simulationTargetAddress = recipient_wallet || process.env.BINGTELLAR_LIQUIDITY_WALLET || process.env.TREASURY_ADDRESS;

      if (escrowData.contractId && !escrowData.contractId.includes("MOCK") && simulationTargetAddress) {
          // 🟢 Fetch the vault creator's wallet address to track their yield
          const creatorRecord = await db.select({ walletAddress: users.walletAddress }).from(users).where(eq(users.id, escrowData.creatorId)).limit(1);
          const senderWalletAddress = creatorRecord[0]?.walletAddress || process.env.TREASURY_ADDRESS;

          console.log(`[ORACLE] Simulating claim for Vault ${escrowData.contractId} to fetch dynamic JIT payout...`);
          
          const simResult = await SorobanService.simulateClaimPayout(
              escrowData.contractId,
              simulationTargetAddress,
              senderWalletAddress as string, // 🟢 Inject Sender Wallet
              String(escrowData.otp).trim(),
              escrowData.amountLocked as string
          );

          exactUsdcPayout = simResult.exactUsdcOutput;
          actualYieldEarned = simResult.senderYield; // 🟢 Perfect 1:1 attribution

          if (actualYieldEarned > 0) console.log(`[ORACLE] Sender Yield Captured: +$${actualYieldEarned} USDC`);
          if (exactUsdcPayout < principal) console.warn(`[ORACLE] Strategy Loss Detected! Payout slashed.`);
      }

      let bingtellarOrderId: string | undefined = undefined;

      if (paymentMethod && paymentMethod !== 'external_wallet') {
        const BINGTELLAR_API_URL = process.env.BINGTELLAR_API_URL;
        const BINGTELLAR_API_KEY = process.env.BINGTELLAR_API_KEY;

        if (!BINGTELLAR_API_KEY || !BINGTELLAR_API_URL) {
            throw new Error("Server misconfiguration: Missing Bingtellar API credentials.");
        }

        const b2bPayload = {
            asset: "USDC",
            network: "STELLAR", 
            targetCurrency: fiatCurrency, 
            amount: exactUsdcPayout,
            destinationAccount: {
                type: paymentMethod === "mobile_money" ? "mobile_money" : "bank_account",
                account_name: recipientDetails.accountName, 
                account_number: recipientDetails.phoneNumber || recipientDetails.accountNumber,
                bank_code: recipientDetails.bankCode || recipientDetails.bankName,
                email: escrowData.recipientEmail || recipientDetails.email 
            }
        };

        const quoteRes = await fetch(`${BINGTELLAR_API_URL}/api/v1/b2b/offramp/quotes`, {
            method: "POST", 
            headers: { 
                "Content-Type": "application/json", 
                "x-api-key": BINGTELLAR_API_KEY,
                "x-idempotency-key": `${claimId}_quote_${Date.now()}` 
            }, 
            body: JSON.stringify(b2bPayload)
        });
        
        const quoteData = await quoteRes.json();
        bingtellarOrderId = quoteData.orderId || quoteData.data?.orderId;
        const bingtellarDepositAddress = quoteData.depositAddress || quoteData.data?.depositAddress || process.env.BINGTELLAR_LIQUIDITY_WALLET;

        if (!quoteRes.ok || !bingtellarOrderId || !bingtellarDepositAddress) {
            console.error("\n❌ [BINGTELLAR API REJECTION]:", JSON.stringify(quoteData, null, 2));
            throw new Error(`${quoteData.message || quoteData.error || "Fiat provider rejected quote."}`);
        }

        if (escrowData.contractId && !escrowData.contractId.includes("MOCK")) {
          stellarTxHash = await SorobanService.executeClaimTransaction(
              escrowData.contractId, 
              bingtellarDepositAddress, 
              String(escrowData.otp).trim(),
              escrowData.amountLocked as string
          );
        }

        await fetch(`${BINGTELLAR_API_URL}/api/v1/b2b/offramp/execute`, {
            method: "POST", 
            headers: { 
                "Content-Type": "application/json", 
                "x-api-key": BINGTELLAR_API_KEY, 
                "x-idempotency-key": `exec_${bingtellarOrderId}` 
            },
            body: JSON.stringify({ orderId: bingtellarOrderId, txHash: stellarTxHash, depositAddress: bingtellarDepositAddress })
        });
      }
      else {
        if (escrowData.contractId && !escrowData.contractId.includes("MOCK")) {
          stellarTxHash = await SorobanService.executeClaimTransaction(
              escrowData.contractId, 
              recipient_wallet, 
              String(escrowData.otp).trim(),
              escrowData.amountLocked as string
          );
        }
      }

      const completedAt = new Date();

      // 🌟 REFACTORED 4: Proper Postgres ACID Transaction
      try {
          await db.transaction(async (tx) => {
              await tx.update(escrows).set({ 
                  status: 'claim_completed', 
                  tokenHash: null as any, 
                  claimHash: stellarTxHash, 
                  claimDate: completedAt, 
                  claimedAt: completedAt, 
                  timeline: sql`timeline || ${JSON.stringify([{ state: 'Settled', timestamp: completedAt.toISOString(), metadata: { notes: `Funds securely routed. Yield Generated: $${actualYieldEarned.toFixed(4)}` } }])}::jsonb`
              }).where(eq(escrows.claimId, claimId));

              if (!escrowData.batchId) {
                  await tx.update(transactions).set({
                      status: paymentMethod === 'external_wallet' ? 'completed' : 'processing', 
                      txHash: stellarTxHash, 
                      fiatAmount: fiatAmount ? fiatAmount.toString() : undefined, 
                      fiatCurrency: fiatCurrency || undefined,
                      exchangeRate: exchangeRate ? exchangeRate.toString() : undefined, 
                      railFee: railFee ? railFee.toString() : undefined,
                      network: paymentMethod || "external_wallet", 
                      metadata: { 
                          recipientDetails, bingtellarOrderId, yieldDistributed: actualYieldEarned,
                          exactUsdcOutput: exactUsdcPayout, strategyLoss: exactUsdcPayout < principal ? (principal - exactUsdcPayout) : 0
                      } 
                  }).where(eq(transactions.reference, claimId));
              }

              if (actualYieldEarned > 0) {
                  await tx.update(users)
                      .set({ balance: sql`${users.balance} + ${actualYieldEarned}` })
                      .where(eq(users.id, escrowData.creatorId));

                  await tx.insert(transactions).values({
                      userId: escrowData.creatorId, 
                      amount: actualYieldEarned.toFixed(4), 
                      type: "deposit", 
                      reference: `${claimId}_yield`, 
                      status: "completed",
                      description: `Yield Harvest: ${escrowData.title}`,
                      txHash: stellarTxHash,
                      note: `Yield payout for escrow ${claimId}`,
                      metadata: { 
                          notes: "Yield Payout",
                          yieldDistributed: actualYieldEarned
                      }
                  });
              }
          });
          
          if (escrowData.batchId) {
              const batchSiblings = await db.select({ status: escrows.status }).from(escrows).where(eq(escrows.batchId, escrowData.batchId));
              const allCompleted = batchSiblings.every(s => ['claim_completed', 'claimed', 'refunded', 'claim_canceled', 'cancelled', 'failed', 'expired'].includes((s.status || '').toLowerCase()));
              if (allCompleted) {
                  await db.update(transactions).set({ status: 'completed', updatedAt: new Date() }).where(eq(transactions.reference, escrowData.batchId));
              }
          }
      } catch (dbError: any) {
          logger.error({ err: dbError, hash: stellarTxHash, claimId }, "CRITICAL DESYNC: Blockchain executed but DB settlement failed.");
          
          return res.json({ 
              status: "success", 
              claim_id: claimId, 
              transaction_hash: stellarTxHash, 
              warning: "Funds claimed securely, but dashboard sync is delayed. Please refresh in a few minutes." 
          });
      }

      // 🌟 ADDED BLOCK: DISPATCH NOTIFICATIONS (Only for Crypto Claims. Fiat is handled by Webhook)
      if (!bingtellarOrderId) {
          try {
              const sender = await db.select({ email: users.email }).from(users).where(eq(users.id, escrowData.creatorId)).limit(1);
              
              await EmailService.sendClaimPayoutSuccess(
                  escrowData.recipientEmail, 
                  `${exactUsdcPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`, 
                  claimId
              );

              if (sender.length > 0 && sender[0].email) {
                  await EmailService.sendSenderClaimNotification(sender[0].email, claimId);
                  
                  // Real-time UI update for the Sender
                  sseService.emitToUser(escrowData.creatorId, 'escrow_updated', { 
                      claimId: claimId, 
                      status: 'claim_completed',
                      action: 'funds_claimed'
                  });
              }
          } catch (emailError) {
              logger.error({ err: emailError }, `Failed to dispatch claim success emails for ${claimId}`);
          }
      }

      res.json({ status: "success", claim_id: claimId, transaction_hash: stellarTxHash, claimed_at: completedAt.toISOString() });
    } catch (error: any) {
      const claimId = req.params.claimId as string; 
      const errorMsg = error.message || "";

      const isTimeout = errorMsg.toLowerCase().includes("timeout") || 
                        errorMsg.toLowerCase().includes("timed out") || 
                        errorMsg.toLowerCase().includes("network error") ||
                        errorMsg.toLowerCase().includes("fetch failed");

      if (isTimeout) {
          await db.update(escrows).set({ 
              status: 'claim_started', 
              timeline: sql`timeline || ${JSON.stringify([{ state: 'Execution_Timeout', timestamp: new Date().toISOString(), metadata: { notes: 'Network timeout. Verifying upstream state.' } }])}::jsonb` 
          }).where(eq(escrows.claimId, claimId));
          return res.status(504).json({ error: "Network timeout. Your claim is processing securely in the background." });
      }

      await db.update(escrows).set({ 
          status: 'in_escrow', 
          lockedAt: null as any, 
          timeline: sql`timeline || ${JSON.stringify([{ state: 'Execution_Failed', timestamp: new Date().toISOString(), metadata: { notes: errorMsg || `Blockchain execution failed.` } }])}::jsonb` 
      }).where(
          and(
              eq(escrows.claimId, claimId),
              or(eq(escrows.status, 'claim_processing'), eq(escrows.status, 'claim_started'))
          )
      );
      
      res.status(500).json({ error: errorMsg || "Failed to release funds on the blockchain." });
    }
  },

  claimInternalEscrow: async (req: Request, res: Response) => {
    try {
        const claimId = req.params.claimId as string;
        const userId = (req as any).user.userId || (req as any).user.id;
        const { claimCode } = req.body; 

        if (!claimCode) {
            return res.status(400).json({ error: "Claim code required." });
        }

        const activeClaim = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
        if (activeClaim.length === 0) return res.status(404).json({ error: "Escrow not found." });
        
        const escrow = activeClaim[0];
        
        if (escrow.targetUserId !== userId) {
            return res.status(403).json({ error: "Unauthorized: You are not the designated recipient." });
        }

        const providedCode = String(claimCode).trim();
        if (!escrow.otp || providedCode.length !== escrow.otp.length) {
            return res.status(401).json({ error: "Invalid claim code format." });
        }
        
        const isMatch = crypto.timingSafeEqual(
            Buffer.from(providedCode, 'utf-8'), 
            Buffer.from(escrow.otp, 'utf-8')
        );
        if (!isMatch) return res.status(401).json({ error: "Invalid claim code. Please check with the sender." });

        const recipientUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const destinationWallet = recipientUser[0].walletAddress;
        
        if (!destinationWallet) {
            return res.status(400).json({ error: "You must activate your Blink Wallet before claiming." });
        }

        const currentStatusStr = escrow.status?.toLowerCase() || '';
        const allowedClaimStates = ['active', 'ready', 'pending', 'in_escrow', 'claim_started'];
        
        if (!allowedClaimStates.includes(currentStatusStr)) {
            return res.status(409).json({ error: "Claim aborted: This transaction is currently locked by a platform operation or is already closed." });
        }

        const lockedEscrow = await db.update(escrows)
            .set({ status: 'claim_processing', lockedAt: new Date() })
            .where(and(
                eq(escrows.claimId, claimId),
                eq(escrows.status, escrow.status) 
            )).returning();

        if (lockedEscrow.length === 0) return res.status(409).json({ error: "State change detected. Claim aborted." });

        let exactUsdcPayout = parseFloat(escrow.amountLocked as string || "0");
        let actualYieldEarned = 0;

        try {
            const creatorRecord = await db.select({ walletAddress: users.walletAddress }).from(users).where(eq(users.id, escrow.creatorId)).limit(1);
            const senderWalletAddress = creatorRecord[0]?.walletAddress || process.env.TREASURY_ADDRESS;

            const simResult = await SorobanService.simulateClaimPayout(
                escrow.contractId as string,
                destinationWallet, 
                senderWalletAddress as string, // 🟢 Inject Sender Wallet
                String(escrow.otp).trim(),
                escrow.amountLocked as string
            );
            exactUsdcPayout = simResult.exactUsdcOutput;
            actualYieldEarned = simResult.senderYield;
        } catch (simError: any) {
            await db.update(escrows).set({ status: 'Active', lockedAt: null as any }).where(eq(escrows.claimId, claimId));
            throw new Error(`Simulation failed. Does your wallet have a USDC trustline? (${simError.message})`);
        }

        let stellarTxHash;
        try {
            stellarTxHash = await SorobanService.executeClaimTransaction(
                escrow.contractId as string,
                destinationWallet, 
                String(escrow.otp).trim(),
                escrow.amountLocked as string
            );
        } catch (execError: any) {
            const errMsg = execError.message || "";
            
            const isDefinitiveFailure = errMsg.includes("Ledger Rejection") || errMsg.includes("Pre-flight rejection");
            
            if (isDefinitiveFailure) {
                await db.update(escrows).set({ status: 'Active', lockedAt: null as any }).where(eq(escrows.claimId, claimId));
            } else {
                logger.warn({ err: execError }, `[Escrow Controller] Ghost Execution suspected for ${claimId}. Database remains securely locked.`);
            }

            if (errMsg.toLowerCase().includes("opnotrust") || errMsg.toLowerCase().includes("trustline")) {
                throw new Error("Action required: Your wallet is missing the USDC trustline required to receive these funds.");
            }
            
            throw new Error(errMsg); 
        }

        // REFACTORED 5: Proper Postgres ACID Transaction
        try {
            await db.transaction(async (tx) => {
                await tx.update(escrows).set({ 
                  status: 'claim_completed',
                  claimHash: stellarTxHash,
                  claimedAt: new Date(),
                  timeline: sql`timeline || ${JSON.stringify([{ state: 'Settled', timestamp: new Date().toISOString(), metadata: { notes: `Internal Claim successful. Non-custodial payout: $${exactUsdcPayout}` } }])}::jsonb`
                }).where(eq(escrows.id, escrow.id));

                await tx.update(transactions).set({ 
                  status: 'completed',
                  txHash: stellarTxHash 
                }).where(eq(transactions.reference, `${claimId}_incoming`));

                await tx.insert(transactions).values({
                    userId: userId as string,
                    type: 'deposit',
                    amount: exactUsdcPayout.toString(),
                    reference: `${claimId}_deposit_settlement`,
                    status: 'completed',
                    description: `Escrow Claim Deposit`,
                    note: `Liquid deposit from claimed escrow payment (${claimId}).`,
                    txHash: stellarTxHash
                });

                // 1. Credit the Recipient with their exact payout
                await tx.update(users).set({ balance: sql`${users.balance} + ${exactUsdcPayout}` }).where(eq(users.id, userId));

                // 🟢 Credit the Sender their Yield in Internal Claims
                if (actualYieldEarned > 0) {
                    // Enginee Dynamically route / add the Oracle-verified yield to the Sender's balance
                    await tx.update(users)
                        .set({ balance: sql`${users.balance} + ${actualYieldEarned}` })
                        .where(eq(users.id, escrow.creatorId));

                    // Log a clean ledger record for the Sender so they see the yield in their dashboard
                    await tx.insert(transactions).values({
                        userId: escrow.creatorId, 
                        amount: actualYieldEarned.toFixed(4), 
                        type: "deposit", 
                        reference: `${claimId}_yield_internal`, 
                        status: "completed",
                        description: `Yield Harvest: ${escrow.title}`,
                        txHash: stellarTxHash,
                        note: `Yield payout for escrow ${claimId}`,
                        metadata: { 
                            notes: "Yield Payout",
                            yieldDistributed: actualYieldEarned
                        }
                    });
                }

                if (!escrow.batchId) {
                    await tx.update(transactions).set({ 
                      status: 'completed',
                      txHash: stellarTxHash 
                    }).where(eq(transactions.reference, claimId));
                }
            });

            if (escrow.batchId) {
                const batchSiblings = await db.select({ status: escrows.status }).from(escrows).where(eq(escrows.batchId, escrow.batchId));
                const allCompleted = batchSiblings.every(s => ['claim_completed', 'claimed', 'refunded', 'claim_canceled', 'cancelled', 'failed', 'expired'].includes((s.status || '').toLowerCase()));
                if (allCompleted) {
                    await db.update(transactions).set({ status: 'completed', updatedAt: new Date() }).where(eq(transactions.reference, escrow.batchId));
                }
            }
        } catch (dbError: any) {
            logger.error({ err: dbError, hash: stellarTxHash, claimId }, "CRITICAL DESYNC: Blockchain executed but DB settlement failed.");
            
            return res.json({ 
                success: true, 
                transaction_hash: stellarTxHash, 
                netPayout: exactUsdcPayout,
                warning: "Funds claimed securely on-chain, but dashboard sync is delayed. Please refresh in a few minutes." 
            });
        }

        // 🌟 ADDED BLOCK: DISPATCH INTERNAL NOTIFICATIONS
      try {
          const sender = await db.select({ email: users.email }).from(users).where(eq(users.id, escrow.creatorId)).limit(1);
          
          await EmailService.sendClaimPayoutSuccess(
              escrow.recipientEmail, 
              `${exactUsdcPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`, 
              claimId
          );

          if (sender.length > 0 && sender[0].email) {
              await EmailService.sendSenderClaimNotification(sender[0].email, claimId);
              
              // Real-time UI update for the Sender
              sseService.emitToUser(escrow.creatorId, 'escrow_updated', { 
                  claimId: claimId, 
                  status: 'claim_completed',
                  action: 'funds_claimed'
              });
          }
      } catch (emailError) {
          logger.error({ err: emailError }, `Failed to dispatch internal claim emails for ${claimId}`);
      }

      res.json({ success: true, transaction_hash: stellarTxHash, netPayout: exactUsdcPayout });
    } catch (error: any) {
        const claimId = req.params.claimId as string;
        const errorMsg = error.message || "";
        
        const isTimeout = errorMsg.toLowerCase().includes("timeout") || 
                          errorMsg.toLowerCase().includes("timed out") || 
                          errorMsg.toLowerCase().includes("network error") ||
                          errorMsg.toLowerCase().includes("fetch failed");

        if (isTimeout) {
            await db.update(escrows).set({ 
                status: 'claim_started', 
                timeline: sql`timeline || ${JSON.stringify([{ state: 'Execution_Timeout', timestamp: new Date().toISOString(), metadata: { notes: 'Network timeout. Verifying upstream state.' } }])}::jsonb` 
            }).where(eq(escrows.claimId, claimId));
            return res.status(504).json({ error: "Network timeout. Your claim is processing securely in the background. Check your wallet balance shortly." });
        }
        
        await db.update(escrows).set({ 
            status: 'in_escrow', 
            lockedAt: null as any,
            timeline: sql`timeline || ${JSON.stringify([{ state: 'Execution_Failed', timestamp: new Date().toISOString(), metadata: { notes: errorMsg || `Blockchain execution failed.` } }])}::jsonb` 
        }).where(
            and(
                eq(escrows.claimId, claimId),
                or(eq(escrows.status, 'claim_processing'), eq(escrows.status, 'claim_started'))
            )
        );

        res.status(500).json({ error: errorMsg || "Failed to process internal claim." });
    }
  },

  // ==========================================
  // ⚙️ ADMIN OVERRIDE ROUTES (SUPPORT & OPS)
  // ==========================================

  adminResetEscrow: async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).user?.role;
      if (userRole !== 'admin' && userRole !== 'super_admin') return res.status(403).json({ error: "Cryptographic clearance required." });

      const claimId = req.params.claimId as string;
      const { reason } = req.body;

      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Escrow record not found." });

      const escrowRecord = existing[0];
      const currentStatus = escrowRecord.status?.toLowerCase() || '';

      if (['claim_completed', 'completed', 'successful', 'claim_canceled', 'cancelled', 'refunded'].includes(currentStatus)) {
          return res.status(400).json({ error: "Transaction is already finalized." });
      }

      if (['claim_processing', 'admin_cancelling', 'sender_cancelling'].includes(currentStatus)) {
          const lockedAtTime = existing[0].lockedAt ? new Date(existing[0].lockedAt).getTime() : 0;
          if ((Date.now() - lockedAtTime) < 5 * 60 * 1000) {
              return res.status(409).json({ error: "Active lock mid-flight. Please wait 5 minutes before resetting a dead lock." });
          }
      }

      const currentTimeline = typeof escrowRecord.timeline === 'string' ? JSON.parse(escrowRecord.timeline) : (escrowRecord.timeline || []);
      const updatedTimeline = [...currentTimeline, { state: "Admin_Reset", timestamp: new Date().toISOString(), metadata: { notes: reason || "Admin cleared stuck locks." } }];

      await db.update(escrows).set({ status: 'in_escrow', lockedAt: null as any, timeline: updatedTimeline }).where(eq(escrows.id, escrowRecord.id));
      res.json({ success: true, message: "Escrow reset safely to 'in_escrow'." });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  },


  adminForceCancel: async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).user?.role;
      if (userRole !== 'admin' && userRole !== 'super_admin') return res.status(403).json({ error: "Cryptographic clearance required." });

      const claimId = req.params.claimId as string;
      const { reason, forceBypassBlockchain } = req.body; 

      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Escrow record not found." });

      const escrowRecord = existing[0];
      const originalStatus = escrowRecord.status?.toLowerCase() || '';

      if (['claim_completed', 'completed', 'successful', 'claim_canceled', 'cancelled', 'refunded', 'expired'].includes(originalStatus)) {
          return res.status(400).json({ error: "Double-spend protection: Transaction already closed." });
      }

      const lockedEscrow = await db.update(escrows)
          .set({ status: 'admin_cancelling', lockedAt: new Date() })
          .where(and(eq(escrows.id, escrowRecord.id), eq(escrows.status, originalStatus))).returning(); 

      if (lockedEscrow.length === 0) return res.status(409).json({ error: "State change detected. Cancellation aborted." });

      const hasOnChainContract = escrowRecord.contractId && escrowRecord.contractId.startsWith("C") && !escrowRecord.contractId.includes("MOCK");

      if (hasOnChainContract && !forceBypassBlockchain) {
          try {
              const adminSecret = process.env.ADMIN_SECRET || process.env.TREASURY_SECRET;
              if (!adminSecret) throw new Error("Missing Admin Secret");
              
              const adminKeypair = Keypair.fromSecret(adminSecret);
              const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
              const account = await server.getAccount(adminKeypair.publicKey());
              const vault = new Contract(escrowRecord.contractId as string);

              const cancelTx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: Networks.TESTNET })
              .addOperation(vault.call("admin_cancel")).setTimeout(180).build();

              const preparedTx = await server.prepareTransaction(cancelTx) as any;
              preparedTx.sign(adminKeypair);
              const sentTx = await server.sendTransaction(preparedTx);
              
              let txRes = await server.getTransaction(sentTx.hash);
              let attempts = 0;
              while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
                  attempts++; await new Promise(r => setTimeout(r, 3000));
                  txRes = await server.getTransaction(sentTx.hash);
              }
              if (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) throw new Error("TIMEOUT");
              if (txRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Rejected: ${txRes.status}`);
          } catch (blockchainError: any) {
              const errorMsg = blockchainError.message || "";
              const isAlreadyDead = errorMsg.includes("#8") || errorMsg.toLowerCase().includes("not found");
              
              if (isAlreadyDead && originalStatus === 'admin_cancelling') {
                  console.log(`[GHOST RECOVERY]: Vault destroyed on-chain in background.`);
              } else if (errorMsg.includes("TIMEOUT")) {
                  return res.status(504).json({ error: "Network timeout. Execution may succeed in background. DB locked." });
              } else {
                  await db.update(escrows).set({ status: originalStatus, lockedAt: null as any }).where(eq(escrows.id, escrowRecord.id));
                  return res.status(500).json({ error: `Blockchain rejected teardown: ${errorMsg}` });
              }
          }
      }

      const refundAmount = parseFloat(escrowRecord.amountLocked as string || "0").toFixed(2); 
      const currentTimeline = typeof escrowRecord.timeline === 'string' ? JSON.parse(escrowRecord.timeline) : (escrowRecord.timeline || []);
      const updatedTimeline = [...currentTimeline, { state: "Admin_Force_Cancelled", timestamp: new Date().toISOString(), metadata: { notes: reason || "Admin executed override." } }];

      // 🌟 REFACTORED 6: Proper Postgres ACID Transaction
      try { 
          await db.transaction(async (tx) => {
              await tx.update(escrows).set({ status: 'claim_canceled', lockedAt: null as any, timeline: updatedTimeline }).where(eq(escrows.id, escrowRecord.id));
              await tx.update(users).set({ balance: sql`${users.balance} + ${refundAmount}` }).where(eq(users.id, escrowRecord.creatorId));
              await tx.insert(transactions).values({ userId: escrowRecord.creatorId, type: 'deposit', amount: refundAmount, status: 'completed', trackingState: 'admin_refunded', reference: `${escrowRecord.claimId}_admin_refund`, description: `Admin Override Refund`, note: reason });
              
              if (!escrowRecord.batchId) {
                  await tx.update(transactions).set({ status: 'cancelled' }).where(eq(transactions.reference, escrowRecord.claimId as string));
              }
          });

          if (escrowRecord.batchId) {
              const batchSiblings = await db.select({ status: escrows.status }).from(escrows).where(eq(escrows.batchId, escrowRecord.batchId));
              const allCompleted = batchSiblings.every(s => ['claim_completed', 'claimed', 'refunded', 'claim_canceled', 'cancelled', 'failed', 'expired'].includes((s.status || '').toLowerCase()));
              if (allCompleted) {
                  await db.update(transactions).set({ status: 'completed', updatedAt: new Date() }).where(eq(transactions.reference, escrowRecord.batchId));
              }
          }
      } catch (dbError: any) {
          logger.error({ err: dbError, claimId }, "CRITICAL DESYNC");
          return res.json({ success: true, warning: "Funds refunded on-chain, but DB sync failed." });
      }

      res.json({ success: true, message: `Escrow cancelled. $${refundAmount} refunded.`, refundAmount });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  
  adminTogglePauseVault: async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).user?.role;
      if (userRole !== 'admin' && userRole !== 'super_admin') {
          return res.status(403).json({ error: "Cryptographic clearance required." });
      }

      const claimId = req.params.claimId as string;
      const { pause, reason } = req.body; 

      if (typeof pause !== 'boolean') {
          return res.status(400).json({ error: "Invalid payload: 'pause' must be a boolean." });
      }

      const existing = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Escrow record not found." });

      const escrowRecord = existing[0];
      const hasOnChainContract = escrowRecord.contractId && escrowRecord.contractId.startsWith("C") && !escrowRecord.contractId.includes("MOCK");

      if (!hasOnChainContract) {
          return res.status(400).json({ error: "This transaction does not have an active on-chain vault to pause." });
      }

      const currentStatus = escrowRecord.status?.toLowerCase() || '';
      if (['claim_completed', 'completed', 'successful', 'claim_canceled', 'cancelled', 'refunded'].includes(currentStatus)) {
          return res.status(400).json({ error: "Cannot toggle circuit breaker on a finalized transaction." });
      }

      try {
          console.log(`[LOCAL CIRCUIT BREAKER]: ${pause ? 'Pausing' : 'Unpausing'} vault ${escrowRecord.contractId}...`);
          
          const adminSecret = process.env.ADMIN_SECRET || process.env.TREASURY_SECRET;
          if (!adminSecret) throw new Error("Missing Admin Secret");
          
          const adminKeypair = Keypair.fromSecret(adminSecret);
          const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
          const account = await server.getAccount(adminKeypair.publicKey());
          const vault = new Contract(escrowRecord.contractId as string);

          const pauseTx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: NETWORK_PASSPHRASE })
          .addOperation(vault.call("admin_toggle_pause", nativeToScVal(pause, { type: 'bool' })))
          .setTimeout(180)
          .build();

          const preparedTx = await server.prepareTransaction(pauseTx) as any;
          preparedTx.sign(adminKeypair);
          const sentTx = await server.sendTransaction(preparedTx);
          
          let txRes = await server.getTransaction(sentTx.hash);
          let attempts = 0;
          while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
              attempts++; await new Promise(r => setTimeout(r, 3000));
              txRes = await server.getTransaction(sentTx.hash);
          }
          if (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) throw new Error("TIMEOUT");
          if (txRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Rejected: ${txRes.status}`);

      } catch (blockchainError: any) {
          const errorMsg = blockchainError.message || "";
          return res.status(500).json({ error: `Blockchain rejected circuit breaker toggle: ${errorMsg}` });
      }

      const currentTimeline = typeof escrowRecord.timeline === 'string' ? JSON.parse(escrowRecord.timeline) : (escrowRecord.timeline || []);
      const updatedTimeline = [...currentTimeline, { state: pause ? "Vault_Paused" : "Vault_Unpaused", timestamp: new Date().toISOString(), metadata: { notes: reason || `Admin ${pause ? 'engaged' : 'disengaged'} local circuit breaker on-chain.` } }];

      await db.update(escrows).set({ timeline: updatedTimeline }).where(eq(escrows.id, escrowRecord.id));

      res.json({ success: true, message: `Vault successfully ${pause ? 'paused' : 'unpaused'} on-chain.` });
    } catch (error: any) { 
      res.status(500).json({ error: error.message }); 
    }
  },

  adminToggleFactoryPause: async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).user?.role;
      if (userRole !== 'admin' && userRole !== 'super_admin') {
          return res.status(403).json({ error: "Cryptographic clearance required." });
      }

      const { pause } = req.body;
      if (typeof pause !== 'boolean') return res.status(400).json({ error: "Payload 'pause' must be a boolean." });

      console.log(`[GLOBAL CIRCUIT BREAKER]: ${pause ? 'ENGAGING' : 'DISENGAGING'} factory pause...`);
      
      const adminSecret = process.env.ADMIN_SECRET || process.env.TREASURY_SECRET;
      if (!adminSecret) throw new Error("Missing Admin Secret");
      
      const adminKeypair = Keypair.fromSecret(adminSecret);
      const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
      const account = await server.getAccount(adminKeypair.publicKey());
      
      const factoryContractId = process.env.FACTORY_CONTRACT_ID;
      if (!factoryContractId) throw new Error("Missing FACTORY_CONTRACT_ID in environment.");

      const factory = new Contract(factoryContractId as string);
      
      const pauseTx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(factory.call("admin_pause_factory", nativeToScVal(pause, { type: 'bool' })))
        .setTimeout(180)
        .build();

      const preparedTx = await server.prepareTransaction(pauseTx) as any;
      preparedTx.sign(adminKeypair);
      const sentTx = await server.sendTransaction(preparedTx);
      
      let txRes = await server.getTransaction(sentTx.hash);
      let attempts = 0;
      while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
          attempts++; await new Promise(r => setTimeout(r, 3000));
          txRes = await server.getTransaction(sentTx.hash);
      }
      if (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) throw new Error("TIMEOUT");
      if (txRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Rejected: ${txRes.status}`);

      res.json({ success: true, message: `Global factory successfully ${pause ? 'PAUSED' : 'UNPAUSED'} on-chain.` });
    } catch (error: any) { 
      res.status(500).json({ error: `Circuit Breaker failed: ${error.message}` }); 
    }
  },

};
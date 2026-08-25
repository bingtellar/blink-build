import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { escrows, transactions } from '../schema';
import { eq, sql } from 'drizzle-orm';
import { SorobanService } from '../services/SorobanService';
import { logger } from '../logger';

// Redis connection
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const escrowWorker = new Worker('escrow-deployments', async (job) => {
  // 🌟 STATE MACHINE FIX 1: Pull recovered state from Redis
  const { claimId, signedXdr, recoveredContractId } = job.data;
  logger.info(`[WORKER] Picked up deployment job for claimId: ${claimId}`);

  let deployedContractId: string | null = recoveredContractId || null;

  try {
    // =========================================================================
    // 🛡️ PRE-FLIGHT STATE LOCK (Double-Spend & Clock-Drift Prevention)
    // =========================================================================
    if (!deployedContractId) {
      const currentRecord = await db.select({ status: escrows.status })
        .from(escrows)
        .where(eq(escrows.claimId, claimId))
        .limit(1);

      if (currentRecord.length === 0) {
        logger.warn(`[Worker Guard] ⚠️ Escrow ${claimId} not found in database. Dropping job.`);
        return null;
      }

      const currentStatus = currentRecord[0].status?.toLowerCase() || '';

      // 🛑 Abort immediately if the Sweeper or Admin already finalized/refunded this escrow
      const abortedStatuses = ['failed', 'cancelled', 'claim_canceled', 'claim_expired'];
      if (abortedStatuses.includes(currentStatus)) {
        logger.warn(`[Worker Guard] 🛑 Escrow ${claimId} is in '${currentStatus}' state (already refunded/aborted). Dropping execution to prevent double-spend.`);
        return null; // Acknowledge job and exit cleanly
      }

      // 🛑 If already active/completed, avoid duplicate on-chain deployment
      const activeStatuses = ['active', 'ready', 'claim_completed', 'claimed'];
      if (activeStatuses.includes(currentStatus)) {
        logger.info(`[Worker Guard] ℹ️ Escrow ${claimId} is already '${currentStatus}'. Skipping re-deployment.`);
        return null;
      }
    }

    // =========================================================================
    // 1. EXECUTE ON BLOCKCHAIN
    // =========================================================================
    if (!deployedContractId) {
        deployedContractId = await SorobanService.submitSponsoredTransaction(signedXdr);
        
        // 🌟 STATE MACHINE FIX 2: The Sentinel Checkpoint
        // Save the contract ID to Redis immediately so retries won't redeploy if DB drops in step 2
        await job.updateData({ ...job.data, recoveredContractId: deployedContractId });
        logger.info(`[Worker] 🏦 Checkpointed Vault ${deployedContractId} to Redis state for claim ${claimId}`);
    } else {
        logger.info(`[Worker] 🔄 Resuming recovery for Vault ${deployedContractId}. Skipping blockchain execution.`);
    }

    // =========================================================================
    // 2. SAFELY UPDATE DATABASE & TIMELINE
    // =========================================================================
    const completedAt = new Date().toISOString();
    
    await db.transaction(async (txDB) => {
      await txDB.update(escrows)
        .set({ 
          status: 'Active', 
          contractId: deployedContractId,
          timeline: sql`timeline || ${JSON.stringify([{ state: "Active", timestamp: completedAt, metadata: { notes: "Contract Deployed Successfully" } }])}::jsonb`
        })
        .where(eq(escrows.claimId, claimId));

      await txDB.update(transactions)
        .set({ txHash: deployedContractId, status: 'processing' }) 
        .where(eq(transactions.reference, claimId));
    });

    logger.info(`[Worker] ✅ Successfully deployed and synced Vault ${deployedContractId} for claim ${claimId}`);
    return deployedContractId;

  } catch (error: any) {
    const errorMsg = error.message || "";
    logger.error({ err: errorMsg }, `[Worker] ❌ Failed deployment for ${claimId}`);
    
    // 🌟 ENTERPRISE FIX 1: The Ghost Deployment Guard (Timeouts)
    if (errorMsg.includes("timed out") || errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
        logger.warn(`[Worker] 👻 Ghost Deployment detected for ${claimId}. Leaving in Pending state for Sweeper reconciliation.`);
        throw error;
    }

    // 🌟 ENTERPRISE FIX 2: The DB Crash Sentinel
    if (deployedContractId) {
        logger.warn(`[Worker] 🏦 Blockchain SUCCEEDED (${deployedContractId}), but Database crashed. Bypassing refund. Job will retry database sync.`);
        throw error;
    }

    // 🌟 ENTERPRISE FIX 3: The Double-Spend / Auto-Refund Guard
    const maxAttempts = job.opts.attempts || 3;
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

    if (isFinalAttempt) {
        // 3. ATOMIC ROLLBACK (Only triggers on the final definitive failure)
        const failedAt = new Date().toISOString();
        const targetEscrow = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
        
        if (targetEscrow.length > 0 && targetEscrow[0].status === 'pending') {
          const escrowRecord = targetEscrow[0];
          const isSubAccount = !!escrowRecord.subAccountId;
          const targetAccountId = escrowRecord.subAccountId || escrowRecord.creatorId;
          const refundAmount = escrowRecord.amountLocked;
          const totalRefundStr = (parseFloat(refundAmount) + parseFloat(escrowRecord.feeAmount || "0")).toFixed(2);

          // Explicit ::numeric casting to prevent string concatenation bugs
          const refundQuery = isSubAccount 
              ? sql`UPDATE sub_accounts SET balance = balance + ${totalRefundStr}::numeric WHERE id = ${targetAccountId}`
              : sql`UPDATE users SET balance = balance + ${totalRefundStr}::numeric WHERE id = ${targetAccountId}`;

          await db.transaction(async (txDB) => {
            await txDB.update(escrows)
              .set({ 
                status: 'Failed',
                timeline: sql`timeline || ${JSON.stringify([{ state: "Deployment_Failed", timestamp: failedAt, metadata: { notes: errorMsg || "Network rejected transaction. Funds auto-refunded." } }])}::jsonb`
              })
              .where(eq(escrows.claimId, claimId));
              
            await txDB.update(transactions)
              .set({ status: 'failed', description: `Failed: ${errorMsg}` })
              .where(eq(transactions.reference, claimId));

            // Execute the atomic SQL increment to restore the balance securely
            await txDB.execute(refundQuery);
          });
          
          logger.info(`[Worker] ♻️ Auto-refunded ${totalRefundStr} USDC for claim ${claimId}`);
        }
    } else {
        logger.warn(`[Worker] ⏳ Job failed but will retry (Attempt ${job.attemptsMade + 1}/${maxAttempts}). Skipping refund to prevent double-spend.`);
    }

    throw error;
  }
}, { 
  connection: redisConnection,
  // 🌟 PROTECT SOROBAN STATE: Prevents Footprint Contention on the Treasury Wallet sequence number
  concurrency: 1, 
  // 🌟 PROTECT RPC NODE: Ensures you don't get IP-banned by the public testnet
  limiter: {
    max: 5, 
    duration: 1000 
  }
});

escrowWorker.on('ready', () => logger.info('🚀 BullMQ Escrow Worker is active and listening...'));
escrowWorker.on('failed', (job, err) => logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`));
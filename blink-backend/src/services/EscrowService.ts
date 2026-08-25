// src/services/EscrowService.ts
import { db } from '../db';
import { escrows, transactions } from '../schema';
import { eq, sql } from 'drizzle-orm';
import { SorobanService } from './SorobanService';
import { logger } from '../logger';

export const processEscrowDeployment = async (claimId: string, signedXdr: string) => {
  try {
    // 1. Execute on the Soroban Blockchain
    const contractId = await SorobanService.submitSponsoredTransaction(signedXdr);
    const completedAt = new Date().toISOString();

    // 2. The Atomic Boundary using Postgres Transactions
    await db.transaction(async (txDB) => {
      await txDB.update(escrows)
        .set({ 
          contractId, 
          status: 'Active',
          timeline: sql`timeline || ${JSON.stringify([{ state: "Active", timestamp: completedAt, metadata: { notes: "Contract Deployed Successfully" } }])}::jsonb`
        })
        .where(eq(escrows.claimId, claimId));

      await txDB.update(transactions)
        // Keep in a processing state while held in escrow
        .set({ txHash: contractId, status: 'processing' }) 
        .where(eq(transactions.reference, claimId));
    });

    logger.info({ contractId, claimId }, `Vault successfully deployed and database synced.`);
    return contractId;
    
  } catch (error: any) {
    logger.error({ err: error }, `[EscrowService] ❌ Failed deployment for ${claimId}`);

    // 3. ATOMIC ROLLBACK: Heal the DB and refund the ledger safely
    const failedAt = new Date().toISOString();
    const targetEscrow = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
    
    if (targetEscrow.length > 0 && targetEscrow[0].status === 'pending') {
      const escrowRecord = targetEscrow[0];
      const isSubAccount = !!escrowRecord.subAccountId;
      const targetAccountId = escrowRecord.subAccountId || escrowRecord.creatorId;
      const refundAmount = escrowRecord.amountLocked;
      const totalRefundStr = (parseFloat(refundAmount) + parseFloat(escrowRecord.feeAmount || "0")).toFixed(2);

      // Route the refund dynamically based on the ledger architecture
      // Explicit ::numeric casting to prevent string concatenation bugs
      const refundQuery = isSubAccount 
          ? sql`UPDATE sub_accounts SET balance = balance + ${totalRefundStr}::numeric WHERE id = ${targetAccountId}`
          : sql`UPDATE users SET balance = balance + ${totalRefundStr}::numeric WHERE id = ${targetAccountId}`;

      await db.transaction(async (txDB) => {
        await txDB.update(escrows)
          .set({ 
            status: 'Failed',
            timeline: sql`timeline || ${JSON.stringify([{ state: "Deployment_Failed", timestamp: failedAt, metadata: { notes: error.message || "Network rejected transaction. Funds auto-refunded." } }])}::jsonb`
          })
          .where(eq(escrows.claimId, claimId));
          
        await txDB.update(transactions)
          .set({ status: 'failed', description: `Failed: ${error.message}` })
          .where(eq(transactions.reference, claimId));

        // Execute the atomic SQL increment to restore the balance securely
        await txDB.execute(refundQuery);
      });
      
      logger.info(`[EscrowService] ♻️ Auto-refunded ${totalRefundStr} USDC for claim ${claimId}`);
    }

    throw error;
  }
};
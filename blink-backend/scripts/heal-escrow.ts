import { db } from '../src/db';
import { escrows, transactions } from '../src/schema';
import { sql } from 'drizzle-orm';

async function healStuckEscrow() {
    // The stuck transaction ID from your UI
    const claimId = "trx5pylevrtt"; 
    
    // 🌟 The exact Vault ID we captured from your previous terminal logs!
    const contractId = "CA3FGCKWZVLSV2LF5UJW2AUMYQGOBKP77ES77WKMXAYL4KZTO7K4MZDJ"; 
    const completedAt = new Date().toISOString();

    console.log(`🏥 Surgically healing database for claim ${claimId}...`);

    try {
        await db.transaction(async (txDB) => {
            // 1. Sync the Escrow Record
            await txDB.update(escrows)
              .set({ 
                  status: 'Active', 
                  contractId: contractId,
                  timeline: sql`timeline || ${JSON.stringify([{ state: "Active", timestamp: completedAt, metadata: { notes: "Contract Deployed Successfully (Surgical Heal)" } }])}::jsonb`
              })
              .where(sql`LOWER(claim_id) = LOWER(${claimId})`);

            // 2. Sync the Transaction Record
            await txDB.update(transactions)
              .set({ txHash: contractId, status: 'processing' }) 
              .where(sql`LOWER(reference) = LOWER(${claimId})`);
        });

        console.log("✅ Healing complete! Check your dashboard.");
    } catch (e) {
        console.error("❌ Failed to heal database:", e);
    }
    process.exit(0);
}

healStuckEscrow();
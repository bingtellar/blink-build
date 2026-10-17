import { db } from './src/db'; 
import { sql } from 'drizzle-orm';

async function fixNegativeFees() {
    try {
        console.log("🔍 Scanning for corrupted negative fee rows...");
        
        // 1. Find the corrupted rows
        const result = await db.execute(
            sql`SELECT id, claim_id, amount_locked, fee_amount, status FROM escrows WHERE CAST(fee_amount AS NUMERIC) < 0;`
        );
        
        if (result.rows.length === 0) {
            console.log("✅ No negative fees found. Your database is clean!");
            process.exit(0);
        }

        console.log(`⚠️ Found ${result.rows.length} corrupted row(s):`);
        console.table(result.rows);
        console.log("🛠️ Resetting negative fees to $1.00...");

        // 2. Execute the fix
        await db.execute(
            sql`UPDATE escrows SET fee_amount = '1.00' WHERE CAST(fee_amount AS NUMERIC) < 0;`
        );

        console.log("🚀 Fix applied successfully! Database is sanitized.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error executing fix:", error);
        process.exit(1);
    }
}

fixNegativeFees();
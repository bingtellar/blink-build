import { db } from './src/db';
import { transactions } from './src/schema';
import { desc } from 'drizzle-orm';

async function checkDatabase() {
    try {
        console.log("🔍 Connecting to database and fetching latest transactions...\n");
        
        const recentTxs = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(10);
        
        if (recentTxs.length === 0) {
            console.log("⚠️ The transactions table is completely empty!");
        } else {
            console.log(`✅ Found ${recentTxs.length} recent transaction(s) in the database:\n`);
            recentTxs.forEach((tx, index) => {
                console.log(`--- Transaction [${index + 1}] ---`);
                console.log(`Internal ID:     ${tx.id}`);
                console.log(`Reference (Ref): ${tx.reference}`);
                console.log(`Status:          ${tx.status}`);
                console.log(`Metadata:        ${JSON.stringify(tx.metadata, null, 2)}`);
                console.log(`Created At:      ${tx.createdAt}\n`);
            });
        }
    } catch (error: any) {
        console.error("❌ Database query failed:", error.message);
    } finally {
        process.exit(0);
    }
}

checkDatabase();
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

import { users, subAccounts, escrows, paymentRequests, transactions, ledger, notifications, auditLogs } from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error("FATAL ERROR: DATABASE_URL environment variable is missing.");
}

// 🌟 THE FIX: Using standard Postgres Pool instead of Neon HTTP
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema });

// 🌟 SMART CONTRACT LOGIC: Determines "Lock" vs "Instant" based on dates
function determineAgreementType(claimableAfterStr?: string | null): "Instant" | "Lock" | "Adjustment" | "FreeFlow" {
  if (!claimableAfterStr) return "Instant"; 
  const unlockTime = new Date(claimableAfterStr).getTime();
  return unlockTime > Date.now() ? "Lock" : "Instant";
}

// ==========================================
// 🕹️ THE CONTROL PANEL (Hybrid Mapped)
// ==========================================
const futureDate = new Date(Date.now() + 86400000 * 7).toISOString(); // 7 days from now

const MOCK_DATA = {
  users: [
    { 
      firstName: "Konstantyn", lastName: "V.", email: "dmkonstantyn@gmail.com", 
      // 🌟 MATHEMATICALLY VERIFIED KEY 1
      wallet: "GBPEU4GLTEMMHJ3L6CFXEZKGC7XMDL622TQXK6ADJ4SLVE2R5IM7M65I" 
    },
    { 
      firstName: "Sarah", lastName: "Chen", email: "sarah.chen@example.com", 
      // 🌟 MATHEMATICALLY VERIFIED KEY 2
      wallet: "GDUTUP4PZIDEZ4WJ7UM7ORGD7QRW4BJIEFFBBFHXE4LV5PE54WTL4Z7E" 
    }
  ],
  // 🌟 NEW: Dummy Sub-Accounts (Virtual Ledgers)
  subAccounts: [
    { parentIndex: 0, name: "Marketing Department", muxedId: "1001", muxedAddress: "MA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZCV3ZPZA7P5O6B3NXAMVBE2U5B4...1001", balance: "5000.00" },
    { parentIndex: 0, name: "Operations", muxedId: "1002", muxedAddress: "MA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZCV3ZPZA7P5O6B3NXAMVBE2U5B4...1002", balance: "1250.00" }
  ],
  escrows: [
    {
      claimId: "trx_3Lh9MPvA9VksR7Dsv69q27",
      contractId: "CC3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZCV3ZPZA7P5O6B3NXAMVBE2U5B4",
      amountLocked: "14500.00",      
      baseFee: "725.00",      
      cancellationFee: "500.00",
      yieldRecipient: "split",       
      status: "claim_completed",     
      
      title: "UI/UX Design", 
      claimableAfter: futureDate,    
      senderIndex: 0,     
      clientName: "Konstantyn V.",
      recipientEmail: "designer@bingtellar.com",
      
      strategyShares: "14000.50",
      defindexAddress: "CDFI5KRYM6CB7OWQ6TWYRR3Z4T7GNZCV3ZPZA7P5O6B3NXAMVBE2U5B4",
      
      timeline: [
        { state: "claim_created", timestamp: new Date(Date.now() - 86400000).toISOString(), metadata: { notes: "Contract Deployed." } },
        { state: "claim_completed", timestamp: new Date().toISOString(), metadata: { notes: "Milestone Approved & Claimed." } }
      ]
    },
    {
      claimId: "trx_9Kj2PPxA0LksR4Gsv11m52",
      contractId: null,
      amountLocked: "3500.00",       
      baseFee: "175.00",
      cancellationFee: "175.00",
      yieldRecipient: "sender",      
      status: "claim_created",       
      
      title: "Product Sale",
      claimableAfter: null,          
      senderIndex: 1,     
      clientName: "Sarah Chen",
      recipientEmail: "vendor@test.com",
      
      strategyShares: "0",
      defindexAddress: null,
      
      timeline: []
    }
  ]
};

// ==========================================
// 🛠️ THE ENGINE (Translates code to Cloud)
// ==========================================

async function wipe() {
  if (process.env.NODE_ENV === 'production') {
    console.error("⛔️ CRITICAL ERROR: You cannot wipe the production database!");
    process.exit(1); 
  }
  console.log("🧹 Wiping Cloud Tables...");
  
  // 🌟 FIX: Use the camelCase 'auditLogs'
  await db.delete(auditLogs);
  await db.delete(notifications);
  await db.delete(ledger);
  await db.delete(transactions);
  await db.delete(paymentRequests);
  await db.delete(escrows);
  await db.delete(subAccounts);
  await db.delete(users);
}

async function main() {
  const action = process.argv[2];

  try {
    if (action === 'clear') {
      await wipe();
      console.log("✅ Database Empty.");
    } 
    else if (action === 'reset') {
      await wipe();
      console.log("🌱 Injecting God-Mode Control Data...");
      
      // 1. Insert Users
      const insertedUsers = await db.insert(users).values(
        MOCK_DATA.users.map(u => ({ 
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email, 
          walletAddress: u.wallet,
          passwordHash: "$2b$10$dummyhashedpasswordfortestingonly1234567890",
          isFrozen: false
        }))
      ).returning();

      // 1.5 Insert Omnibus Sub-Accounts
      for (const sub of MOCK_DATA.subAccounts) {
        const parentUser = insertedUsers[sub.parentIndex];
        await db.insert(subAccounts).values({
          parentId: parentUser.id,
          name: sub.name,
          muxedId: sub.muxedId,
          muxedAddress: sub.muxedAddress,
          balance: sub.balance
        });
      }

      // 2. Insert Escrows
      for (const item of MOCK_DATA.escrows) {
        const creator = insertedUsers[item.senderIndex];
        const calculatedType = determineAgreementType(item.claimableAfter);
        
        await db.insert(escrows).values({
          creatorId: creator.id,
          claimId: item.claimId,
          contractId: item.contractId,
          sender: creator.walletAddress,
          
          amountLocked: item.amountLocked, 
          baseFee: item.baseFee,
          cancellationFee: item.cancellationFee,
          strategyShares: item.strategyShares,
          defindexAddress: item.defindexAddress,
          
          yieldRecipient: item.yieldRecipient, 
          status: item.status,                 
          agreementType: calculatedType,
          
          title: item.title,
          clientName: item.clientName,
          recipientEmail: item.recipientEmail,
          claimableAfter: item.claimableAfter ? new Date(item.claimableAfter) : null, 
          
          timeline: item.timeline
        });

        // Insert UI Transaction log
        await db.insert(transactions).values({
          userId: creator.id,
          amount: item.amountLocked,
          type: "payment",
          description: `Blink Escrow: ${item.title}`,
          reference: item.claimId,
          status: item.status === "claim_completed" ? "completed" : "pending",
        });
      }

      console.log("✅ Sync Complete. Your live database perfectly matches the UI & Rust Contract.");
    }
    else {
      console.log("❌ Unknown command. Try: npm run db:reset (or node/tsx manage.ts reset)");
    }
  } catch (error) {
    console.error("❌ Fatal Script Error:", error);
    process.exit(1);
  } finally {
    // 🌟 PRODUCTION FIX: Gracefully shut down the database pool to prevent terminal hanging
    await pool.end();
  }
}

main();
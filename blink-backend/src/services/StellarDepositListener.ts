import { Horizon, MuxedAccount } from '@stellar/stellar-sdk';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db'; 
import { subAccounts, transactions } from '../schema'; 
import { sseService } from './SSEService';

export class StellarDepositListener {
  private static HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
  private static MASTER_BASE_ADDRESS = process.env.TREASURY_PUBLIC_KEY || "GA4SYDMWT5WYTRNHNHDHF4OPPH3OBYTBYLANVEDHGNMTAGNSFGXB6AL7"; 
  private static USDC_ASSET_ISSUER = process.env.USDC_ISSUER || "GBBD47IF6LWK7P7MDEVSCZA7CFWPRSFFKHO7UR4TCJZGNAUBHNLYY34Z"; 
    
  public static startListening() {
    console.log(`📡 Starting Stellar Deposit Listener for: ${this.MASTER_BASE_ADDRESS}`);
    
    const server = new Horizon.Server(this.HORIZON_URL);
    let lastCursor = "now"; 

    server.payments()
      .forAccount(this.MASTER_BASE_ADDRESS)
      .cursor(lastCursor)
      .stream({
        onmessage: async (payment: any) => {
          try {
            await this.processIncomingPayment(payment);
          } catch (error) {
            console.error(`❌ Error processing payment ${payment.id}:`, error);
          }
        },
        onerror: (error) => {
          console.error("⚠️ Stellar stream error. Attempting to reconnect...");
        }
      });
  }

  private static async processIncomingPayment(payment: any) {
    if (payment.type !== "payment") return;
    if (payment.to !== this.MASTER_BASE_ADDRESS && !payment.to.startsWith('M')) return;

    const isNativeXLM = payment.asset_type === "native";
    // const isUSDC = payment.asset_code === "USDC" && payment.asset_issuer === this.USDC_ASSET_ISSUER  // Removed

    // ARCHITECTURE FIX: Drop USDC here completely to prevent SAC overlap. 
    // The SorobanEventListener will exclusively handle all USDC activity.
    if (!isNativeXLM) return;

    // 🌟 THE ORIGIN FILTER: Prevent Double-Crediting Internal Sweeps
    if (payment.from === this.MASTER_BASE_ADDRESS) {
        console.log(`🛡️ Blocked Double-Credit: Ignoring internal XLM transfer from Master Address`);
        return;
    }

    const amount = parseFloat(payment.amount);
    const txHash = payment.transaction_hash;
    let targetMuxedId: string | null = null;

    if (payment.to.startsWith('M')) {
      const muxed = MuxedAccount.fromAddress(payment.to, "1"); 
      targetMuxedId = muxed.id().toString();
    } else {
      const server = new Horizon.Server(this.HORIZON_URL);
      const txDetails = await server.transactions().transaction(txHash).call();
      
      if (txDetails.memo_type === "id") {
        targetMuxedId = txDetails.memo || null; 
      }
    }

    if (!targetMuxedId) {
      console.log(`🏦 Unallocated deposit of ${amount} XLM received to Master Wallet.`);
      return; 
    }

    const subAccountResult = await db.select().from(subAccounts).where(eq(subAccounts.muxedId, targetMuxedId));
    
    if (subAccountResult.length === 0) {
      console.warn(`⚠️ Received XLM payment for unknown Sub-Account ID: ${targetMuxedId}`);
      return;
    }

    const subAccount = subAccountResult[0];

    // 🌟 PRODUCTION FIX: Atomic Database Transaction & Strict Idempotency
    // 1. THE NULL-BYPASS GUARD
    if (!payment.id) {
        throw new Error(`CRITICAL: Stellar payment missing unique ID. txHash: ${txHash}`);
    }

    try {
      await db.transaction(async (txDB) => {
        
        // 2. ATOMIC EXECUTION (Insert First, Balance Second)
        const insertedTx = await txDB.insert(transactions).values({
          userId: subAccount.parentId, 
          subAccountId: subAccount.id, 
          amount: amount.toString(),
          type: "deposit",
          reference: payment.id, 
          txHash: txHash,        
          status: "completed",
          description: `Deposit to ${subAccount.name}`,
        })
        .onConflictDoNothing({ target: transactions.reference })
        .returning();

        // 3. THE GRACEFUL LOCK
        if (insertedTx.length === 0) {
            console.log(`🛡️ Idempotency Lock: Payment ${payment.id} already processed. Safely ignoring.`);
            return;
        }

        // 4. EXPLICIT TYPE CASTING (::numeric)
        await txDB.update(subAccounts)
          .set({ balance: sql`${subAccounts.balance} + ${amount}::numeric` })
          .where(eq(subAccounts.id, subAccount.id));
      });

      console.log(`✅ [CLASSIC SYNC] Successfully credited ${amount} XLM to Sub-Account: ${subAccount.name} (ID: ${targetMuxedId})`);

      // 🌟 THE MISSING LINK: Broadcast the payload to the frontend WebSocket!
      sseService.emitToUser(subAccount.parentId, 'DEPOSIT_COMPLETED', {
          status: 'completed',
          amount: amount.toString(),
          fiatAmount: amount.toString(),
          accountId: subAccount.id,
          transaction: {
              id: payment.id,
              reference: payment.id,
              type: 'deposit',
              amount: amount.toString(),
              status: 'completed',
              description: `Deposit to ${subAccount.name}`
          }
      });

    } catch (error: any) {
      if (error.code === '23505') return;
      console.error(`❌ Error processing Horizon payment for tx ${txHash}:`, error);
    }
  }
}
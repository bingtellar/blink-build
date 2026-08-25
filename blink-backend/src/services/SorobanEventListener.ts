import { rpc, xdr, scValToNative, Horizon } from '@stellar/stellar-sdk';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db'; 
import { subAccounts, transactions, escrows } from '../schema';
import { sseService } from './SSEService';

export class SorobanEventListener {
  private static RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
  private static HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
  
  // The official Testnet USDC Contract ID
  private static USDC_CONTRACT_ID = process.env.USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";
  private static MASTER_BASE_ADDRESS = process.env.TREASURY_ADDRESS || "GAQR6SNJPE7VAKEWJOMXXGM2NJZW52UHHZ5CKDA4QJ2PPWXUDCS53322";
    
  private static lastLedger = 0;
  private static isPolling = false;

  public static async startListening() {
    console.log(`📡 Starting Enterprise Soroban Event Listener for: ${this.MASTER_BASE_ADDRESS}`);
    const server = new rpc.Server(this.RPC_URL);

    try {
      // Sync to the tip of the blockchain
      const latestLedger = await server.getLatestLedger();
      this.lastLedger = latestLedger.sequence;
      console.log(`✅ Synced to Soroban Testnet at Ledger: ${this.lastLedger}`);

      // Poll the RPC every 5 seconds (Stellar's block time)
      setInterval(() => this.pollEvents(), 5000);
    } catch (error) {
      console.error("❌ Failed to initialize Soroban listener. Ensure RPC is online.", error);
    }
  }

  private static async pollEvents() {
    // Prevent overlapping execution if a network request hangs
    if (this.isPolling) return;
    this.isPolling = true;

    const server = new rpc.Server(this.RPC_URL);
    const horizon = new Horizon.Server(this.HORIZON_URL);

    try {
      const latestLedgerResponse = await server.getLatestLedger();
      const currentLedger = latestLedgerResponse.sequence;

      if (currentLedger <= this.lastLedger) {
        this.isPolling = false;
        return; 
      }

      // ENTERPRISE FIX: Enforce Ledger Retention Limits
      // Soroban drops events older than ~24 hours. If we fall too far behind, we must 
      // safely snap forward to the retention boundary to avoid fatal 'BadRequest' crashes.
      const safeStartLedger = Math.max(this.lastLedger + 1, currentLedger - 17200);

      // Query the RPC for USDC 'transfer' events
      const events = await server.getEvents({
        startLedger: safeStartLedger,
        filters: [
          {
            type: "contract",
            contractIds: [this.USDC_CONTRACT_ID],
            topics: [
              // Wrap the topic in a nested array (string[][])
              [xdr.ScVal.scvSymbol("transfer").toXDR("base64")]
            ]
          }
        ],
        limit: 100
      });

      for (const event of events.events) {
        await this.processEvent(event, horizon);
      }

      this.lastLedger = currentLedger;
    } catch (error: any) {
      // Gracefully handle Soroban Event Ingestion Lag
      // The Event Indexer often lags 1-2 ledgers behind the Core network tip.
      // If we ask for a ledger it hasn't parsed yet, we silently drop the cycle. 
      // The next 5-second interval will automatically succeed once the indexer catches up.
      const errorStr = String(error?.message || error || "");
      if (errorStr.includes('startLedger must be within the ledger range')) {
        return; 
      }
      
      console.error("⚠️ Soroban polling error:", error);
    } finally {
      this.isPolling = false;
    }
  }

  private static async processEvent(event: rpc.Api.EventResponse, horizon: Horizon.Server) {
    try {
      if (event.topic.length < 3) return;

      const fromAddress = scValToNative(event.topic[1] as unknown as xdr.ScVal);
      const toAddress = scValToNative(event.topic[2] as unknown as xdr.ScVal);

      // 🛡️ ORIGIN FILTER LOG
      const isInternalVault = await db.select().from(escrows).where(eq(escrows.contractId, fromAddress)).limit(1);
      if (isInternalVault.length > 0) {
          console.log(`🛡️ Blocked Double-Credit: Ignoring internal Vault transfer from ${fromAddress}`);
          return; 
      }

      if (toAddress !== this.MASTER_BASE_ADDRESS) return;

      const amountInStroops = Number(scValToNative(event.value as unknown as xdr.ScVal));
      const amountUsdc = (amountInStroops / 10000000).toFixed(2);
      const txHash = event.txHash;

      const txDetails = await horizon.transactions().transaction(txHash).call();
      let targetMuxedId: string | null = null;
      if (txDetails.memo_type === "id") targetMuxedId = txDetails.memo || null; 

      // 🏦 UNALLOCATED DEPOSIT LOG
      if (!targetMuxedId) {
          console.log(`🏦 Unallocated Soroban deposit of ${amountUsdc} USDC received to Master Wallet. txHash: ${txHash}`);
          return; 
      }

      const subAccountResult = await db.select().from(subAccounts).where(eq(subAccounts.muxedId, targetMuxedId));
      
      // ⚠️ ORPHANED MEMO LOG
      if (subAccountResult.length === 0) {
          console.warn(`⚠️ Received payment for unknown Sub-Account ID: ${targetMuxedId}. txHash: ${txHash}`);
          return;
      }
      
      const subAccount = subAccountResult[0];

      // 1. THE NULL-BYPASS GUARD
      if (!event.id) {
          throw new Error(`CRITICAL: Soroban event missing unique ID. Cannot guarantee idempotency. txHash: ${txHash}`);
      }

      // 2. PRE-FLIGHT IDEMPOTENCY CHECK
      const existingTx = await db.select().from(transactions).where(eq(transactions.reference, event.id)).limit(1);
      if (existingTx.length > 0) {
          console.log(`🛡️ Pre-flight Lock: Soroban Event ${event.id} already processed. Skipping.`);
          return;
      }

      // 3. ATOMIC EXECUTION (Insert First, Balance Second)
      let absoluteNewBalance: string | null = null;
      let wasInserted = false;

      await db.transaction(async (txDB) => {
          
          const insertedTx = await txDB.insert(transactions).values({
              userId: subAccount.parentId, 
              subAccountId: subAccount.id, 
              amount: amountUsdc,
              type: "deposit",
              reference: event.id, 
              idempotencyKey: event.id, 
              txHash: txHash,      
              status: "completed",
              description: `On-Chain Direct USDC Deposit`,
          })
          .onConflictDoNothing({ target: transactions.reference })
          .returning(); 

          // 4. THE GRACEFUL LOCK
          if (insertedTx.length === 0) {
              console.log(`🛡️ Idempotency Lock: Deposit ${event.id} already recorded. Bypassing balance update.`);
              return; 
          }

          wasInserted = true;

          // 5. EXPLICIT TYPE CASTING (::numeric) AND RETURN ABSOLUTE BALANCE
          const [updatedSub] = await txDB.update(subAccounts)
              .set({ balance: sql`${subAccounts.balance} + ${amountUsdc}::numeric` })
              .where(eq(subAccounts.id, subAccount.id))
              .returning();
              
          absoluteNewBalance = updatedSub.balance;
      });

      if (!wasInserted) {
          return; 
      }

      console.log(`✅ [SMART CONTRACT SYNC] Credited ${amountUsdc} USDC to Sub-Account: ${subAccount.name} (ID:${targetMuxedId})`);

      // 🌟 EMIT ABSOLUTE STATE TO FRONTEND (Matches SorobanSweeper pattern)
      if (absoluteNewBalance) {
          sseService.emitToUser(subAccount.parentId, 'DEPOSIT_COMPLETED', {
              status: 'completed',
              amount: amountUsdc,
              fiatAmount: amountUsdc,
              accountId: subAccount.id,
              newBalance: absoluteNewBalance, // 🔥 THE ABSOLUTE STATE FIX
              transaction: {
                  id: event.id,
                  reference: event.id,
                  type: 'deposit',
                  amount: amountUsdc,
                  status: 'completed',
                  description: `On-Chain Direct USDC Deposit`
              }
          });
      }

      console.log(`✅ [SMART CONTRACT SYNC] Credited ${amountUsdc} USDC to Sub-Account: ${subAccount.name} (ID:${targetMuxedId})`);
    } catch (error: any) {
      if (error.code === '23505') return;
      console.error(`❌ Error processing Soroban event for tx ${event.txHash}:`, error);
    }
  }
}
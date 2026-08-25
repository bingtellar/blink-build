/**
 * ============================================================================
 * CRYPTO CONTROLLER -- (The Brain)
 * ============================================================================
 * Core engine for Blink's B2B crypto deposit routing.
 * 
 * Responsibilities:
 * Trigger: An asynchronous blockchain state change (a user sending USDC from Phantom/Lobstr directly to their Blink address).
 * Trust Model: Mathematical on-chain finality via the Stellar Horizon / Soroban RPC.
 * Action: The backend passively listens to the blockchain, detects the new balance, and logs a deposit receipt in the Postgres DB. There is no webhook involved at all.
 * ============================================================================
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { transactions, users } from '../schema';
import { logger } from '../logger';
import { eq, sql, and } from 'drizzle-orm'; 
import { EmailService } from '../services/EmailService'; 
import { 
    rpc, 
    TransactionBuilder, 
    Networks, 
    Keypair, 
    Transaction,
    Contract,
    Address,
    nativeToScVal,
    scValToNative 
} from '@stellar/stellar-sdk';

export const CryptoController = {
  
  initiateWithdrawal: async (req: Request, res: Response) => {
    try {
      const { userId, usdcAmount, networkFee, recipientDetails, signedXdr } = req.body;
      const totalDeduction = usdcAmount + networkFee;

      const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (userRecord.length === 0) return res.status(404).json({ error: "User not found." });

      const referenceId = `CW-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const isCrossChain = recipientDetails.network !== "Stellar";

      // =========================================================
      // 1. ATOMIC WRITE-AHEAD LOG (Prevents Concurrent Double-Spends)
      // =========================================================
      const createdTx = await db.transaction(async (txDB) => {
          const updatedUser = await txDB.update(users)
              .set({ balance: sql`CAST(${users.balance} AS NUMERIC) - ${totalDeduction}` })
              .where(and(
                  eq(users.id, userId),
                  sql`CAST(${users.balance} AS NUMERIC) >= ${totalDeduction}`
              ))
              .returning();

          if (updatedUser.length === 0) {
              throw new Error("Insufficient balance or concurrent transaction conflict.");
          }

          const inserted = await txDB.insert(transactions).values({
            userId: userId, 
            type: "withdrawal", 
            amount: usdcAmount.toString(),
            status: "processing", // 🔒 Locked in processing state
            trackingState: isCrossChain ? "bridging" : "settled", 
            description: `Crypto Withdrawal (${recipientDetails.network})`,
            reference: referenceId, 
            network: "crypto_transfer", 
            fiatAmount: usdcAmount.toString(), 
            fiatCurrency: "USDC", 
            exchangeRate: "1.00", 
            note: JSON.stringify(recipientDetails) 
          }).returning();

          return inserted[0];
      });

      if (!createdTx) return res.status(500).json({ error: "Failed to log transaction intent." });

      // =========================================================
      // 🚀 2. EXECUTE BLOCKCHAIN WITH DEEP XDR INSPECTION
      // =========================================================
      let confirmedTxHash = "processing...";
      try {
          const platformSecret = process.env.PLATFORM_FUNDING_SECRET; 
          if (!platformSecret) throw new Error("CRITICAL: PLATFORM_FUNDING_SECRET is missing");
          
          const innerTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET) as Transaction;
          
          // 🛡️ XDR INTEGRITY GUARD: Prevent Forgery Attacks
          if (innerTx.source !== userRecord[0].walletAddress) {
              logger.error(`[Security] XDR Forgery attempt. Source mismatch.`);
              throw new Error("Security validation failed: XDR source account does not match your registered wallet.");
          }
          if (innerTx.operations.length !== 1) {
              throw new Error("Security validation failed: XDR must contain exactly one operation.");
          }
          
          const op = innerTx.operations[0] as any;
          if (op.type !== 'invokeHostFunction') {
              throw new Error("Security validation failed: Invalid Soroban operation type.");
          }

          // In production, execute stellar-sdk host function unpacking here to verify destination/amount.
          
          const bingtellarGasKeypair = Keypair.fromSecret(platformSecret);
          const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(bingtellarGasKeypair, "100000", innerTx, Networks.TESTNET);
          feeBumpTx.sign(bingtellarGasKeypair);

          const server = new rpc.Server("https://soroban-testnet.stellar.org");
          const sendResponse = await server.sendTransaction(feeBumpTx);
          
          if (sendResponse.status === "ERROR") throw new Error("Mempool rejected execution.");

          // 🛡️ FINALITY LOCK: Wait for absolute ledger consensus
          let txStatus = await server.getTransaction(sendResponse.hash);
          let attempts = 0;
          while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              txStatus = await server.getTransaction(sendResponse.hash);
              attempts++;
          }

          if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Ledger failure: ${txStatus.status}`);
          confirmedTxHash = sendResponse.hash;

      } catch (blockchainError: any) {
          const errorMsg = blockchainError.message || blockchainError.toString();
          logger.error({ err: errorMsg }, "Soroban Execution Failed");
          
          // 🛡️ RPC BLINDSPOT LOCK: Do not refund on network timeouts
          const isAmbiguousRPC = errorMsg.includes('429') || errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET') || errorMsg.includes('503');
          if (isAmbiguousRPC) {
              await db.update(transactions).set({ 
                  status: 'locked', trackingState: "manual_intervention_required", description: "RPC polling timeout. Awaiting on-chain verification." 
              }).where(eq(transactions.id, createdTx.id));
              return res.status(500).json({ error: "Network congestion while verifying blockchain settlement. Your transaction is pending verification." });
          }

          // ♻️ STRICT NUMERIC ROLLBACK
          await db.transaction(async (txDB) => {
             await txDB.update(users).set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${totalDeduction}` }).where(eq(users.id, userId));
             await txDB.update(transactions).set({ status: 'failed', description: `Failed: ${errorMsg}` }).where(eq(transactions.id, createdTx.id));
          });
          return res.status(500).json({ error: "Network execution failed. Your funds have been restored." });
      }

      // =========================================================
      // ✅ 3. COMMIT SUCCESS
      // =========================================================
      await db.update(transactions).set({ 
          status: isCrossChain ? "pending" : "completed",
          txHash: confirmedTxHash 
      }).where(eq(transactions.id, createdTx.id));

      // 🌟 FIXED: DISPATCH WITHDRAWAL RECEIPT EMAIL
      try {
          const formattedDate = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          
          const rawAmount = usdcAmount.toString(); 
          const formattedFiatAmount = `${usdcAmount} USDC`; // 🌟 We put the currency string back!
          
          const emailResponse = await EmailService.sendWithdrawalSuccess(
              userRecord[0].email,
              rawAmount,            // usdcAmount (Template automatically adds "USDC" to this one)
              formattedFiatAmount,  // fiatAmount (Populates the Subject Line & "Amount to Receive")
              referenceId,
              formattedDate
          );

          // 🌟 THE RESEND SILENT FAILURE CATCH
          if (emailResponse && emailResponse.error) {
              console.error("❌ RESEND API REJECTED EMAIL:", emailResponse.error);
          } else {
              console.log(`✅ Withdrawal receipt successfully dispatched to ${userRecord[0].email}`);
          }
      } catch (emailError) {
          console.error("❌ CRITICAL EMAIL EXECUTION ERROR:", emailError);
      }

      res.status(201).json({
        success: true, transactionId: createdTx.id, reference: referenceId, blockchainTxHash: confirmedTxHash, status: isCrossChain ? "pending" : "completed"
      });
    } catch (error: any) {
      res.status(500).json({ error: "Internal server error during crypto withdrawal." });
    }
  },

  mintUsdc: async (req: Request, res: Response) => {
    try {
        if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: "Forbidden: Faucet is disabled in production." });

        const { destinationAddress, amount } = req.body;
        const adminSecret = process.env.PLATFORM_FUNDING_SECRET; 
        if (!adminSecret) throw new Error("Missing PLATFORM_FUNDING_SECRET");

        const rpcUrl = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
        const networkPassphrase = Networks.TESTNET;
        const nativeTokenId = process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

        const adminKeypair = Keypair.fromSecret(adminSecret);
        const server = new rpc.Server(rpcUrl);
        const adminAccount = await server.getAccount(adminKeypair.publicKey());
        const contract = new Contract(nativeTokenId); 
        const amountInStroops = Math.floor(amount * 10000000); 

        // 1. Execute On-Chain Mint
        const tx = new TransactionBuilder(adminAccount, { fee: "10000", networkPassphrase })
            .addOperation(contract.call("mint", Address.fromString(destinationAddress).toScVal(), nativeToScVal(amountInStroops, { type: "i128" })))
            .setTimeout(30).build();

        const simulatedTx = await server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(simulatedTx)) return res.status(400).json({ error: "Mint simulation failed." });

        const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build() as Transaction;
        assembledTx.sign(adminKeypair);
        const sendResponse = await server.sendTransaction(assembledTx);
        
        // 2. 🌟 SSOT BRIDGE: Log the transaction in Postgres so the UI updates during testing
        const userRecord = await db.select().from(users).where(eq(users.walletAddress, destinationAddress)).limit(1);
        if (userRecord.length > 0) {
            const user = userRecord[0];
            const newBalance = (parseFloat(user.balance || "0") + amount).toFixed(2);
            
            await db.update(users).set({ balance: newBalance }).where(eq(users.id, user.id));
            
            await db.insert(transactions).values({
                userId: user.id,
                type: "deposit",
                amount: amount.toString(),
                status: "completed",
                trackingState: "credited",
                description: "Dev Faucet Mint (Crypto)",
                reference: `DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                network: "crypto_transfer",
                txHash: sendResponse.hash
            });
        }

        return res.status(200).json({ success: true, message: `Successfully minted ${amount} Sandbox USDC`, txHash: sendResponse.hash });
    } catch (error: any) {
        logger.error({ err: error.message }, "Faucet Minting Error");
        res.status(500).json({ error: error.message });
    }
  }
};
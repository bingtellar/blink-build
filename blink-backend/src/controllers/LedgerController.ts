import { Request, Response } from 'express';
import { rpc, Contract, nativeToScVal, scValToNative, TransactionBuilder, Networks, Keypair, xdr } from '@stellar/stellar-sdk';
import { db } from '../db';
import { escrows } from '../schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
const USDC_ID = process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

export const LedgerController = {
  getOnChainTruth: async (req: Request, res: Response) => {
    try {
      const claimId = req.params.claimId as string;
      
      const dbRecord = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
      if (dbRecord.length === 0) {
          return res.status(404).json({ success: false, error: "Claim not found." });
      }
      
      const escrow = dbRecord[0];
      const contractId = escrow.contractId;

      // 🌟 THE FIX 1: The Terminal State Guard
      // If the escrow is already closed, don't waste RPC calls asking for a dead contract.
      const terminalStates = ['claim_canceled', 'claim_completed', 'claim_expired', 'failed'];
      const currentStatus = escrow.status?.toLowerCase() || '';

      if (terminalStates.includes(currentStatus)) {
          return res.status(200).json({
              success: true,
              data: {
                  principal: 0,
                  liveBalance: 0,
                  recipientYieldShare: 0,
                  status: currentStatus
              }
          });
      }

      if (!contractId) {
         return res.status(400).json({ success: false, error: "Vault Contract ID missing." });
      }

      let stateData: any = {};
      let totalBalance = 0;
      let remainingPrincipal = 0;

      // 🌟 THE FIX 2: Graceful RPC Failsafes & Instance Storage Unpacking
      // env.storage().instance() stores data inside the ContractInstance ledger entry.
      // We must fetch the Instance and unpack its internal storage array manually.
      try {
          // 1. Request the LedgerKey reserved specifically for the Contract's Instance metadata
          const instanceKey = xdr.ScVal.scvLedgerKeyContractInstance();
          const entry = await server.getContractData(contractId, instanceKey);
          
          if (entry) {
              // 2. Extract the raw ScVal using your already-verified working syntax
              const instanceScVal = entry.val.contractData().val();
                  
              // 3. Extract the internal storage map
              const contractInstance = instanceScVal.instance();
              // contractInstance.storage() returns the array of ScMapEntry items
              const storageMap = contractInstance.storage();
              
              if (storageMap && Array.isArray(storageMap)) {
                  // 4. Search the array for our exactly-cased "STATE" symbol
                  const stateEntry = storageMap.find((item: any) => {
                      try {
                          // item.key() safely returns the XDR key inside the map
                          return scValToNative(item.key()) === "STATE";
                      } catch (err) {
                          return false;
                      }
                  });

                  if (stateEntry) {
                      // 5. Decode the matching value back to a native JavaScript object
                      stateData = scValToNative(stateEntry.val());
                      remainingPrincipal = (Number(stateData.principal || 0) - Number(stateData.amount_claimed || 0)) / 10000000;
                  } else {
                      logger.debug(`[Ledger Verifier] STATE key not found inside the Vault's instance map.`);
                  }
              }
          }
      } catch (e: any) {
          logger.debug(`[Ledger Verifier] Vault Instance not found on-chain for ${contractId}. May be uninitialized.`);
      }

      try {
          const adminKey = Keypair.fromSecret(process.env.TREASURY_SECRET || process.env.PLATFORM_FUNDING_SECRET!);
          const account = await server.getAccount(adminKey.publicKey());
          const usdc = new Contract(USDC_ID);
          
          const tx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: process.env.NODE_ENV === "production" ? Networks.PUBLIC : Networks.TESTNET
          })
          .addOperation(usdc.call("balance", nativeToScVal(contractId, { type: "address" })))
          .setTimeout(30)
          .build();

          const simResult = await server.simulateTransaction(tx);
          if (rpc.Api.isSimulationSuccess(simResult)) {
              const rawBalance = Number(scValToNative(simResult.result!.retval));
              totalBalance = rawBalance / 10000000; 
          }
      } catch (e) {
          logger.debug(`[Ledger Verifier] USDC Balance check failed for ${contractId}.`);
      }
      
      let platformShare = 0;
      let recipientYield = 0;
      
      if (totalBalance > remainingPrincipal && remainingPrincipal > 0) {
        const totalYield = totalBalance - remainingPrincipal;
        const platformFeeBps = Number(stateData.platform_fee_bps || 1000);
        
        platformShare = (totalYield * platformFeeBps) / 10000;
        const netYield = totalYield - platformShare;
        
        const policyVal = stateData.yield_policy;
        const policy = typeof policyVal === "object" ? Object.keys(policyVal)[0] : policyVal?.toString();
        
        if (policy === "Split") {
            recipientYield = netYield / 2;
        } else if (policy === "Recipient") {
            recipientYield = netYield;
        }
      }

      const statusVal = stateData.status;
      const parsedStatus = typeof statusVal === "object" ? Object.keys(statusVal)[0] : (statusVal?.toString() || currentStatus);

      res.status(200).json({
         success: true,
         data: {
             principal: remainingPrincipal,
             liveBalance: totalBalance,
             recipientYieldShare: recipientYield,
             status: parsedStatus
         }
      });

    } catch (error: any) {
      // 🌟 THE FIX 3: Unpack hidden RPC JSON responses so you can actually read the error if it ever happens again.
      const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : (error.message || "Unknown RPC Exception");
      logger.error(`[Ledger Verifier] Execution Error: ${errorMsg}`);
      res.status(500).json({ success: false, error: "Failed to verify on-chain truth." });
    }
  }
};
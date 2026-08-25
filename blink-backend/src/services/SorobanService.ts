import {
  Keypair,
  TransactionBuilder,
  Networks,
  rpc, 
  Transaction,
  scValToNative,
  xdr,
  Contract,          
  nativeToScVal,     
  Address,
  Horizon,
  Account
} from '@stellar/stellar-sdk';
import { SequenceManager } from './SequenceManager';

export class SorobanService {
  private static RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
  private static NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;

  private static getSponsorKeypair(): Keypair {
    const secret = process.env.SPONSOR_SECRET_KEY;
    if (!secret) throw new Error("CRITICAL VULNERABILITY: SPONSOR_SECRET_KEY is missing from environment.");
    return Keypair.fromSecret(secret);
  }

  /**
   * Submits a user-signed XDR to the network, paying the gas fee on their behalf.
   * @returns The newly deployed Soroban Contract ID (String)
   */
  public static async submitSponsoredTransaction(clientSignedXdr: string): Promise<string> {
    // 🌟 THE FIX: Updated to rpc.Server
    const server = new rpc.Server(this.RPC_URL);
    const sponsorKeypair = this.getSponsorKeypair();

    try {
      // 1. Parse the client's pre-signed transaction
      const innerTx = TransactionBuilder.fromXDR(clientSignedXdr, this.NETWORK_PASSPHRASE) as Transaction;

      // 🌟 DYNAMIC GAS PRICING: Extract the exact simulated cost and add a network surge buffer
      // Soroban fees are baked into the inner transaction during the frontend's simulateTransaction step.
      const innerResourceFee = BigInt(innerTx.fee); 
      const standardBaseFee = 10000n; 
      const surgeBuffer = 500000n; // 0.05 XLM buffer for ledger state fluctuations
      
      // The max fee the Treasury is willing to pay to push this through
      const dynamicMaxFee = (innerResourceFee + standardBaseFee + surgeBuffer).toString();

      // 2. Build the precise Fee Bump
      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        sponsorKeypair,
        dynamicMaxFee, 
        innerTx,
        this.NETWORK_PASSPHRASE
      );

      // 3. Sponsor signs the wrapper
      feeBumpTx.sign(sponsorKeypair);

      // 4. Send to the Stellar network
      const sendResponse = await server.sendTransaction(feeBumpTx);

      // Beautifully decode Soroban XDR errors so you can actually read them in the logs.
      if (sendResponse.status === "ERROR" || (sendResponse as any).errorResult) {
        let decodedError = "Unknown On-Chain Error";
        
        // 🌟 THE FIX: Use the updated 'errorResult' property
        const errorData = (sendResponse as any).errorResult; 
        
        if (errorData) {
          try {
            // 🌟 THE SDK FIX: Safely parse both v11 Strings and v12+ ChildStruct Objects
            const result = typeof errorData === 'string'
                ? xdr.TransactionResult.fromXDR(errorData, "base64")
                : errorData as any;
            decodedError = JSON.stringify(result, null, 2);
          } catch (e) {
            decodedError = "Unparseable error XDR from network";
          }
        }
        throw new Error(`Network rejected transaction. Hash: ${sendResponse.hash}. \nDecoded Error: ${decodedError}`);
      }

      // 5. Poll the network until the transaction is fully processed
      let txStatus = await server.getTransaction(sendResponse.hash);
      let attempts = 0;
      
      // 🌟 THE FIX: Updated to rpc.Api.GetTransactionStatus
      while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 15) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        txStatus = await server.getTransaction(sendResponse.hash);
        attempts++;
      }

      // 🌟 THE FIX: Updated to rpc.Api.GetTransactionStatus
      if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction failed on-chain with status: ${txStatus.status}`);
      }

      // 6. Extract the newly deployed Vault's Contract ID from the return value
      if (txStatus.returnValue) {
        const newVaultAddress = scValToNative(txStatus.returnValue);
        return newVaultAddress; 
      }

      throw new Error("Transaction succeeded, but no Contract ID was returned. Check the Rust contract's return type.");
      
    } catch (error) {
      console.error("Sponsored Transaction Failed:", error);
      throw error;
    }
  }

  /**
   * Executes the on-chain vault claim. Paid and sponsored by the Treasury Gas Wallet.
   */
  /**
   * Executes the on-chain vault claim. Paid and sponsored by the Treasury Gas Wallet.
   */
  public static async executeClaimTransaction(
      contractId: string, 
      recipientAddress: string, 
      otpSecret: string, 
      principalAmount: string
  ): Promise<string> {
    const server = new rpc.Server(this.RPC_URL);
    const treasuryKeypair = this.getSponsorKeypair();
    const treasuryAddress = treasuryKeypair.publicKey();
    
    const MAX_RETRIES = 3;

    console.log(`💸 Executing on-chain claim for vault ${contractId} to recipient ${recipientAddress}`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const vaultContract = new Contract(contractId);
        const horizon = new Horizon.Server(
          this.NETWORK_PASSPHRASE === Networks.PUBLIC 
            ? "https://horizon.stellar.org" 
            : "https://horizon-testnet.stellar.org"
        );
        
        // 🌟 Always fetch the absolute latest sequence from the ledger on every attempt
        const accountInfo = await horizon.loadAccount(treasuryAddress);
        const account = new Account(treasuryAddress, accountInfo.sequence);

        const secretVal = nativeToScVal(Buffer.from(otpSecret, 'utf-8'), { type: 'bytes' });
        const recipientVal = Address.fromString(recipientAddress).toScVal();
        const amountInStroops = BigInt(Math.floor(parseFloat(principalAmount) * 10_000_000));
        const amountVal = nativeToScVal(amountInStroops, { type: "i128" });

        const tx = new TransactionBuilder(account, {
          fee: "100000",
          networkPassphrase: this.NETWORK_PASSPHRASE
        })
        .addOperation(vaultContract.call("claim", secretVal, recipientVal, amountVal))
        .setTimeout(180)
        .build();

        const simulatedTx = await server.simulateTransaction(tx);
        
        if (!rpc.Api.isSimulationSuccess(simulatedTx)) {
          throw new Error(`Blockchain Simulation Failed. Vault may be time-locked or OTP is invalid.`);
        }

        const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build();
        assembledTx.sign(treasuryKeypair);

        const sendResponse = await server.sendTransaction(assembledTx);

        // 🌟 Pre-flight Error Decoder
        if (sendResponse.status === "ERROR") {
          let decodedError = JSON.stringify(sendResponse); 
          const errorXdr = (sendResponse as any).errorResultXdr || (sendResponse as any).errorResult;
          
          if (errorXdr) {
            try {
              // 🌟 THE SDK FIX: Safely parse both v11 Strings and v12+ ChildStruct Objects
              const result = typeof errorXdr === 'string'
                  ? xdr.TransactionResult.fromXDR(errorXdr, "base64")
                  : errorXdr as any;
              decodedError = result.result().switch().name;
            } catch (e) {
               // Leave as stringified JSON if XDR parsing fails
            }
          }
          throw new Error(`Pre-flight rejection. Hash: ${sendResponse.hash}. Reason: ${decodedError}`);
        }

        // Poll for finality
        let txStatus = await server.getTransaction(sendResponse.hash);
        let pollAttempts = 0;
        
        while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && pollAttempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          txStatus = await server.getTransaction(sendResponse.hash);
          pollAttempts++;
        }

        // 🌟 Post-flight Validator Decoder
        if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
          let exactReason = "Unknown ledger rejection";
          
          if (txStatus.resultXdr) {
              try {
                  // 🌟 THE SDK FIX: Safely parse both v11 Strings and v12+ ChildStruct Objects
                  const result = typeof txStatus.resultXdr === 'string'
                      ? xdr.TransactionResult.fromXDR(txStatus.resultXdr, "base64")
                      : (txStatus.resultXdr as any);
                      
                  exactReason = `Result: ${result.result().switch().name}`;
                  
                  if (result.result().switch().name === 'txFailed') {
                      const ops = result.result().results();
                      if (ops && ops.length > 0) {
                          exactReason += ` | Op Error: ${ops[0].tr().switch().name}`;
                      }
                  }
              } catch (e) {
                   exactReason = "Could not extract result details";
              }
          }
          throw new Error(`Ledger Rejection (${exactReason}). Hash: ${sendResponse.hash}`);
        }

        if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
          throw new Error(`Transaction timed out or dropped from mempool. Status: ${txStatus.status}`);
        }

        console.log(`✅ Claim successfully executed on-chain. Hash: ${sendResponse.hash}`);
        return sendResponse.hash; // Success! Break out of the loop and return.
        
      } catch (error: any) {
        const errorString = error.message.toLowerCase();
        
        // 🌟 THE AUTO-RETRY ENGINE
        // If the error is a sequence collision, and we haven't hit our max retries, loop again!
        if ((errorString.includes('txbadseq') || errorString.includes('bad_seq')) && attempt < MAX_RETRIES) {
          console.warn(`⚠️ [Soroban] Sequence collision detected (Attempt ${attempt}/${MAX_RETRIES}). Retrying under the hood...`);
          await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for the current ledger to close before fetching the new sequence
          continue; 
        }

        // If it's a real error (like opNoTrust) or we exhausted our retries, throw it to the UI
        console.error(`❌ Failed to execute on-chain claim (Attempt ${attempt}):`, error.message);
        throw error;
      }
    }

    throw new Error("Transaction failed after maximum retries.");
  }


  /**
   * 🛡️ THE YIELD CHECK ORACLE:
   * Simulates the claim transaction to extract the exact USDC payout amount 
   * (accounting for dynamic yield splits or slashing) BEFORE executing it on-chain.
   */
  public static async simulateClaimPayout(
      contractId: string, 
      recipientAddress: string,
      senderAddress: string, // 🟢 NEW PARAMETER: Track the Sender
      otpSecret: string, 
      principalAmount: string
  ): Promise<{ exactUsdcOutput: number; senderYield: number }> { // 🟢 NEW RETURN TYPE
    const server = new rpc.Server(this.RPC_URL);
    const treasuryKeypair = this.getSponsorKeypair();

    try {
      const vaultContract = new Contract(contractId);
      const horizon = new Horizon.Server(
        this.NETWORK_PASSPHRASE === Networks.PUBLIC 
          ? "https://horizon.stellar.org" 
          : "https://horizon-testnet.stellar.org"
      );
      const seqNum = await SequenceManager.getNextSequence(treasuryKeypair.publicKey(), horizon);
      const account = new Account(treasuryKeypair.publicKey(), seqNum);

      const secretVal = nativeToScVal(Buffer.from(otpSecret, 'utf-8'), { type: 'bytes' });
      const recipientVal = Address.fromString(recipientAddress).toScVal();
      const amountInStroops = BigInt(Math.floor(parseFloat(principalAmount) * 10_000_000));
      const amountVal = nativeToScVal(amountInStroops, { type: "i128" });

      const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: this.NETWORK_PASSPHRASE
      })
      .addOperation(vaultContract.call("claim", secretVal, recipientVal, amountVal))
      .setTimeout(60)
      .build();

      const simulatedTx = await server.simulateTransaction(tx);
      
      if (!rpc.Api.isSimulationSuccess(simulatedTx)) {
        throw new Error(`Oracle Simulation Failed: Vault is locked or OTP is invalid.`);
      }

      let exactUsdcOutput = 0;
      let senderYield = 0; // 🟢 NEW: Track Sender Yield Independently

      // 🔍 Parse the Soroban Event Stream to find both transfer amounts
      if (simulatedTx.events) {
          for (const evt of simulatedTx.events) {
              if (evt.event().type().name !== "contract") continue;
              
              const topics = evt.event().body().v0().topics();
              
              // We are looking for the USDC `transfer` event: [symbol("transfer"), Address(from), Address(to)]
              if (topics.length === 3) {
                  try {
                      const eventName = scValToNative(topics[0]);
                      if (eventName === "transfer") {
                          const toAddress = scValToNative(topics[2]);
                          const stroops = scValToNative(evt.event().body().v0().data());
                          const parsedAmount = Number(stroops) / 10_000_000;
                          
                          // 🟢 THE FIX: Safely route the parsed amounts to the correct tracker
                          if (toAddress === recipientAddress) {
                              exactUsdcOutput = parsedAmount;
                          } else if (toAddress === senderAddress) {
                              senderYield = parsedAmount; 
                          }
                      }
                  } catch (e) {
                      // Silently skip unparseable standard ledger events
                  }
              }
          }
      }

      // Fallback if the recipient transfer event wasn't found (highly unlikely unless slashed to 0)
      if (exactUsdcOutput === 0) {
          console.warn(`[ORACLE WARNING] Could not parse exact yield from events. Falling back to principal.`);
          exactUsdcOutput = parseFloat(principalAmount);
      }

      return { exactUsdcOutput, senderYield }; // 🟢 Return both values

    } catch (error: any) {
      console.error("❌ Oracle Simulation Error:", error.message);
      throw error;
    }
  }

  /**
   * ⚙️ THE MATURITY CRANK:
   * Executes the `prepare_for_settlement` function on a specific vault.
   * This unwinds DeFindex strategy shares and returns liquid USDC to the vault's cold storage.
   */
  public static async executeCrankTransaction(contractId: string): Promise<string> {
    const server = new rpc.Server(this.RPC_URL);
    const treasuryKeypair = this.getSponsorKeypair(); 

    try {
      const vaultContract = new Contract(contractId);
      const horizon = new Horizon.Server(
        this.NETWORK_PASSPHRASE === Networks.PUBLIC 
          ? "https://horizon.stellar.org" 
          : "https://horizon-testnet.stellar.org"
      );
      const seqNum = await SequenceManager.getNextSequence(treasuryKeypair.publicKey(), horizon);
      const account = new Account(treasuryKeypair.publicKey(), seqNum);

      // 1. Build the lightweight settlement prep transaction
      const tx = new TransactionBuilder(account, {
        fee: "100000", // Standard low fee, since this is just an admin crank
        networkPassphrase: this.NETWORK_PASSPHRASE
      })
      .addOperation(vaultContract.call("prepare_for_settlement"))
      .setTimeout(60)
      .build();

      // 2. Prepare and Sign
      const preparedTx = await server.prepareTransaction(tx) as Transaction;
      preparedTx.sign(treasuryKeypair);

      // 3. Broadcast to Soroban
      const sendRes = await server.sendTransaction(preparedTx);
      
      if (sendRes.status === "PENDING") {
          const finalStatus = await this.pollTransactionStatus(server, sendRes.hash);
          if (finalStatus !== rpc.Api.GetTransactionStatus.SUCCESS) {
              throw new Error(`Crank execution failed on-chain with status: ${finalStatus}`);
          }
      } else if (sendRes.status === "ERROR") {
          throw new Error("Transaction rejected by network immediately.");
      }

      return sendRes.hash;

    } catch (error: any) {
      // We pass the raw error string up so the Sweeper can translate Soroban Error codes
      const errorString = String(error?.response?.data || error.message || "");
      throw new Error(errorString);
    }
  }


  /**
   * 🔄 HELPER: Polls the Soroban RPC network until a transaction confirms or fails.
   */
  public static async pollTransactionStatus(
      server: rpc.Server, 
      hash: string
  ): Promise<string> {
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 40 seconds total timeout

    while (attempts < MAX_ATTEMPTS) {
      const txResponse = await server.getTransaction(hash);
      
      if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return txResponse.status;
      }
      
      if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction Failed on-chain: ${JSON.stringify(txResponse)}`);
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    
    throw new Error(`Transaction ${hash} timed out while polling the network.`);
  }
  
}
import { rpc, Networks, Keypair, TransactionBuilder, Contract, nativeToScVal, Transaction, Address } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 UPDATED: Using the credentials from your latest successful deployment!
const VAULT_CONTRACT_ID = "CDBJIVBLGHR7GHSGV2XH6BCQQCMHZB4ZMOC5B5INDMTZPZJF4WLERRR5"; 
const SECRET_HEX = "7b2972907a4e06667a302da2ed574ee0aae319ab644e7d0f0ea0c74fac792b1d";

async function executeClaim() {
    console.log(`🌊 Starting Bingtellar Claim Protocol...`);
    console.log(`🎯 Target Vault: ${VAULT_CONTRACT_ID}`);

    const vault = new Contract(VAULT_CONTRACT_ID);
    
    // We are claiming the full 50.00 principal
    const claimAmount = 50000000n; 
    
    const account = await server.getAccount(alice.publicKey());

    // --- CONSTRUCT THE CLAIM PAYLOAD ---
    const claimTx = new TransactionBuilder(account, { 
        fee: "2000000", 
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(vault.call("claim", 
        nativeToScVal(Buffer.from(SECRET_HEX, "hex"), { type: 'bytes' }), // 1. The unhashed secret
        new Address(alice.publicKey()).toScVal(),                         // 2. Recipient Address
        nativeToScVal(claimAmount, { type: 'i128' })                      // 3. Amount to claim
    ))
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating Claim Transaction...");
    try {
        const preparedTx = await server.prepareTransaction(claimTx) as Transaction;
        preparedTx.sign(alice);
        
        console.log("📡 Broadcasting to Stellar Testnet...");
        const sentTx = await server.sendTransaction(preparedTx);
        console.log(`⏳ Waiting for network finality (Hash: ${sentTx.hash})...`);
        
        let txRes = await server.getTransaction(sentTx.hash);
        let attempts = 0;
        
        while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
            attempts++;
            console.log(`💓 Network Heartbeat (${attempts * 3}s)...`);
            await new Promise(r => setTimeout(r, 3000));
            txRes = await server.getTransaction(sentTx.hash);
            
            // 🟢 FIX: Increased to 40 attempts to match deploy script
            if (attempts > 40) break;
        }

        if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("-------------------------------------------------------");
            console.log("✅ SUCCESS: FUNDS CLAIMED SECURELY");
            console.log(`💰 Capital routed to: ${alice.publicKey()}`);
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ CLAIM FAILED.");
            console.error("Diagnostic Info:", txRes.status);
            console.log("🔍 View on Block Explorer:");
            console.log(`https://stellar.expert/explorer/testnet/tx/${sentTx.hash}`);
        }
    } catch (e: any) {
        // 🟢 THE CLAIM ERROR TRANSLATOR
        const errorString = String(e?.response?.data || e.message || "");
        
        console.log("-------------------------------------------------------");
        console.error("❌ TRANSACTION REJECTED BY SMART CONTRACT");
        
        if (errorString.includes("#8")) {
            console.error("⚠️  REASON: Vault is Not Ready.");
            console.error("💡 FIX: This vault is already claimed/cancelled, OR it's a Lock vault that hasn't been cranked yet.");
        } 
        else if (errorString.includes("#4")) {
            console.error("⚠️  REASON: Invalid Secret.");
            console.error("💡 FIX: You are using the wrong SECRET_HEX for this specific vault.");
        } 
        else if (errorString.includes("#5")) {
            console.error("⚠️  REASON: Time-Lock Not Expired.");
            console.error("💡 FIX: This is a Lock agreement and the maturity date hasn't passed yet.");
        }
        else if (errorString.includes("#10")) {
            console.error("⚠️  REASON: Escrow Expired.");
            console.error("💡 FIX: The 30-day window passed. The receiver can no longer claim; the sender must Reclaim.");
        }
        else {
            console.error("🔍 RAW ERROR:", errorString);
        }
        console.log("-------------------------------------------------------");
    }
}

executeClaim();
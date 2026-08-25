import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 PASTE THE VAULT ID HERE
const VAULT_CONTRACT_ID = "CBSKSCVUA2BACNCNVVWHVDGAL2NWVLCVYEQFEZIUZYAUDBDLIIC62O3P"; 

async function executeReclaim() {
    console.log(`🌊 Starting Bingtellar Reclaim Protocol...`);
    console.log(`🎯 Target Vault: ${VAULT_CONTRACT_ID}`);

    const vault = new Contract(VAULT_CONTRACT_ID);
    const account = await server.getAccount(alice.publicKey());

    // --- CONSTRUCT THE RECLAIM PAYLOAD ---
    // Rust Signature: pub fn reclaim(env: Env)
    const reclaimTx = new TransactionBuilder(account, { 
        fee: "2000000", 
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(vault.call("reclaim")) 
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating Reclaim Transaction...");
    try {
        const preparedTx = await server.prepareTransaction(reclaimTx) as Transaction;
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
            if (attempts > 40) break;
        }

        if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("-------------------------------------------------------");
            console.log("♻️ SUCCESS: ABANDONED FUNDS RECLAIMED");
            console.log(`↩️  Capital + Yield routed back to Sender: ${alice.publicKey()}`);
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ RECLAIM FAILED.");
            console.error("Diagnostic Info:", txRes.status);
        }
    } catch (e: any) {
        // 🟢 THE RECLAIM ERROR TRANSLATOR
        const errorString = String(e?.response?.data || e.message || "");
        
        console.log("-------------------------------------------------------");
        console.error("❌ TRANSACTION REJECTED BY SMART CONTRACT");
        
        if (errorString.includes("#8")) {
            console.error("⚠️  REASON: Vault is Not Active.");
            console.error("💡 FIX: This vault has already been Claimed, Cancelled, or Reclaimed. Deploy a fresh one!");
        } 
        else if (errorString.includes("#12") || errorString.includes("#5")) {
            console.error("⚠️  REASON: Escrow Not Expired.");
            console.error("💡 FIX: The time-lock is still active. Did you wait the full 60 seconds?");
        } 
        else {
            console.error("🔍 RAW ERROR:", errorString);
        }
        console.log("-------------------------------------------------------");
    }
}

executeReclaim();
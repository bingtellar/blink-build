import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 WHEN TESTING PLEASE PASTE YOUR VAULT ID HERE
const VAULT_CONTRACT_ID = "CCRZZ6PUHF5B5B3XVX7OBTGQN7BO46P4IEXBCUF5OYCYG5NXQJUOGAMR"; 

async function executeCancel() {
    console.log(`🌊 Starting BLINK Cancel/Undo Protocol...`);
    console.log(`🎯 Target Vault: ${VAULT_CONTRACT_ID}`);

    const vault = new Contract(VAULT_CONTRACT_ID);
    const account = await server.getAccount(alice.publicKey());

    // --- CONSTRUCT THE CANCEL PAYLOAD ---
    const cancelTx = new TransactionBuilder(account, { 
        fee: "2000000", 
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(vault.call("cancel")) 
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating Cancel Transaction...");
    try {
        const preparedTx = await server.prepareTransaction(cancelTx) as Transaction;
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
            console.log("🛑 SUCCESS: AGREEMENT CANCELLED SECURELY");
            console.log(`↩️  Net Refund routed back to Sender: ${alice.publicKey()}`);
            console.log("🏛️  Cancellation Penalty Fees routed to Treasury.");
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ CANCEL FAILED.");
            console.error("Diagnostic Info:", txRes.status);
        }
    } catch (e: any) {
        // 🟢 THE NEW ERROR TRANSLATOR
        const errorString = String(e?.response?.data || e.message || "");
        
        console.log("-------------------------------------------------------");
        console.error("❌ TRANSACTION REJECTED BY SMART CONTRACT");
        
        if (errorString.includes("#8")) {
            console.error("⚠️  REASON: Vault is Not Active.");
            console.error("💡 FIX: This vault has already been Claimed, Cancelled, or Refunded.");
        } 
        else if (errorString.includes("#6")) {
            console.error("⚠️  REASON: Unauthorized.");
            console.error("💡 FIX: Only the original Sender can cancel this vault.");
        } 
        else if (errorString.includes("#9")) {
            console.error("⚠️  REASON: Protocol Paused.");
            console.error("💡 FIX: The BLINK (Bingtellar) super admin has temporarily paused the protocol.");
        }
        else {
            console.error("🔍 RAW ERROR:", errorString);
        }
        console.log("-------------------------------------------------------");
    }
}

executeCancel();
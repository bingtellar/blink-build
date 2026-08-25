import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");

// 🟢 THE KEEPER BOT WALLET
// This can be Alice, or it can be a completely separate backend server wallet
// that just pays gas to "crank" the vaults.
const keeperBot = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 PASTE THE TARGET VAULT ID HERE
const VAULT_CONTRACT_ID = "PASTE_VAULT_ID_HERE"; 

async function executeCrank() {
    console.log(`🤖 Starting Bingtellar Keeper Bot (Crank)...`);
    console.log(`🎯 Target Vault: ${VAULT_CONTRACT_ID}`);

    const vault = new Contract(VAULT_CONTRACT_ID);
    const account = await server.getAccount(keeperBot.publicKey());

    // --- CONSTRUCT THE CRANK PAYLOAD ---
    // Rust Signature: pub fn prepare_for_settlement(env: Env)
    const crankTx = new TransactionBuilder(account, { 
        fee: "2000000", 
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(vault.call("prepare_for_settlement")) 
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating Crank Transaction...");
    try {
        const preparedTx = await server.prepareTransaction(crankTx) as Transaction;
        preparedTx.sign(keeperBot);
        
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
            console.log("⚙️  SUCCESS: VAULT SUCCESSFULLY CRANKED");
            console.log("🏦 Capital unwound from DeFindex. Status is now: READY");
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ CRANK FAILED.");
            console.error("Diagnostic Info:", txRes.status);
        }
    } catch (e: any) {
        console.error("❌ SIMULATION ERROR (Is it within 4 hours of claim time?):");
        console.error(e?.response?.data || e.message);
    }
}

executeCrank();
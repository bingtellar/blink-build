import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const arbitrator = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 WE PASTE THE ORPHANED VAULT ID HERE
const VAULT_CONTRACT_ID = "PASTE_ORPHANED_CONTRACT_ID_HERE"; 

async function executeClawback() {
    console.log(`🚨 Starting Bingtellar GOD MODE Clawback Protocol...`);
    const vault = new Contract(VAULT_CONTRACT_ID);
    const account = await server.getAccount(arbitrator.publicKey());

    const clawbackTx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: Networks.TESTNET })
    .addOperation(vault.call("admin_clawback")).setTimeout(180).build();

    try {
        const preparedTx = await server.prepareTransaction(clawbackTx) as Transaction;
        preparedTx.sign(arbitrator);
        const sentTx = await server.sendTransaction(preparedTx);
        
        let txRes = await server.getTransaction(sentTx.hash);
        let attempts = 0;
        while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 40) {
            attempts++; await new Promise(r => setTimeout(r, 3000));
            txRes = await server.getTransaction(sentTx.hash);
        }

        if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("🏦 SUCCESS: ORPHANED FUNDS SECURELY CLAWED BACK TO TREASURY");
        } else {
            console.error("❌ CLAWBACK FAILED.", txRes.status);
        }
    } catch (e: any) { console.error("❌ TRANSACTION REJECTED:", String(e?.response?.data || e.message || "")); }
}
executeClawback();
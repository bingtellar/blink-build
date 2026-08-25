import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// 💡 In production, you would fetch these IDs from your database: 
// SELECT vault_id FROM blink_vaults WHERE status = 'Active'
const VAULTS_TO_WATCH = [
    "CC5NLGOI55SOXNLVD36ZJSL3B7YAKODKMSBMQD6G47RKLEMTYDCTAHU7" 
];

if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET missing in .env");
const server = new rpc.Server(RPC_URL);
const adminKeypair = Keypair.fromSecret(ADMIN_SECRET);

async function runCrank() {
    console.log(`\n🤖 [${new Date().toLocaleTimeString()}] CRANK CYCLE STARTING...`);
    const account = await server.getAccount(adminKeypair.publicKey());

    for (const vaultId of VAULTS_TO_WATCH) {
        const vault = new Contract(vaultId);

        // 1. Check for 120h Idle Funds Deployment
        await attemptAction(account, vault, "evaluate_idle_funds", "🚀 DEPLOYING IDLE CAPITAL");

        // 2. Check for 4h Pre-Unwind Window
        await attemptAction(account, vault, "prepare_for_settlement", "📥 UNWINDING FOR MATURITY");
    }
}

async function attemptAction(account: any, vault: Contract, method: string, label: string) {
    const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: Networks.TESTNET })
        .addOperation(vault.call(method))
        .setTimeout(60)
        .build();

    try {
        // Simulation-Gating: If conditions (120h or 4h) aren't met, this throws an error
        // and we save on gas fees by not broadcasting.
        const prepared = await server.prepareTransaction(tx) as Transaction;
        prepared.sign(adminKeypair);
        
        // Add .toString() before .slice()
        console.log(`✨ ${label} for ${vault.address().toString().slice(0, 8)}...`);
        const response = await server.sendTransaction(prepared);
        console.log(`   Tx Hash: ${response.hash}`);
    } catch (e) {
        // Condition not met (e.g., Vault is only 2 hours old) - we just skip it.
    }
}

// Run every 15 minutes
setInterval(runCrank, 15 * 60 * 1000);
runCrank();
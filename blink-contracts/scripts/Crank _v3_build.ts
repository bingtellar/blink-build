import { 
    rpc, 
    Networks, 
    Keypair, 
    TransactionBuilder, 
    Contract, 
    Transaction 
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// 1. Initialize the Soroban RPC Server
const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");

// 2. Initialize the Admin/Keeper Keypair
if (!process.env.ADMIN_SECRET) {
    throw new Error("CRITICAL: ADMIN_SECRET is missing from .env file.");
}
const adminKeypair = Keypair.fromSecret(process.env.ADMIN_SECRET);

// 3. Define the vaults to monitor 
// (In production, you would fetch these dynamically from your backend DB where status = 'Active')
const VAULTS_TO_WATCH: string[] = [
    process.env.VAULT_ID || "", 
    // Add other active vault IDs here
].filter(Boolean); // Filters out any empty strings

// Ultimate Bingtellar Crank (Keeper Bot)
async function runCrank() {
    console.log(`⚙️ Starting Keeper Bot... Monitoring ${VAULTS_TO_WATCH.length} vaults.`);
    
    if (VAULTS_TO_WATCH.length === 0) {
        console.log("No active vaults to crank. Exiting.");
        return;
    }

    const account = await server.getAccount(adminKeypair.publicKey());

    for (const vaultId of VAULTS_TO_WATCH) {
        const vault = new Contract(vaultId);
        
        // 🛡️ Simulation-Gating: 
        // If it's not within the 4-hour window, 'prepareTransaction' will throw an error.
        // We catch that error and just move to the next vault, saving our gas!
        try {
            const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: Networks.TESTNET })
                .addOperation(vault.call("prepare_for_settlement")) // Unwind DeFindex strategy
                .setTimeout(60)
                .build();

            const prepared = await server.prepareTransaction(tx) as Transaction;
            prepared.sign(adminKeypair);
            
            console.log(`✨ Condition met! Unwinding Vault ${vaultId.slice(0, 8)}... for maturity...`);
            const txRes = await server.sendTransaction(prepared);
            console.log(`✅ Unwind Successful. Hash: ${txRes.hash}`);
            
        } catch (e: any) {
            // Condition not met (not 4h before unlock) - skip silently
            // Uncomment the line below if you want to see the skipped vaults in your console
            // console.log(`⏳ Vault ${vaultId.slice(0, 8)} is not yet ready for settlement.`);
        }
    }
    
    console.log("🏁 Keeper Bot cycle complete.");
}

// Execute the crank
runCrank();
import { rpc, Networks, Keypair, TransactionBuilder, Contract, nativeToScVal, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const admin = Keypair.fromSecret(process.env.ADMIN_SECRET!);

// 🟢 FIXED: We pull the fresh Vault ID dynamically from your .env
// so we don't accidentally interact with the old 'Zombie' vault
const VAULT_ID = process.env.VAULT_ID!;

async function claimYield() {
    console.log("🌊 Initializing Bingtellar Waterfall Settlement...");
    const vault = new Contract(VAULT_ID);
    const adminAddress = admin.publicKey();

    try {
        // --- STEP 1: PREPARE FOR SETTLEMENT (UNWIND) ---
        // Because this is a 'Lock' agreement, we must pull the funds out of DeFindex first
        console.log("\n🔓 Step 1: Unwinding funds from DeFindex Strategy...");
        let account = await server.getAccount(adminAddress);
        
        const prepareTx = new TransactionBuilder(account, { 
            fee: "100000", 
            networkPassphrase: Networks.TESTNET 
        })
        .addOperation(vault.call("prepare_for_settlement"))
        .setTimeout(60)
        .build();

        console.log("🧪 Simulating Unwind...");
        const preparedUnwind = await server.prepareTransaction(prepareTx) as Transaction;
        preparedUnwind.sign(admin);
        const unwindRes = await server.sendTransaction(preparedUnwind);
        console.log(`✅ Unwind Successful! Hash: ${unwindRes.hash}`);

        console.log("⏳ Sleeping for 5s to allow ledger indexing...");
        await new Promise(r => setTimeout(r, 5000));


        // --- STEP 2: CLAIM PRINCIPAL + YIELD ---
        console.log("\n💸 Step 2: Claiming Principal & Auto-Routing Fee Split...");
        
        // 🔐 PRODUCTION SECURITY: Pull the real secret from the environment
        const secretHex = process.env.CLAIM_SECRET;
        if (!secretHex) throw new Error("Missing CLAIM_SECRET in .env file");
        
        const secretVal = nativeToScVal(Buffer.from(secretHex, 'hex'), { type: 'bytes' });
        const recipientVal = nativeToScVal(adminAddress, { type: "address" });
        
        // We claim exactly our 5.00 USDC principal. 
        // The Rust contract will automatically tack on the yield!
        const claimAmount = 50000000n; 
        const amountVal = nativeToScVal(claimAmount, { type: "i128" });

        // Refresh the account sequence before the second transaction
        account = await server.getAccount(adminAddress); 
        
        const claimTx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: Networks.TESTNET
        })
        .addOperation(vault.call("claim", secretVal, recipientVal, amountVal))
        .setTimeout(60).build();

        console.log("🧪 Simulating Claim...");
        const preparedClaim = await server.prepareTransaction(claimTx) as Transaction;
        preparedClaim.sign(admin);
        const claimRes = await server.sendTransaction(preparedClaim);

        console.log(`\n🎉 VICTORY! Waterfall Broadcast: ${claimRes.hash}`);
        console.log("📱 Settlement Complete: Principal and Yield successfully claimed to Admin Wallet.");

    } catch (e: any) {
        console.error("\n💥 FATAL ERROR:", e.message || e);
    }
}

claimYield();
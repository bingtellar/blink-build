import { rpc, xdr, Networks, Keypair, TransactionBuilder, Contract, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");

// 🛡️ MUST be the Arbitrator's Private Key
const arbitratorKey = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

// 🟢 WE CONFIGURE THESE BEFORE RUNNING
const TARGET_VAULT_ID = "C_PASTE_TARGET_VAULT_ID_HERE"; 
const NEW_WASM_HASH_HEX = "PASTE_THE_64_CHAR_HEX_HASH_HERE"; 

async function executeWasmUpgrade() {
    console.log(`🚨 BREAK-GLASS: Initiating Live Smart Contract WASM Patch...`);
    console.log(`🎯 Target Vault: ${TARGET_VAULT_ID}`);
    console.log(`⚙️  New WASM Hash: ${NEW_WASM_HASH_HEX}`);

    const vault = new Contract(TARGET_VAULT_ID);
    const account = await server.getAccount(arbitratorKey.publicKey());

    // Convert the hex string hash into a 32-byte Buffer for Soroban BytesN<32>
    const hashBuffer = Buffer.from(NEW_WASM_HASH_HEX, 'hex');
    if (hashBuffer.length !== 32) throw new Error("Invalid WASM Hash length. Must be exactly 32 bytes (64 hex characters).");

    // Construct the payload: pub fn admin_upgrade_vault(env: Env, new_wasm_hash: BytesN<32>)
    // In Soroban JS SDK, BytesN<32> is passed as a standard buffer/bytes ScVal
    const wasmHashScVal = xdr.ScVal.scvBytes(hashBuffer);

    const upgradeTx = new TransactionBuilder(account, { 
        fee: "10000000", // Very high fee to ensure priority patching
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(vault.call("admin_upgrade_vault", wasmHashScVal)) 
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating WASM Bytecode Injection...");
    try {
        const preparedTx = await server.prepareTransaction(upgradeTx) as Transaction;
        preparedTx.sign(arbitratorKey);
        
        console.log("📡 Broadcasting Patch to Stellar Network...");
        const sentTx = await server.sendTransaction(preparedTx);
        
        let txRes = await server.getTransaction(sentTx.hash);
        let attempts = 0;
        while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 40) {
            attempts++; await new Promise(r => setTimeout(r, 3000));
            txRes = await server.getTransaction(sentTx.hash);
        }

        if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("-------------------------------------------------------");
            console.log("✅ SUCCESS: VAULT LOGIC UPGRADED IN-PLACE");
            console.log(`🔒 Vault ${TARGET_VAULT_ID} is now running the patched bytecode.`);
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ UPGRADE FAILED.", txRes.status);
        }
    } catch (e: any) {
        console.error("❌ TRANSACTION REJECTED:", String(e?.response?.data || e.message || ""));
    }
}

executeWasmUpgrade();
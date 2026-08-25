import { rpc, Networks, Keypair, TransactionBuilder, Contract, nativeToScVal, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const adminKeypair = Keypair.fromSecret(process.env.ADMIN_SECRET!);

// --- TEST CONFIG ---
// ⚠️ PASTE YOUR NEW VAULT ID HERE AFTER RUNNING DEPLOY_ESCROW.TS
const VAULT_ID = "CARXG3IXHLBFJVM2NVPY475B6JB3DWLOI7OI5QQ7YXN52CC7XZ5Z5WTM"; 
const CLAIM_SECRET_HEX = "0000000000000000000000000000000000000000000000000000000000000000";
const AMOUNT_IN_STROOPS = "10000"; 

// The Official Native XLM Smart Contract on Testnet
const NATIVE_XLM_CONTRACT = new Contract("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");

async function runStreamTest() {
    console.log("🌊 INITIALIZING BINK PROTOCOL STREAM TEST...");
    let account = await server.getAccount(adminKeypair.publicKey());

    // ==========================================
    // STEP 1: FUND THE VAULT (The missing link)
    // ==========================================
    console.log("\n💰 STEP 1: Transferring 1 XLM (Principal) to the Vault...");
    try {
        const fundTx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: Networks.TESTNET })
            .addOperation(NATIVE_XLM_CONTRACT.call(
                "transfer",
                nativeToScVal(adminKeypair.publicKey(), { type: 'address' }), // From Admin
                nativeToScVal(VAULT_ID, { type: 'address' }), // To Vault
                nativeToScVal("50000000", { type: 'i128' }) // 5 XLM to safely cover all fees!
            ))
            .setTimeout(60)
            .build();

        const preparedFund = await server.prepareTransaction(fundTx) as Transaction;
        preparedFund.sign(adminKeypair);
        const fundRes = await server.sendTransaction(preparedFund);

        let fundStatus = await server.getTransaction(fundRes.hash);
        while (fundStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
            await new Promise(r => setTimeout(r, 2000));
            fundStatus = await server.getTransaction(fundRes.hash);
        }

        if (fundStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("✅ VAULT SUCCESSFULLY FUNDED!");
        } else {
            console.log("❌ FUNDING FAILED:", (fundStatus as any).resultXdr);
            return; 
        }
    } catch (error: any) {
        console.error("❌ FUNDING CRASHED:", error.message);
        return;
    }

    // ==========================================
    // STEP 2: EXECUTE THE STREAMING CLAIMS
    // ==========================================
    console.log("\n🌊 STEP 2: STARTING 10-STEP STREAMING CLAIMS...");
    
    // Refresh account sequence number after the funding transaction
    account = await server.getAccount(adminKeypair.publicKey());
    const vault = new Contract(VAULT_ID);

    for (let i = 1; i <= 10; i++) {
        console.log(`\n⏳ Waiting 5 seconds for more funds to unlock mathematically...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        process.stdout.write(`📅 Stream ${i}/10: Requesting ${AMOUNT_IN_STROOPS} stroops... `);

        try {
            const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: Networks.TESTNET })
                .addOperation(vault.call(
                    "claim",
                    nativeToScVal(Buffer.from(CLAIM_SECRET_HEX, "hex"), { type: 'bytes' }),
                    nativeToScVal(adminKeypair.publicKey(), { type: 'address' }), 
                    nativeToScVal(AMOUNT_IN_STROOPS, { type: "i128" })
                ))
                .setTimeout(60)
                .build();

            const prepared = await server.prepareTransaction(tx) as Transaction;
            prepared.sign(adminKeypair);
            const res = await server.sendTransaction(prepared);

            let txRes = await server.getTransaction(res.hash);
            while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
                await new Promise(r => setTimeout(r, 2000));
                txRes = await server.getTransaction(res.hash);
            }

            if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
                console.log(`✅ CONFIRMED!`);
                account = await server.getAccount(adminKeypair.publicKey()); 
            } else {
                console.log(`❌ FAILED (Contract rejected the claim)`);
                break;
            }

        } catch (error: any) {
            console.error("\n❌ CRASHED:", error.message);
            break;
        }
    }
    
    console.log("\n🏁 STREAM TEST COMPLETE.");
}

runStreamTest();
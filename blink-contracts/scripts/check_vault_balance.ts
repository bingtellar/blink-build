import { rpc, Contract, nativeToScVal, scValToNative, TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const VAULT_ID = "CCRZZ6PUHF5B5B3XVX7OBTGQN7BO46P4IEXBCUF5OYCYG5NXQJUOGAMR";
const USDC_ID = "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

async function checkBalance() {
    console.log(`🔎 Auditing USDC Balance for Vault: ${VAULT_ID}`);
    const usdc = new Contract(USDC_ID);
    const adminKey = Keypair.fromSecret(process.env.ADMIN_SECRET!);

    try {
        // 1. Fetch the account to create a valid transaction structure
        const account = await server.getAccount(adminKey.publicKey());

        // 2. Build a transaction for simulation (we don't need to sign it)
        const tx = new TransactionBuilder(account, {
            fee: "100",
            networkPassphrase: Networks.TESTNET
        })
        .addOperation(usdc.call("balance", nativeToScVal(VAULT_ID, { type: "address" })))
        .setTimeout(30)
        .build();

        // 3. Simulate the transaction
        const result = await server.simulateTransaction(tx);

        // 4. Extract the return value
        if (rpc.Api.isSimulationSuccess(result)) {
            const rawBalance = scValToNative(result.result!.retval);
            const formattedBalance = (Number(rawBalance) / 10000000).toFixed(2);

            console.log("\n-------------------------------------------------------");
            console.log(`💰 ACTUAL BALANCE: ${formattedBalance} USDC`);
            console.log(`🔢 RAW (Atomic):   ${rawBalance}`);
            console.log("-------------------------------------------------------");
            console.log("🚀 Once you have this RAW number, use it in claim_with_yield.ts");
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ Simulation failed. The contract might not be found.");
        }

    } catch (e: any) {
        console.error("❌ Error during simulation:", e.message);
    }
}

checkBalance();
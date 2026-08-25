import { rpc, Networks, Keypair, TransactionBuilder, Contract, Transaction, Address, nativeToScVal } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");

// 🛡️ MUST be the current Treasury's Private Key
const currentTreasuryKey = Keypair.fromSecret(process.env.TREASURY_SECRET!); 

// 🟢 WE CONFIGURE THESE BEFORE RUNNING
const FACTORY_CONTRACT_ID = process.env.FACTORY_CONTRACT_ID!; 
const NEW_TREASURY_ADDRESS = "G_PASTE_NEW_SECURE_STELLAR_ADDRESS_HERE";

async function executeTreasuryRotation() {
    console.log(`🚨 BREAK-GLASS: Initiating Master Treasury Rotation...`);
    console.log(`🎯 Target Factory: ${FACTORY_CONTRACT_ID}`);
    console.log(`🏦 New Treasury Address: ${NEW_TREASURY_ADDRESS}`);

    const factory = new Contract(FACTORY_CONTRACT_ID);
    const account = await server.getAccount(currentTreasuryKey.publicKey());

    // Construct the payload: pub fn admin_update_treasury(env: Env, new_treasury: Address)
    const newTreasuryScVal = new Address(NEW_TREASURY_ADDRESS).toScVal();

    const rotationTx = new TransactionBuilder(account, { 
        fee: "5000000", // High fee for priority execution
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(factory.call("admin_update_treasury", newTreasuryScVal)) 
    .setTimeout(180) 
    .build();

    console.log("🧪 Simulating Treasury Rotation...");
    try {
        const preparedTx = await server.prepareTransaction(rotationTx) as Transaction;
        preparedTx.sign(currentTreasuryKey);
        
        console.log("📡 Broadcasting to Stellar Network...");
        const sentTx = await server.sendTransaction(preparedTx);
        
        let txRes = await server.getTransaction(sentTx.hash);
        let attempts = 0;
        while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 40) {
            attempts++; await new Promise(r => setTimeout(r, 3000));
            txRes = await server.getTransaction(sentTx.hash);
        }

        if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            console.log("-------------------------------------------------------");
            console.log("✅ SUCCESS: FACTORY TREASURY PERMANENTLY ROTATED");
            console.log(`🔒 All future fees will now route to: ${NEW_TREASURY_ADDRESS}`);
            console.log("-------------------------------------------------------");
        } else {
            console.error("❌ ROTATION FAILED.", txRes.status);
        }
    } catch (e: any) {
        console.error("❌ TRANSACTION REJECTED:", String(e?.response?.data || e.message || ""));
    }
}

executeTreasuryRotation();
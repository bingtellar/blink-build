import { config } from 'dotenv';
import { 
    rpc, 
    TransactionBuilder, 
    Networks, 
    Keypair, 
    Contract, 
    Address, 
    nativeToScVal,
    Transaction
} from '@stellar/stellar-sdk';

config(); 

const simulateExternalDeposit = async () => {
    // ⚠️ Ensure this is your test user's wallet address!
    const TARGET_USER_WALLET = "GCHHFGQBNBYODEEA2LSQW36IEAB5HVTRNUAYW3TLKS7DNPVSISYVLJF5";  
    const depositAmount = 10; 

    try {
        const TREASURY_SECRET = process.env.PLATFORM_FUNDING_SECRET;
        const NATIVE_TOKEN_ID = process.env.VITE_TESTNET_USDC || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

        if (!TREASURY_SECRET) throw new Error("Missing PLATFORM_FUNDING_SECRET in .env");

        const server = new rpc.Server(process.env.VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
        const senderKeypair = Keypair.fromSecret(TREASURY_SECRET);
        const tokenContract = new Contract(NATIVE_TOKEN_ID);

        const amountInStroops = BigInt(Math.floor(depositAmount * 10000000));
        const senderAddressScVal = new Address(senderKeypair.publicKey()).toScVal();
        const targetAddressScVal = new Address(TARGET_USER_WALLET).toScVal();
        const amountScVal = nativeToScVal(amountInStroops, { type: 'i128' });

        // ==========================================
        // 🚀 STEP 1: MINT USDC TO TREASURY WALLET
        // ==========================================
        console.log(`⏳ Step 1: Minting ${depositAmount} USDC to Treasury to ensure sufficient balance...`);
        const senderAccount = await server.getAccount(senderKeypair.publicKey());
        
        const mintTx = new TransactionBuilder(senderAccount, { fee: "10000", networkPassphrase: Networks.TESTNET })
            .addOperation(tokenContract.call("mint", senderAddressScVal, amountScVal))
            .setTimeout(60)
            .build();

        const simMint = await server.simulateTransaction(mintTx);
        if (!rpc.Api.isSimulationSuccess(simMint)) throw new Error("Mint Simulation Failed.");

        const assembledMint = rpc.assembleTransaction(mintTx, simMint).build() as Transaction;
        assembledMint.sign(senderKeypair);
        const mintResponse = await server.sendTransaction(assembledMint);
        
        if (mintResponse.status === "ERROR") {
            console.error("❌ Mint Error Details:", JSON.stringify(mintResponse, null, 2));
            throw new Error("Mint Broadcast Failed.");
        }
        console.log(`✅ Mint successful! Hash: ${mintResponse.hash}`);
        
        // Wait 8 seconds to guarantee the ledger closes so the simulation in Step 2 sees the new balance
        console.log("⏳ Waiting 8 seconds for the blockchain ledger to settle...");
        await new Promise(resolve => setTimeout(resolve, 8000));

        // ==========================================
        // 🚀 STEP 2: TRANSFER USDC TO USER (Triggers Sweeper)
        // ==========================================
        console.log(`\n⏳ Step 2: Simulating external transfer of ${depositAmount} USDC to ${TARGET_USER_WALLET}...`);
        
        // 🌟 THE FIX: We DO NOT fetch the account again.
        // The TransactionBuilder automatically incremented senderAccount's sequence number to N+1 during Step 1.

        const transferTx = new TransactionBuilder(senderAccount, { fee: "10000", networkPassphrase: Networks.TESTNET })
            .addOperation(tokenContract.call("transfer", senderAddressScVal, targetAddressScVal, amountScVal))
            .setTimeout(60)
            .build();

        const simTransfer = await server.simulateTransaction(transferTx);
        if (!rpc.Api.isSimulationSuccess(simTransfer)) throw new Error("Transfer Simulation Failed.");

        const assembledTransfer = rpc.assembleTransaction(transferTx, simTransfer).build() as Transaction;
        assembledTransfer.sign(senderKeypair);
        const transferResponse = await server.sendTransaction(assembledTransfer);

        if (transferResponse.status === "ERROR") {
            console.error("❌ Transfer Error Details:", JSON.stringify(transferResponse, null, 2));
            throw new Error("Transfer Broadcast Failed.");
        }
        console.log(`✅ Transfer submitted successfully! Hash: ${transferResponse.hash}`);
        
        console.log(`\n👀 Now, watch your backend terminal. Within ~10 seconds, the SorobanSweeper should log:`);
        console.log(`"[Soroban Sweeper] Valid unannounced USDC transfer identified!..."`);

    } catch (error) {
        console.error("❌ Execution Failed:", error);
    }
};

simulateExternalDeposit();
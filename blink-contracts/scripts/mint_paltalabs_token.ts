import { rpc, Networks, Keypair, TransactionBuilder, Contract, nativeToScVal, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const admin = Keypair.fromSecret(process.env.ADMIN_SECRET!);
const PALTALABS_TOKEN = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

async function mintTokens() {
    console.log("🪙 Initializing PaltaLabs Token Minting Process...");
    
    try {
        const account = await server.getAccount(admin.publicKey());
        const tokenContract = new Contract(PALTALABS_TOKEN);

        // We are going to mint 1,000.00 USDC (10,000,000,000 atomic units)
        // so you have plenty for testing.
        const mintAmount = 10000000000n; 

        // 🟢 STEP 1: Execute the mint function
        // Note: On testnet, these mock tokens usually leave the 'mint' function public 
        // so developers can fund themselves.
        const mintTx = new TransactionBuilder(account, { 
            fee: "100000", 
            networkPassphrase: Networks.TESTNET 
        })
        .addOperation(tokenContract.call("mint", 
            nativeToScVal(admin.publicKey(), { type: 'address' }),
            nativeToScVal(mintAmount, { type: 'i128' })
        ))
        .setTimeout(60)
        .build();

        console.log("🧪 Simulating Mint...");
        const preparedMint = await server.prepareTransaction(mintTx) as Transaction;
        preparedMint.sign(admin);
        
        console.log("🚀 Broadcasting Mint Transaction...");
        const mintRes = await server.sendTransaction(preparedMint);
        console.log(`✅ Mint Successful! Hash: ${mintRes.hash}`);
        console.log(`💰 You now have PaltaLabs Testnet USDC in your wallet.`);

    } catch (e: any) {
        console.error("\n💥 FATAL ERROR:", e.message || e);
    }
}

mintTokens();
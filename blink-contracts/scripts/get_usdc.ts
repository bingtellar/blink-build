import { rpc, Networks, Keypair, TransactionBuilder, Asset, Operation } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!);

const USDC_SYMBOL = "USDC";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const usdcAsset = new Asset(USDC_SYMBOL, USDC_ISSUER);

async function getUsdc() {
    console.log("💧 Starting USDC Faucet Script...");
    const account = await server.getAccount(alice.publicKey());

    const tx = new TransactionBuilder(account, { 
        fee: "100000", 
        networkPassphrase: Networks.TESTNET 
    })
    // 🔐 Step A: Establish trust (Defaults to max limit automatically)
    .addOperation(Operation.changeTrust({
        asset: usdcAsset
    }))
    // 💱 Step B: Swap XLM for exactly 10 USDC
    .addOperation(Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "100.0000000", 
        destAsset: usdcAsset,
        destAmount: "10.0000000", 
        destination: alice.publicKey(),
        path: [] 
    }))
    .setTimeout(60)
    .build();

    try {
        tx.sign(alice);
        const response = await server.sendTransaction(tx);
        console.log("✅ SUCCESS! You now have 10 USDC in your wallet.");
        console.log("🔗 Transaction Hash:", response.hash);
    } catch (e: any) {
        console.error("❌ SWAP FAILED:", e.response?.data?.extras?.result_codes || e.message);
    }
}

getUsdc();
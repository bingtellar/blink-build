import { rpc, Networks, Keypair, TransactionBuilder, Asset, Operation } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!);
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function refill() {
    console.log("🔄 Swapping XLM for 50 USDC...");
    
    const account = await server.getAccount(alice.publicKey());
    const usdcAsset = new Asset("USDC", USDC_ISSUER);

    const tx = new TransactionBuilder(account, { 
        fee: "100000", 
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "500", // Max 500 XLM to spend
        destination: alice.publicKey(),
        destAsset: usdcAsset,
        destAmount: "50", // Get exactly 50 USDC
        path: [] 
    }))
    .setTimeout(60)
    .build();

    tx.sign(alice);
    
    try {
        const result = await server.sendTransaction(tx);
        console.log("✅ SUCCESS! 50 USDC added to your wallet.");
        console.log(`🔗 Hash: ${result.hash}`);
    } catch (e: any) {
        console.error("❌ Swap Failed:", e.message);
    }
}

refill();
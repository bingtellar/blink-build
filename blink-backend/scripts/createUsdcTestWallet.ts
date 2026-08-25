import { Keypair, Horizon, Networks, TransactionBuilder, Asset, Operation } from '@stellar/stellar-sdk';

// ⚠️ Replace these with your exact Testnet USDC details
const USDC_ASSET_CODE = "USDC"; 
const USDC_ISSUER_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const createAndTrustWallet = async () => {
    console.log("⏳ Initializing new Testnet Wallet...");
    const server = new Horizon.Server("https://horizon-testnet.stellar.org");
    
    // 1. Generate Keypair
    const receiverKeypair = Keypair.random();
    console.log(`\n🔑 PUBLIC KEY: ${receiverKeypair.publicKey()}`);
    console.log(`🔐 SECRET KEY: ${receiverKeypair.secret()}`);

    // 2. Fund with Friendbot (Provides 10,000 test XLM)
    console.log("\n⏳ Requesting XLM from Friendbot...");
    const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(receiverKeypair.publicKey())}`;
    const response = await fetch(friendbotUrl);
    
    if (!response.ok) {
        throw new Error("Friendbot funding failed.");
    }
    console.log("✅ Wallet funded with test XLM.");

    // 3. Establish Trustline
    console.log(`⏳ Adding Trustline for ${USDC_ASSET_CODE}...`);
    const account = await server.loadAccount(receiverKeypair.publicKey());
    const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER_KEY);

    const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: Networks.TESTNET,
    })
    .addOperation(Operation.changeTrust({
        asset: usdcAsset,
    }))
    .setTimeout(30)
    .build();

    tx.sign(receiverKeypair);

    try {
        const txResult = await server.submitTransaction(tx);
        console.log(`✅ Trustline established! TX Hash: ${txResult.hash}`);
        console.log("\n🚀 This wallet is now ready to receive Bingtellar USDC withdrawals.");
    } catch (error: any) {
        console.error("❌ Failed to add trustline:", error.response?.data?.extras?.result_codes || error);
    }
};

createAndTrustWallet();
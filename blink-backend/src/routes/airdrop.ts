import { Router } from 'express';
import { Horizon, Keypair, Asset, TransactionBuilder, Networks, Operation } from '@stellar/stellar-sdk';

const router = Router();
const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");

// 🌟 1-CLICK DEVELOPER AIRDROP (Mint 5,000 USDC to any wallet)
// Notice the route is just '/mint-usdc/:address' here. We define the '/api/test' prefix in index.ts
router.get('/mint-usdc/:address', async (req, res) => {
  try {
    const targetAddress = req.params.address;
    const funderSecret = process.env.PLATFORM_FUNDING_SECRET;
    
    if (!funderSecret) throw new Error("Missing PLATFORM_FUNDING_SECRET");
    
    const funderKeypair = Keypair.fromSecret(funderSecret);
    const funderAccount = await horizonServer.loadAccount(funderKeypair.publicKey());
    
    // The asset is YOUR platform's USDC
    const usdcAsset = new Asset("USDC", funderKeypair.publicKey());

    // Send 5000 USDC to the target address
    const tx = new TransactionBuilder(funderAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({
        destination: targetAddress,
        asset: usdcAsset,
        amount: "5000.00"
      }))
      .setTimeout(30)
      .build();

    tx.sign(funderKeypair);
    const response = await horizonServer.submitTransaction(tx);
    
    res.json({ 
      success: true, 
      message: `Successfully minted 5,000 USDC to ${targetAddress}`,
      hash: response.hash 
    });
  } catch (error: any) {
    console.error("Airdrop failed:", error?.response?.data || error.message);
    res.status(500).json({ error: "Airdrop failed. Did the user secure their vault first?" });
  }
});

export default router;
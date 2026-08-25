import express from 'express';
import { 
    Horizon, 
    TransactionBuilder, 
    Networks, 
    rpc, 
    Contract, 
    nativeToScVal, 
    scValToNative 
} from '@stellar/stellar-sdk';

// IMPORT FOR THE SENTINEL CONTROLLERS
import { getSentinelTelemetry, manualKillSwitch, manualResumeProtocol } from '../controllers/admin.controller';

const router = express.Router();

// =====================================================================
// 🛡️ 1. CONFIGURATION & STARTUP GUARDS
// =====================================================================
const REQUIRED_VARS = ['TREASURY_ADDRESS', 'HOT_WALLET_ADDRESS', 'COLD_STORAGE_MULTISIG', 'USDC_ISSUER', 'STELLAR_NETWORK'];
REQUIRED_VARS.forEach(v => {
    if (!process.env[v]) {
        console.error(`🚨 CRITICAL STARTUP ERROR: Missing ${v} in environment variables.`);
        process.exit(1);
    }
});

const isMainnet = process.env.STELLAR_NETWORK === 'PUBLIC';
const HORIZON_URL = isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const RPC_URL = isMainnet ? "https://soroban-rpc.stellar.org" : "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = isMainnet ? Networks.PUBLIC : Networks.TESTNET;

const horizonServer = new Horizon.Server(HORIZON_URL);
const sorobanServer = new rpc.Server(RPC_URL);

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!; 
const HOT_WALLET_ADDRESS = process.env.HOT_WALLET_ADDRESS!; 
const COLD_STORAGE_MULTISIG = process.env.COLD_STORAGE_MULTISIG!;

// 🌟 FIX: This is a Soroban Contract ID, not a Classic Asset Issuer
const USDC_CONTRACT_ID = process.env.USDC_ISSUER!; 

// =====================================================================
// 2. HELPER: FETCH SOROBAN USDC BALANCE
// =====================================================================
async function getSorobanUsdcBalance(accountId: string): Promise<number> {
    try {
        const usdcContract = new Contract(USDC_CONTRACT_ID);
        const account = await horizonServer.loadAccount(accountId);
        
        const tx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(usdcContract.call(
            "balance", 
            nativeToScVal(accountId, { type: "address" })
        ))
        .setTimeout(30)
        .build();

        const simResult = await sorobanServer.simulateTransaction(tx);
        
        if (rpc.Api.isSimulationSuccess(simResult) && simResult.result?.retval) {
            // Soroban USDC uses 7 decimals (stroops)
            const stroops = Number(scValToNative(simResult.result.retval));
            return stroops / 10000000;
        }
        return 0;
    } catch (e) {
        console.warn(`Failed to fetch Soroban balance for ${accountId}`);
        return 0;
    }
}

// =====================================================================
// 3. FETCH LIVE LIQUIDITY METRICS
// =====================================================================
router.get('/', async (req, res) => {
    try {
        const [treasuryBalance, hotWalletBalance] = await Promise.all([
            getSorobanUsdcBalance(TREASURY_ADDRESS),
            getSorobanUsdcBalance(HOT_WALLET_ADDRESS)
        ]);

        res.json({
            usdcHotWallet: hotWalletBalance,
            uncollectedFees: treasuryBalance,
            fiatReserves: 85200.00, // TODO: Replace with live Mono/Paystack API call
            lastSweep: new Date().toISOString() 
        });
    } catch (error) {
        console.error("Failed to fetch ledger balances:", error);
        res.status(500).json({ error: "Failed to sync liquidity." });
    }
});

// =====================================================================
// 4. PREPARE THE RAW XDR (NO PRIVATE KEYS REQUIRED)
// =====================================================================
router.post('/prepare-sweep', async (req, res) => {
    try {
        const treasuryAccount = await horizonServer.loadAccount(TREASURY_ADDRESS);
        const usdcContract = new Contract(USDC_CONTRACT_ID);
        
        // 1. Fetch exact balance in stroops using simulate
        const balanceTx = new TransactionBuilder(treasuryAccount, {
            fee: "100000",
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(usdcContract.call(
            "balance", 
            nativeToScVal(TREASURY_ADDRESS, { type: "address" })
        ))
        .setTimeout(30)
        .build();

        const simResult = await sorobanServer.simulateTransaction(balanceTx);
        if (!rpc.Api.isSimulationSuccess(simResult) || !simResult.result?.retval) {
            return res.status(400).json({ error: "Could not verify Treasury balance on Soroban." });
        }

        const sweepAmountStroops = BigInt(scValToNative(simResult.result.retval));

        if (sweepAmountStroops <= BigInt(0)) {
            return res.status(400).json({ error: "No fees to sweep." });
        }

        // 2. Build the actual Soroban Transfer transaction
        const tx = new TransactionBuilder(treasuryAccount, {
            fee: "100000",
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(usdcContract.call(
            "transfer",
            nativeToScVal(TREASURY_ADDRESS, { type: "address" }),
            nativeToScVal(COLD_STORAGE_MULTISIG, { type: "address" }),
            nativeToScVal(sweepAmountStroops, { type: "i128" })
        ))
        .setTimeout(180) // Admin has 3 minutes to sign in Freighter
        .build();

        // 3. You MUST simulate Soroban transactions before signing them to calculate footprints
        const finalSimulation = await sorobanServer.simulateTransaction(tx);
        
        if (!rpc.Api.isSimulationSuccess(finalSimulation)) {
             return res.status(400).json({ error: "Soroban transfer simulation failed." });
        }

        // 4. Assemble the final transaction with the required auth footprints
        const assembledTx = rpc.assembleTransaction(tx, finalSimulation) as any;

        res.json({ 
            xdr: assembledTx.toXDR(), 
            network: process.env.STELLAR_NETWORK 
        });

    } catch (error) {
        console.error("Failed to prepare XDR:", error);
        res.status(500).json({ error: "Failed to prepare sweep transaction." });
    }
});

// =====================================================================
// 5. BROADCAST THE SIGNED XDR TO THE NETWORK
// =====================================================================
router.post('/submit-sweep', async (req, res) => {
    try {
        const { signedXdr } = req.body;

        if (!signedXdr || typeof signedXdr !== 'string') {
            return res.status(400).json({ error: "Missing or invalid signed XDR payload." });
        }

        const transaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
        
        // 🌟 FIX: Submit via the Soroban RPC, not Horizon
        const response = await sorobanServer.sendTransaction(transaction as any);

        if (response.status === 'ERROR') {
             throw new Error("Soroban Network rejected the transaction.");
        }

        res.json({
            success: true,
            hash: response.hash,
            status: response.status
        });

    } catch (error: any) {
        console.error("Network Submission Error:", error);
        res.status(500).json({ 
            error: "Transaction failed on the network.",
            details: error.message 
        });
    }
});

// =====================================================================
// 🛡️ 6. SECURITY SENTINEL & CIRCUIT BREAKERS
// =====================================================================
router.get('/telemetry', getSentinelTelemetry);
router.post('/kill-switch', manualKillSwitch);
router.post('/resume', manualResumeProtocol);

export default router;
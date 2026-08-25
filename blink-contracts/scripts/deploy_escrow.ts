import { 
    rpc, 
    Networks, 
    Keypair, 
    TransactionBuilder, 
    Contract, 
    nativeToScVal, 
    xdr, 
    scValToNative, 
    Address, 
    Account,
    Transaction // Added explicit type import for safety
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!); 
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!;

async function deploy() {
    console.log("🌊 Starting Bingtellar Vault Deployment Protocol (Single-Step Auth)...");
    
    // const AGREEMENT_TYPE: "Instant" | "Lock" = "Instant"; 

    // 🛡️ THE FIX: Typed as a generic string to bypass strict CFA narrowing.
    // Toggle this between "Instant" and "Lock" when deploying different vault types.
    const AGREEMENT_TYPE: string = "Instant";
    
    const factory = new Contract("CBXX6PF5CYXFNYNTGWOEERN5BLOTREMRCS66ZHHRPTAFYEFXQXC6TYCM"); 
    const DEFINDEX_VAULT = process.env.DEFINDEX_VAULT_ADDRESS!;
    const vaultWasmHash = process.env.VAULT_WASM_HASH!;
    const ASSET_ADDRESS = process.env.TESTNET_USDC!;
    
    const PRINCIPAL_AMOUNT = 50000000n;        // 5.00 XLM/USDC
    const BASE_FEE_AMOUNT = 10000000n;         // $1.00 Fee
    const CANCELLATION_FEE_AMOUNT = 10000000n; // $1.00 Penalty
    const principalVal = nativeToScVal(PRINCIPAL_AMOUNT, { type: "i128" });

    // --- STEP 1: GENERATE CRYPTOGRAPHIC LOCK ---
    console.log(`🚀 Step 1: Generating Security Credentials and Deploying ${AGREEMENT_TYPE} Vault...`);
    
    const secureSecret = crypto.randomBytes(32);
    const claimHash = crypto.createHash('sha256').update(secureSecret).digest();
    
    console.log("-------------------------------------------------------");
    console.log("🔐 SECURITY ALERT: YOUR CLAIM SECRET HAS BEEN GENERATED");
    console.log(`🔑 SECRET (Hex): ${secureSecret.toString('hex')}`);
    console.log("-------------------------------------------------------");

    const now = BigInt(Math.floor(Date.now() / 1000));
    const thirtyDaysInSeconds = BigInt(30 * 24 * 60 * 60);

    const claimableAtVal = AGREEMENT_TYPE === "Lock" 
        ? nativeToScVal(now + 60n, { type: 'u64' }) 
        : xdr.ScVal.scvVoid();
        
    const expiryVal = nativeToScVal(now + thirtyDaysInSeconds, { type: 'u64' });

    // --- STEP 2: CONSTRUCT FACTORY PAYLOAD ---
    // Note: Soroban Maps MUST be alphabetically sorted by key. This is perfectly sorted.
    const configMap = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("agreement_type"), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(AGREEMENT_TYPE)]) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("asset"), val: new Address(ASSET_ADDRESS).toScVal() }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("base_fee"), val: nativeToScVal(BASE_FEE_AMOUNT, { type: "i128" }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("cancellation_fee"), val: nativeToScVal(CANCELLATION_FEE_AMOUNT, { type: "i128" }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("claim_hash"), val: nativeToScVal(claimHash, { type: 'bytes' }) }), 
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("claimable_at"), val: claimableAtVal }), 
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("defindex_address"), val: new Address(DEFINDEX_VAULT).toScVal() }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("expiry_timestamp"), val: expiryVal }), 
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("platform_address"), val: new Address(TREASURY_ADDRESS).toScVal()}),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("platform_fee_bps"), val: nativeToScVal(500, { type: 'u32' }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("principal"), val: principalVal }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("reserve_ratio_bps"), val: nativeToScVal(1000, { type: 'u32' }) }), 
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("sender"), val: new Address(alice.publicKey()).toScVal() }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("share_token_address"), val: new Address(DEFINDEX_VAULT).toScVal() }),
    ]);

    // --- STEP 3: ASSEMBLE WITH SINGLE-STEP AUTH ---
    console.log(`🧪 Simulating ${AGREEMENT_TYPE} Agreement Deployment to calculate Auth Footprint...`);
    
    // Fetch base account sequence number
    const baseAccount = await server.getAccount(alice.publicKey());
    const simAccount = new Account(alice.publicKey(), baseAccount.sequenceNumber());

    // Build raw transaction
    const deployTx = new TransactionBuilder(simAccount, { 
        fee: "10000000", // Buffer gas for simulation
        networkPassphrase: Networks.TESTNET 
    })
    .addOperation(factory.call("deploy_escrow", 
        nativeToScVal(Buffer.from(vaultWasmHash, "hex"), { type: 'bytes' }), 
        nativeToScVal(crypto.randomBytes(32), { type: 'bytes' }), 
        configMap 
    ))
    .setTimeout(180) 
    .build();

    // Simulate to generate the required Auth Entries
    const simulatedTx = await server.simulateTransaction(deployTx);
    
    if (rpc.Api.isSimulationError(simulatedTx)) {
        console.error("🚨 Simulation Failed:", simulatedTx.error);
        throw new Error("Simulation trapped. Make sure Treasury has a trustline and Sender has funds.");
    }

    console.log("✅ Simulation successful. Assembling cryptographic auth tree...");

    // Assemble and Sign (The single-step magic happens here)
    const assembledTx = rpc.assembleTransaction(deployTx, simulatedTx).build() as Transaction;
    assembledTx.sign(alice);

    // --- STEP 4: BROADCAST ---
    console.log("🚀 Submitting to Ledger...");
    const sentDeploy = await server.sendTransaction(assembledTx);
    
    if (sentDeploy.status === "ERROR") {
        throw new Error("Network rejected deployment submission.");
    }

    console.log("📡 Broadcast Successful! Hash:", sentDeploy.hash);
    
    // Poll for Transaction Finality
    let txRes = await server.getTransaction(sentDeploy.hash);
    let attempts = 0;
    while (txRes.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
        attempts++;
        console.log(`💓 Network Heartbeat (${attempts * 3}s)...`);
        await new Promise(r => setTimeout(r, 3000));
        txRes = await server.getTransaction(sentDeploy.hash);
        if (attempts > 40) break; 
    }

    if (txRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        const newVaultId = scValToNative(txRes.returnValue!);
        console.log("-------------------------------------------------------");
        console.log(`🔥 SUCCESS: BINGTELLAR ${AGREEMENT_TYPE.toUpperCase()} VAULT IS LIVE`);
        console.log(`📍 VAULT CONTRACT ID: ${newVaultId}`);

        if (AGREEMENT_TYPE === "Lock") {
            console.log("💰 Capital has been routed to the DeFindex yield strategy.");
        } else if (AGREEMENT_TYPE === "Instant") {
            console.log("🏦 Capital is securely held natively inside the Vault.");
        }
        
        console.log("🔍 Verifying Treasury Revenue...");
        const tokenContract = new Contract(ASSET_ADDRESS);
        const balanceTx = new TransactionBuilder(await server.getAccount(alice.publicKey()), { fee: "1000", networkPassphrase: Networks.TESTNET })
            .addOperation(tokenContract.call("balance", new Address(TREASURY_ADDRESS).toScVal()))
            .setTimeout(30).build();
        
        const simResponse = await server.simulateTransaction(balanceTx);
        if (rpc.Api.isSimulationSuccess(simResponse)) {
            const balanceVal = scValToNative(simResponse.result!.retval);
            console.log(`🏦 Bingtellar Treasury Balance: $${(Number(balanceVal) / 10000000).toFixed(2)}`);
        }
        console.log("-------------------------------------------------------");
    } else {
        console.error("❌ DEPLOYMENT FAILED OR DROPPED BY NETWORK.");
        console.error("Diagnostic Status:", txRes.status);
        console.log(`🔍 Explorer: https://stellar.expert/explorer/testnet/tx/${sentDeploy.hash}`);
    }
}

deploy();
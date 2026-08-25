/**
 * ============================================================================
 * FIAT CONTROLLER -- (The Brain)
 * ============================================================================
 * Core engine for Blink's B2B fiat-to-crypto liquidity routing.
 * 
 * Responsibilities:
 * - Interfacing with the Bingtellar API for quotes and execution.
 * - Managing Stellar/Soroban blockchain state (fee-bumping, minting).
 * - Enforcing Idempotency to prevent double-spending during network drops.
 * - Handling autonomous Webhook finality and cryptographic verification.
 * ============================================================================
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db'; 
import { transactions, users, escrows } from '../schema';
import { logger } from '../logger';
import { eq, or, sql, inArray, desc, and } from 'drizzle-orm';
import { NotificationService } from '../services/NotificationService';
import { sseService } from '../services/SSEService';
import { EmailService } from '../services/EmailService'; 

import { 
    rpc, 
    TransactionBuilder, 
    Networks, 
    Keypair, 
    Transaction, 
    Contract, 
    Address, 
    nativeToScVal,
    scValToNative
} from '@stellar/stellar-sdk'; 

// ============================================================================
// ⚙️ CONFIGURATION & ENVIRONMENT LOADERS
// ============================================================================

const getBingtellarConfig = () => ({
  url: process.env.BINGTELLAR_API_URL || "https://api.bingtellar.com",
  key: process.env.BINGTELLAR_API_KEY
});

export const getStellarConfig = () => ({
    rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
    networkPassphrase: process.env.NODE_ENV === 'production' ? Networks.PUBLIC : Networks.TESTNET,
    nativeTokenId: process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ"
});

const FIAT_CONFIG = {
  NGN: {
    methods: ['bank_transfer'], rateToUsdc: 1410.50, rateToFiat: 1380.00, 
    instructions: { bank_transfer: { bankName: "Guaranty Trust Bank (GTB)", accountName: "Bingtellar Operations Ltd", accountNumber: "0123456789", note: "Please include your Reference ID in the transfer description." } }
  },
  KES: {
    methods: ['mobile_money', 'bank_transfer'], rateToUsdc: 135.20, rateToFiat: 130.00, 
    instructions: {
      mobile_money: { provider: "M-PESA", paybillNumber: "888888", accountNumber: "BINGTELLAR", note: "Use your Reference ID as the account number." },
      bank_transfer: { bankName: "Equity Bank", accountName: "Bingtellar Kenya", accountNumber: "111222333444", note: "Transfers may take up to 2 hours to clear." }
    }
  },
  GHS: {
    methods: ['mobile_money'], rateToUsdc: 13.50, rateToFiat: 13.00,
    instructions: { mobile_money: { provider: "MTN Mobile Money", merchantId: "123456", note: "Use your Reference ID as the reference." } }
  }
};

export const executeOnChainRefund = async (destinationAddress: string, amountUsdc: number, reason: string) => {
    try {
        const { rpcUrl, networkPassphrase, nativeTokenId } = getStellarConfig();
        const TREASURY_SECRET = process.env.PLATFORM_FUNDING_SECRET; 
        if (!TREASURY_SECRET) throw new Error("Missing treasury credentials for refund");

        const amountInStroops = BigInt(Math.floor(amountUsdc * 10000000));
        const server = new rpc.Server(rpcUrl);
        const adminKeypair = Keypair.fromSecret(TREASURY_SECRET);
        const adminAccount = await server.getAccount(adminKeypair.publicKey());
        const tokenContract = new Contract(nativeTokenId);

        const refundTx = new TransactionBuilder(adminAccount, { fee: "1000", networkPassphrase })
            .addOperation(tokenContract.call("mint", new Address(destinationAddress).toScVal(), nativeToScVal(amountInStroops, { type: 'i128' })))
            .setTimeout(30).build();

        refundTx.sign(adminKeypair);
        const sendResponse = await server.sendTransaction(refundTx);
        
        logger.info(`[Refund Engine] Refunded ${amountUsdc} USDC to ${destinationAddress}. Hash: ${sendResponse.hash}. Reason: ${reason}`);
        return sendResponse.hash;
    } catch (error: any) {
        logger.error(`[CRITICAL ALERT] Refund Engine failed: ${error.message}`);
        await NotificationService.alertAdmin('fiat_alert', 'URGENT: Refund Failed', `System failed to auto-refund ${amountUsdc} USDC to ${destinationAddress}.`);
        return null;
    }
};

// ============================================================================
// 🚦 CORE EXPORTS (THE CONTROLLER)
// ============================================================================

export const FiatController = {
  
    getConfig: async (req: Request, res: Response) => {
        try {
            const { url, key } = getBingtellarConfig();
            if (!key) {
                logger.warn("No BINGTELLAR_API_KEY found! Serving static fallback rates.");
                return res.json({ success: true, supportedCurrencies: Object.keys(FIAT_CONFIG), config: FIAT_CONFIG });
            }

            const updatedConfig = JSON.parse(JSON.stringify(FIAT_CONFIG));
      
            for (const currency of Object.keys(FIAT_CONFIG)) {
                try {
                    const [onrampRes, offrampRes] = await Promise.all([
                        fetch(`${url}/api/v1/b2b/rates?asset=USDC&fiatCurrency=${currency}&type=onramp`, { method: "GET", headers: { "x-api-key": key } }),
                        fetch(`${url}/api/v1/b2b/rates?asset=USDC&fiatCurrency=${currency}&type=offramp`, { method: "GET", headers: { "x-api-key": key } })
                    ]);

                    if (onrampRes.ok) {
                        const onrampPayload = await onrampRes.json();
                        const onrampRate = onrampPayload.rate || onrampPayload.data?.rate || onrampPayload.data?.indicativeRate || onrampPayload.indicativeRate;
                        if (onrampRate) {
                            updatedConfig[currency].rateToUsdc = Number(parseFloat(onrampRate).toFixed(2));
                        }
                    }

                    if (offrampRes.ok) {
                        const offrampPayload = await offrampRes.json();
                        const offrampRate = offrampPayload.rate || offrampPayload.data?.rate || offrampPayload.data?.indicativeRate || offrampPayload.indicativeRate;
                        if (offrampRate) {
                            updatedConfig[currency].rateToFiat = Number(parseFloat(offrampRate).toFixed(2));
                        }
                    }
                } catch (rateErr) {
                    logger.warn(`Failed to fetch live rate for ${currency}, using static fallback.`);
                }
            }

            res.json({ success: true, supportedCurrencies: Object.keys(updatedConfig), config: updatedConfig });
        } catch (error) {
            logger.error({ err: error }, "Failed to resolve live fiat config matrix");
            res.status(500).json({ error: "Internal server error fetching dynamic configuration." });
        }
    },

    initiateDeposit: async (req: Request, res: Response) => {
        try {
            const { userId, fiatAmount, fiatCurrency, paymentMethod, destinationAddress } = req.body;
            const { url, key } = getBingtellarConfig();

            if (!key) throw new Error("Server missing BINGTELLAR_API_KEY configuration.");

            const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            if (userRecord.length === 0) return res.status(404).json({ error: "User not found." });
            const user = userRecord[0];

            const mappedCollectionMethod = paymentMethod === "bank_transfer" ? "BANK_ACCOUNT" : "MOBILE_MONEY";
            const internalDepositRef = `DP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

            const quotePayload = {
                asset: "USDC", currency: fiatCurrency, amount: fiatAmount,
                network: "STELLAR", fixedSide: "fiat", collectionMethod: mappedCollectionMethod
            };

            const quoteRes = await fetch(`${url}/api/v1/b2b/onramp/quotes`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": key, "x-idempotency-key": `${internalDepositRef}-QUOTE` },
                body: JSON.stringify(quotePayload)
            });

            const rawQuoteText = await quoteRes.text();
            let quotePayloadJson;
            try { quotePayloadJson = JSON.parse(rawQuoteText); } catch (e) { throw new Error(`Oracle returned invalid JSON.`); }

            if (!quoteRes.ok) throw new Error(quotePayloadJson.error || quotePayloadJson.message || "Failed to generate locked liquidity quote.");

            const quoteData = quotePayloadJson.data || quotePayloadJson;
            const activeQuoteId = quoteData.quoteId;
            if (!activeQuoteId) throw new Error("Provider did not return a valid quoteId.");

            const activeExchangeRate = quoteData.exchangeRate || quoteData.rawRate || FIAT_CONFIG[fiatCurrency as keyof typeof FIAT_CONFIG].rateToUsdc;
            const rawUser = user as any;
            const validMockPhone = `+234803${Math.floor(1000000 + Math.random() * 9000000)}`;

            const onrampPayload = {
                quoteId: String(activeQuoteId), currency: fiatCurrency, targetAsset: "USDC",
                targetNetwork: "STELLAR", destinationAddress: destinationAddress, collectionMethod: mappedCollectionMethod,
                customer: {
                    firstName: user.firstName || "Blink", lastName: user.lastName || "User",
                    email: user.email, phone: rawUser.phone || rawUser.phoneNumber || validMockPhone
                },
                customerId: user.id
            };

            const onrampRes = await fetch(`${url}/api/v1/b2b/onramp/initialize`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": key, "x-idempotency-key": internalDepositRef },
                body: JSON.stringify(onrampPayload)
            });

            const rawOnrampText = await onrampRes.text();
            let onrampPayloadWrapper;
            try { onrampPayloadWrapper = JSON.parse(rawOnrampText); } catch (e) { throw new Error(`Engine returned invalid JSON.`); }

            if (!onrampRes.ok) throw new Error(`[Bingtellar Engine] ${onrampPayloadWrapper.error || onrampPayloadWrapper.message || JSON.stringify(onrampPayloadWrapper)}`);

            const onrampData = onrampPayloadWrapper.data || onrampPayloadWrapper;
            const instructions = onrampData.paymentInstructions || onrampData.paymentDetails || null;
            const usdcExpected = onrampData.expectedAssetAmount || quoteData.amountToken || quoteData.cryptoAmountToReceive || (fiatAmount / parseFloat(activeExchangeRate.toString()));
            const referenceId = onrampData.reference || internalDepositRef;

            const newTransaction = await db.insert(transactions).values({
                userId: userId, type: "deposit", amount: usdcExpected.toString(), status: "pending", trackingState: "provisioning_va",
                description: `Fiat Deposit (${fiatCurrency} via ${paymentMethod})`, reference: referenceId, network: paymentMethod,
                fiatAmount: fiatAmount.toString(), fiatCurrency: fiatCurrency, exchangeRate: activeExchangeRate.toString(),
                note: instructions ? JSON.stringify(instructions) : null
            }).returning();

            await NotificationService.alertAdmin(
                'fiat_alert',
                'Deposit Initiated',
                `User ${user.email} initiated a deposit of ${fiatCurrency} ${fiatAmount} (Ref: ${referenceId}).`
            );

            res.status(201).json({
                success: true, transactionId: newTransaction[0].id, reference: referenceId,
                fiatAmount: fiatAmount, fiatCurrency: fiatCurrency, usdcAmountExpected: usdcExpected, instructions: instructions
            });
        } catch (error: any) {
            logger.error({ err: error.message }, "Failed to initiate deposit");
            res.status(500).json({ error: error.message || "Internal server error during deposit initiation." });
        }
    },

    initiateWithdrawal: async (req: Request, res: Response) => {
        try {
            const { userId, usdcAmount, fiatCurrency, paymentMethod, recipientDetails, signedXdr, clientExchangeRate, clientRailFee, clientNetFiat } = req.body;
            const { url, key } = getBingtellarConfig();

            if (!key) throw new Error("Server missing BINGTELLAR_API_KEY configuration.");

            const currencyConfig = FIAT_CONFIG[fiatCurrency as keyof typeof FIAT_CONFIG];
            if (!currencyConfig || !currencyConfig.methods.includes(paymentMethod)) return res.status(400).json({ error: `Payment method or currency not supported.` });

            const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            if (userRecord.length === 0) return res.status(404).json({ error: "User not found." });
            const user = userRecord[0];

            const beneficiaryPayload = paymentMethod === 'mobile_money'
                ? { type: "mobile_money", holder_name: recipientDetails.accountName, account_number: recipientDetails.phoneNumber || recipientDetails.accountNumber, bank_code: recipientDetails.bankName }
                : { type: "bank_account", holder_name: recipientDetails.accountName, account_number: recipientDetails.accountNumber, bank_code: recipientDetails.bankName };

            const quoteRes = await fetch(`${url}/api/v1/b2b/offramp/quotes`, {
                method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "x-idempotency-key": crypto.randomUUID() },
                body: JSON.stringify({ asset: "USDC", network: "STELLAR", amount: usdcAmount, targetCurrency: fiatCurrency, destinationAccount: beneficiaryPayload })
            });

            const quoteData = await quoteRes.json().catch(() => ({}));
            if (!quoteRes.ok) throw new Error(`[Offramp Quote] ${quoteData.error || quoteData.message || "Failed to secure offramp liquidity quote."}`);

            const activeOrderId = quoteData.data?.orderId || quoteData.orderId;
            const bingtellarDepositAddress = quoteData.depositAddress || quoteData.data?.depositAddress || process.env.BINGTELLAR_LIQUIDITY_WALLET;

            if (!activeOrderId || !bingtellarDepositAddress) throw new Error("Provider failed to return an orderId or liquidity address.");

            const lockedFiatPayout = quoteData.data?.fiatAmountExpected || quoteData.fiatAmountExpected || (usdcAmount * currencyConfig.rateToFiat);
            const executedRate = quoteData.data?.exchangeRate || quoteData.exchangeRate || (lockedFiatPayout / usdcAmount);

            const finalExchangeRate = clientExchangeRate || executedRate;
            const finalRailFee = clientRailFee !== undefined ? clientRailFee : (fiatCurrency === 'NGN' ? 50.00 : 0.00);
            const finalNetFiat = clientNetFiat !== undefined ? clientNetFiat : (lockedFiatPayout - finalRailFee);
            const finalGrossFiat = (usdcAmount * finalExchangeRate).toFixed(2);
            const internalReferenceId = `WD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            // =========================================================
            // 🌟 1. ATOMIC WRITE-AHEAD LOG (Prevents Concurrent Double-Spends)
            // =========================================================
            const newTransaction = await db.transaction(async (txDB) => {
                const updatedUser = await txDB.update(users)
                    .set({ balance: sql`CAST(${users.balance} AS NUMERIC) - ${usdcAmount}` })
                    .where(and(eq(users.id, userId), sql`CAST(${users.balance} AS NUMERIC) >= ${usdcAmount}`))
                    .returning();
                
                if (updatedUser.length === 0) throw new Error("Insufficient balance or concurrent transaction conflict.");

                const inserted = await txDB.insert(transactions).values({
                    userId: userId, type: "withdrawal", amount: usdcAmount.toString(), status: "processing", 
                    trackingState: "fiat_processing", description: `Fiat Withdrawal (${fiatCurrency} via ${paymentMethod})`,
                    reference: internalReferenceId, network: paymentMethod, fiatAmount: finalNetFiat.toString(),
                    railFee: finalRailFee.toString(), exchangeRate: finalExchangeRate.toString(), fiatCurrency: fiatCurrency,
                    metadata: { recipientDetails, bingtellarOrderId: activeOrderId, grossFiatAmount: finalGrossFiat },
                    note: `Withdrawal to ${recipientDetails.accountName || 'Beneficiary'}`
                }).returning();
                return { tx: inserted[0], finalBalance: updatedUser[0].balance };
            });

            if (!newTransaction.tx) return res.status(500).json({ error: "Failed to log transaction intent." });

            // =========================================================
            // 🚀 2. EXECUTE BLOCKCHAIN WITH DEEP XDR INSPECTION
            // =========================================================
            let confirmedTxHash = "processing...";
            const { rpcUrl, networkPassphrase } = getStellarConfig();

            try {
                const platformSecret = process.env.PLATFORM_FUNDING_SECRET;
                if (!platformSecret) throw new Error("CRITICAL: PLATFORM_FUNDING_SECRET is missing");
          
                const innerTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction;
                
                // 🛡️ XDR INTEGRITY GUARD & BYTECODE DECODER
                if (innerTx.source !== user.walletAddress) throw new Error("Security validation failed: XDR source account does not match your registered wallet.");
                if (innerTx.operations.length !== 1) throw new Error("Security validation failed: XDR must contain exactly one operation.");
                
                const op = innerTx.operations[0] as any;
                if (op.type !== 'invokeHostFunction') throw new Error("Security validation failed: Invalid Soroban operation type.");

                const hostFunc = op.func;
                if (hostFunc.switch().name !== 'hostFunctionTypeInvokeContract') throw new Error("Security validation failed: Payload is not a smart contract invocation.");

                const invokeContract = hostFunc.invokeContract();
                const contractIdStr = new Address(invokeContract.contractAddress()).toString();
                const functionName = invokeContract.functionName().toString('utf8');
                const args = invokeContract.args(); 

                const expectedNativeTokenId = getStellarConfig().nativeTokenId;
                if (contractIdStr !== expectedNativeTokenId) throw new Error("Security validation failed: Interacting with an unauthorized smart contract.");
                if (functionName !== 'transfer' || args.length < 3) throw new Error("Security validation failed: Expected a standard transfer invocation.");

                const expectedTreasury = process.env.VITE_TREASURY_ADDRESS || process.env.PLATFORM_TREASURY;
                const expectedStroops = BigInt(Math.floor(usdcAmount * 10000000));
                
                const parsedDestination = scValToNative(args[1]);
                const parsedAmount = scValToNative(args[2]);

                if (parsedDestination !== expectedTreasury) throw new Error("Security validation failed: The signed payload is routing funds to an unauthorized wallet.");
                if (BigInt(parsedAmount) !== expectedStroops) throw new Error("Security validation failed: The signed blockchain payload does not match your requested withdrawal amount.");

                // Execute Fee-Bump
                const bingtellarGasKeypair = Keypair.fromSecret(platformSecret);
                const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(bingtellarGasKeypair, "100000", innerTx, networkPassphrase);
                feeBumpTx.sign(bingtellarGasKeypair);

                const server = new rpc.Server(rpcUrl);
                const sendResponse = await server.sendTransaction(feeBumpTx);
                if (sendResponse.status === "ERROR") throw new Error("Mempool rejected execution.");

                // 🛡️ FINALITY LOCK
                let txStatus = await server.getTransaction(sendResponse.hash);
                let attempts = 0;
                while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    txStatus = await server.getTransaction(sendResponse.hash);
                    attempts++;
                }

                if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Ledger failure: ${txStatus.status}`);
                confirmedTxHash = sendResponse.hash;

            } catch (blockchainError: any) {
                const errorMsg = blockchainError.message || blockchainError.toString();
                
                // 🛡️ RPC BLINDSPOT LOCK
                const isAmbiguousRPC = errorMsg.includes('429') || errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET') || errorMsg.includes('503');
                if (isAmbiguousRPC) {
                    await db.update(transactions).set({ status: 'locked', trackingState: "manual_intervention_required", description: "RPC polling timeout. Awaiting on-chain verification." }).where(eq(transactions.id, newTransaction.tx.id));
                    return res.status(500).json({ error: "Network congestion while verifying blockchain settlement. Your transaction is pending verification." });
                }

                // ♻️ STRICT NUMERIC ROLLBACK
                await db.transaction(async (txDB) => {
                    await txDB.update(users).set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${usdcAmount}` }).where(eq(users.id, userId));
                    await txDB.update(transactions).set({ status: 'failed', description: `Failed: ${errorMsg}` }).where(eq(transactions.id, newTransaction.tx.id));
                });
                return res.status(500).json({ error: "Network execution failed. Your funds have been restored." });
            }

            // =========================================================
            // 🚀 3. EXECUTE FIAT PAYOUT (With Isolated Ambiguity Guard)
            // =========================================================
            let executeData;
            let executeRes;

            try {
                executeRes = await fetch(`${url}/api/v1/b2b/offramp/execute`, {
                    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "x-idempotency-key": internalReferenceId },
                    body: JSON.stringify({ orderId: activeOrderId, txHash: confirmedTxHash, depositAddress: bingtellarDepositAddress })
                });
                executeData = await executeRes.json().catch(() => ({}));
                if (!executeRes.ok) throw new Error(executeData.error || executeData.message || "Provider rejected payout.");
            } catch (fiatError: any) {
                const errorMsg = fiatError.message || fiatError.toString();
                
                // 🛡️ SCHRÖDINGER'S PAYOUT GUARD
                const isAmbiguousNetworkDrop = fiatError.name === 'FetchError' || errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET') || errorMsg.includes('failed to fetch') || errorMsg.includes('502') || errorMsg.includes('504');
                if (isAmbiguousNetworkDrop) {
                    await db.update(transactions).set({ status: 'locked', trackingState: "manual_intervention_required", description: "Network timeout during fiat clearing." }).where(eq(transactions.id, newTransaction.tx.id));
                    await NotificationService.alertAdmin('fiat_alert', '🚨 CRITICAL: SCHRÖDINGER PAYOUT', `Withdrawal ${internalReferenceId} suffered a network drop. Verify fiat status before refunding.`);
                    return res.status(500).json({ error: "Network timeout while communicating with our banking provider. Your funds are secure, and our treasury team is manually verifying the clearing status." });
                }

                // ♻️ STRICT NUMERIC ROLLBACK
                const refundHash = await executeOnChainRefund(user.walletAddress!, usdcAmount, "Fiat Execution Failed");
                await db.transaction(async (txDB) => {
                    await txDB.update(users).set({ balance: sql`CAST(${users.balance} AS NUMERIC) + ${usdcAmount}` }).where(eq(users.id, userId));
                    await txDB.update(transactions).set({ status: 'failed', trackingState: "refunded", txHash: refundHash || "manual_refund_required", description: `Failed Withdrawal - Refunded` }).where(eq(transactions.id, newTransaction.tx.id));
                });
                return res.status(400).json({ error: "The banking provider rejected the recipient details. Your USDC has been safely refunded to your balance." });
            }

            // =========================================================
            // ✅ 4. COMMIT SUCCESS
            // =========================================================
            const masterLedgerId = executeData.data?.reference || executeData.reference || internalReferenceId;
            await db.update(transactions).set({ reference: masterLedgerId, txHash: confirmedTxHash }).where(eq(transactions.id, newTransaction.tx.id));

            res.status(201).json({
                success: true, transactionId: newTransaction.tx.id, reference: masterLedgerId, blockchainTxHash: confirmedTxHash,
                fiatAmountExpected: lockedFiatPayout, status: "processing", newBalance: newTransaction.finalBalance
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Internal server error during withdrawal." });
        }
    },


    // PERFORMANCE FIX: In-memory cache for bank lists
    // Prevents burning API quota on static data. Refreshes automatically every 24 hours.
    getNgBanks: async (req: Request, res: Response) => {
        try {
            const CACHE_KEY = 'ng_banks_cache';
            const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        
            // Initialize global cache object if it doesn't exist
            if (!(global as any).bingtellarCache) (global as any).bingtellarCache = {};
            const cache = (global as any).bingtellarCache;

            // Return cached list if valid
            if (cache[CACHE_KEY] && (Date.now() - cache[CACHE_KEY].timestamp < CACHE_DURATION)) {
                return res.json({ success: true, data: cache[CACHE_KEY].data, cached: true });
            }

            // Otherwise, fetch from Bingtellar Oracle
            const { url, key } = getBingtellarConfig();
            if (!key) throw new Error("Missing API Key");

            const fetchRes = await fetch(`${url}/api/v1/banks/ng`, { method: "GET", headers: { "x-api-key": key } });
            const data = await fetchRes.json();
        
            if (!fetchRes.ok) throw new Error("Failed to fetch Nigerian banks.");

            const bankData = data.data || data;

            // Save to cache
            cache[CACHE_KEY] = { data: bankData, timestamp: Date.now() };

            res.json({ success: true, data: bankData, cached: false });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    resolveBankAccount: async (req: Request, res: Response) => {
        try {
            const { accountNumber, bankCode, claimId } = req.body;
            const { url, key } = getBingtellarConfig();

            // 🌟 THE FIX: Removed !claimId from the generic missing parameters check
            if (!key || !accountNumber || !bankCode) throw new Error("Missing required parameters");

            // 🔒 SECURITY: Dual-Context Verification
            if (claimId) {
                // Context A: Public Claim Portal (Requires Proof of Intent)
                const activeClaim = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
                if (activeClaim.length === 0 || activeClaim[0].status === 'completed') {
                    return res.status(403).json({ error: "Unauthorized: Invalid or expired claim context." });
                }
            } else {
                // Context B: Logged-in Dashboard (Requires Active Session)
                // Checks if the request contains an authorization header or HTTP-only cookies
                const hasAuth = req.headers.authorization || req.headers.cookie;
                if (!hasAuth) {
                    return res.status(401).json({ error: "Unauthorized: Missing active session or claim context." });
                }
            }

            const fetchRes = await fetch(`${url}/api/v1/banks/resolve`, {
                method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key },
                body: JSON.stringify({ accountNumber, bankCode })
            });
        
            const data = await fetchRes.json();
            if (!fetchRes.ok) throw new Error(data.message || data.error || "Account resolution failed.");

            const accountName = data.data?.account_name || data.data?.accountName || data.accountName || data.account_name;
            res.json({ success: true, accountName });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    },

    resolveMobileAccount: async (req: Request, res: Response) => {
        try {
            const { phoneNumber, provider, claimId } = req.body;
            const { url, key } = getBingtellarConfig();

            // 🌟 THE FIX: Removed !claimId from the generic missing parameters check
            if (!key || !phoneNumber || !provider) throw new Error("Missing required parameters");

            // 🔒 SECURITY: Dual-Context Verification
            if (claimId) {
                // Context A: Public Claim Portal (Requires Proof of Intent)
                const activeClaim = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
                if (activeClaim.length === 0 || activeClaim[0].status === 'completed') {
                    return res.status(403).json({ error: "Unauthorized: Invalid or expired claim context." });
                }
            } else {
                // Context B: Logged-in Dashboard (Requires Active Session)
                const hasAuth = req.headers.authorization || req.headers.cookie;
                if (!hasAuth) {
                    return res.status(401).json({ error: "Unauthorized: Missing active session or claim context." });
                }
            }

            // Bingtellar Mobile Money Resolution execution
            const fetchRes = await fetch(`${url}/api/v1/mobile-money/resolve`, {
                method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key },
                body: JSON.stringify({ phoneNumber, network: provider })
            });

            const data = await fetchRes.json();
            if (!fetchRes.ok) throw new Error(data.message || data.error || "Mobile account resolution failed.");

            const accountName = data.data?.account_name || data.data?.accountName || data.accountName;
            res.json({ success: true, accountName });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    },

    // ============================================================================
  // 🌟 UNIVERSAL INSTITUTIONS ORACLE
  // Normalizes diverse upstream payloads into guaranteed { name, code } objects
  // ============================================================================
  getInstitutions: async (req: Request, res: Response) => {
    try {
      // 🛡️ DEFENSIVE FIX: Force uppercase to guarantee strict enum matching
      const country = ((req.query.country as string) || "KE").toUpperCase();
      const currency = req.query.currency as string | undefined;
      let channel = req.query.channel as string | undefined;

      // 🌟 CORE FIX: Anti-Corruption Layer for Channel Enums (Corridor-Aware)
      if (channel === 'BANK_ACCOUNT') {
          if (country === 'GB') {
              // Switch Doc: UK uses Faster Payments (GBP) and SEPA (EUR)
              channel = currency === 'EUR' ? 'SEPA' : 'DOMESTIC_GBP';
          } else if (country === 'US') {
              channel = 'ACH';
          } else {
              // Switch Doc: ALL other European (AD, AT, BE...) and African countries use BANK
              channel = 'BANK'; 
          }
      }
      if (channel === 'MOBILE_MONEY') channel = 'MOBILEMONEY';

      const { url, key } = getBingtellarConfig();
      if (!key) {
        logger.error("[FiatController] 🚨 Missing BINGTELLAR_API_KEY in environment.");
        return res.status(500).json({ success: false, error: "Server missing BINGTELLAR_API_KEY." });
      }

      // Build clean query string with translated channel
      const queryParams = new URLSearchParams({ country });
      if (currency) queryParams.append("currency", currency);
      if (channel) queryParams.append("channel", channel);

      const fetchRes = await fetch(`${url}/api/v1/institutions?${queryParams.toString()}`, {
        method: "GET",
        headers: { 
          "x-api-key": key,
          "Content-Type": "application/json"
        }
      });

      // 🛡️ CRITICAL FIX: Guard against Cloudflare/Nginx HTML error pages BEFORE parsing JSON
      const contentType = fetchRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
          const rawText = await fetchRes.text();
          logger.warn(`[FiatController] Upstream returned non-JSON. Status: ${fetchRes.status}. Body: ${rawText.substring(0, 150)}...`);
          return res.status(502).json({ success: false, error: "Banking provider is temporarily unavailable. Please try again later.", data: [] });
      }

      const payload = await fetchRes.json();

      if (!fetchRes.ok || payload.status === 'error') {
        logger.warn(`[FiatController] Upstream institutions error for ${country}: ${payload.message || fetchRes.statusText}`);
        return res.status(fetchRes.status).json({ success: false, error: payload.message || "Failed to fetch institutions." });
      }

      // Extract array from payload
      const rawList = payload.data?.institutions || payload.data?.banks || payload.data || payload;
      const inputArray = Array.isArray(rawList) ? rawList : [];

      // 🌟 GUARANTEED NORMALIZATION: Map any property variants to clean `name` and `code`
      const normalizedArray = inputArray.map((item: any) => ({
        code: String(item.code || item.institution_code || item.bank_code || item.id || '').trim(),
        name: String(item.name || item.institution_name || item.bank_name || item.short_name || '').trim()
      })).filter(item => item.code.length > 0 && item.name.length > 0);

      logger.info(`[FiatController] 🏦 Resolved ${normalizedArray.length} institutions for ${country} (Channel: ${channel || 'ALL'})`);

      return res.status(200).json({ success: true, data: normalizedArray });
    } catch (error: any) {
      logger.error(`[FiatController] 🚨 getInstitutions Error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message, data: [] });
    }
  },

    // ============================================================================
    // 🌟 UNIVERSAL NON-NG ACCOUNT RESOLUTION
    // Maps Blink's flat payload -> Bingtellar's strict nested beneficiary shape
    // ============================================================================
    resolveInstitutionAccount: async (req: Request, res: Response) => {
        try {
            const { accountNumber, institutionCode, countryCode, phoneNumber, provider } = req.body;
            const { url, key } = getBingtellarConfig();

            if (!key) throw new Error("Server missing BINGTELLAR_API_KEY configuration.");

            // 1. Normalize fields (Handles both Bank & Mobile Money inputs)
            const targetCountry = (countryCode || req.body.country || "KE").toUpperCase();
            const targetAccountNumber = accountNumber || phoneNumber;
            const targetBankCode = institutionCode || provider;

            if (!targetAccountNumber || !targetBankCode) {
                return res.status(400).json({
                    error: "Missing required lookup parameters: accountNumber and institutionCode/provider."
                });
            }

            // 2. 🌟 CRITICAL FIX: Restructure payload to match Bingtellar's expected shape
            const bingtellarPayload = {
                country: targetCountry,
                beneficiary: {
                    account_number: String(targetAccountNumber).trim(),
                    bank_code: String(targetBankCode).trim()
                }
            };

            // 3. Dispatch to Bingtellar Liquidity Engine
            const fetchRes = await fetch(`${url}/api/v1/institutions/lookup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": key
                },
                body: JSON.stringify(bingtellarPayload)
            });

            const payload = await fetchRes.json();

            if (!fetchRes.ok || payload.status === 'error') {
                return res.status(fetchRes.status === 422 ? 422 : 400).json({
                    error: payload.message || "Account resolution failed at the receiving institution."
                });
            }

            const resolvedData = payload.data || {};
      
            // 4. Extract name (Handles snake_case from Switch and blind corridors)
            const accountName = resolvedData.account_name || resolvedData.accountName || null;
            const isNameMasked = !accountName && payload.message?.includes('masked');

            res.status(200).json({
                success: true,
                accountName: accountName,
                isMasked: isNameMasked,
                message: payload.message || undefined,
                data: resolvedData
            });
        } catch (error: any) {
            logger.error(`[FiatController] 🚨 resolveInstitutionAccount Error: ${error.message}`);
            res.status(400).json({ error: error.message || "Unable to resolve account details." });
        }
    }
}
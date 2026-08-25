// src/index.ts
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { z } from 'zod';
import bcrypt from 'bcrypt'; 
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { SequenceManager } from './services/SequenceManager';
import escrowRouter from './routes/escrows';
import { escrowWorker } from './workers/EscrowWorker';
import { cronWorker } from './workers/CronWorker';
import { startEnterpriseCronJobs } from './services/QueueService';


// Initialize environment variables
dotenv.config();

import { db } from './db';
import { users, escrows, transactions, subAccounts, recipients, paymentRequests, adminNotifications, auditLogs } from './schema';
import { eq, desc, sql, or, and, ilike } from 'drizzle-orm';
import { logger } from './logger';
import { validate } from './validate';
import { authenticateToken } from './middleware/auth'; 
import { authRateLimiter } from './middleware/rateLimiter';
import { extractTrueIp } from './utils/security.userIP';

import airdropRouter from './routes/airdrop';
import fiatRouter from './routes/fiat';
import authRouter from './routes/auth';
import webhookRouter from './routes/webhook';
import userRouter from './routes/users';
import cryptoRouter from './routes/crypto';
import treasuryRouter from './routes/treasury.routes';
import requestRouter from './routes/requests';
import { sseService } from './services/SSEService';


import { SorobanSweeper } from './cron/SorobanSweeper';
import { 
  MuxedAccount, Keypair, Account, Horizon,
  TransactionBuilder, Networks, Operation, Asset, rpc,       
  Contract, nativeToScVal, scValToNative, Address    
} from '@stellar/stellar-sdk';
import { CryptoService } from './utils/CryptoService';
import { SorobanService } from './services/SorobanService'; 
import { NotificationService } from './services/NotificationService';
import { EmailService } from './services/EmailService';
// import { StellarDepositListener } from './services/StellarDepositListener';
import { SorobanEventListener } from './services/SorobanEventListener';
import { v2 as cloudinary } from 'cloudinary';
import { templates } from './utils/emailTemplates';
import { provisionAdmin, finalizeAdminSetup, upgradeAdminClearance, getAdminTeam, revokeAdminClearance } from './controllers/admin.controller';
import { syncAndGetWalletBalance } from './controllers/UserController';
import { YieldController } from './controllers/YieldController';
import { startYieldMonitor } from './workers/yieldMonitor';

// 🛡️ CRITICAL: Hard stop if JWT Secret is missing
if (!process.env.JWT_SECRET) {
  logger.error("FATAL ERROR: JWT_SECRET environment variable is missing.");
  process.exit(1);
}

// 🌐 DYNAMIC NETWORK CONFIGURATION
const IS_MAINNET = process.env.NODE_ENV === 'production';
const HORIZON_URL = IS_MAINNET ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// 🛡️ ENTERPRISE GUARD: Trust upstream proxies (Cloudflare, Nginx, Load Balancers)
app.set('trust proxy', 1); 

app.use(helmet());

// 🛡️ STRICT CORS: Only allow the frontend to communicate with the backend
app.use(cors({
  origin: ['https://app.ourblink.cash', 'http://localhost:5173'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-idempotency-key'] 
}));

app.use(cookieParser());

// CRITICAL: Capture the raw body for Webhook HMAC validation
app.use(express.json({ 
  limit: '500kb',
  verify: (req: any, res, buf) => {
    // Only capture the buffer for the webhook route to save server memory
    if (req.originalUrl.includes('/webhook/bingtellar')) {
      req.rawBody = buf;
    }
  }
}));

// standard URL-encoded parsing to prevent unsupported media type errors
app.use(express.urlencoded({ extended: true, limit: '500kb' }));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: IS_MAINNET ? 100 : 5000, // Bumped local dev limit to 5000
  
  // Bypass the strict global limit for aggressive background polling
  skip: (req) => req.url.includes('/onchain-truth'), 
  
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractTrueIp(req),
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn({ ip: extractTrueIp(req) }, "Rate limit exceeded");
    res.status(options.statusCode).json(options.message);
  }
});

app.use('/api', limiter);

app.use('/api', limiter);

app.get('/api/health', (req, res) => res.json({ message: 'Blink API is secure and aligned with Soroban state!' }));


// =========================================================================
// 🚀 REAL-TIME EVENT STREAM (SSE ENDPOINT)
// =========================================================================
// =========================================================================
// 🚀 REAL-TIME EVENT STREAM (SSE ENDPOINT)
// =========================================================================
app.get('/api/events/stream', authenticateToken, (req, res) => {
    const userId = (req as any).user.userId;

    // 1. Set all proxy-busting headers cleanly here
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform'); 
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 2. Hand it to the Service 
    sseService.addClient(userId, res);

    // 3. Flush the headers so the connection stays open, and send the welcome message!
    res.flushHeaders(); 
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "streaming_live" })}\n\n`);
});



// =========================================================================
// 🚀 MOUNTED ROUTERS
// =========================================================================

// 🚨 WEBHOOK ROUTES (Mounted here so it resolves to /api/webhook/bingtellar)
app.use('/api/webhook', webhookRouter);

app.use('/api/fiat', fiatRouter);
app.use('/api/test', airdropRouter);
app.use('/api/auth', authRouter); 
app.use('/api/escrows', escrowRouter);

// Mount the Treasury Router and secure it with your JWT middleware
app.use('/api/admin/treasury', authenticateToken, treasuryRouter);


// Explicitly intercept '/api/users/me' BEFORE the userRouter catches it
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    // KILL CACHE: Force the browser to always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');


    // BLOCKING SYNC: Wait for the blockchain truth BEFORE reading Postgres
    /*
    try {
        await syncAndGetWalletBalance(userId);
    } catch (syncErr) {
        logger.warn({ err: syncErr }, "[Sync Engine] Blockchain sync failed, falling back to DB.");
    }
    */
    
    // 🛡️ THE FIX: We removed `syncAndGetWalletBalance(userId)` here.
    // The UI must strictly trust the PostgreSQL database. The background 
    // sweepers handle blockchain reconciliation asynchronously.

    // 2. Parallel Database Execution & SQL Aggregation
    const [result, userSubAccounts, activeEscrowResult] = await Promise.all([
        db.select().from(users).where(eq(users.id, userId)).limit(1),
        db.select().from(subAccounts).where(eq(subAccounts.parentId, userId)),
        
        // Let Postgres do the heavy lifting, not Node.js RAM
        db.select({
            totalLocked: sql<string>`COALESCE(SUM(CAST(${escrows.amountLocked} AS NUMERIC)), 0)`
        })
        .from(escrows)
        .where(
            and(
                eq(escrows.creatorId, userId),
                or(eq(escrows.status, 'Active'), eq(escrows.status, 'Ready'))
            )
        )
    ]);

    if (result.length === 0) return res.status(404).json({ error: "User not found" });

    const user = result[0];
    const { passwordHash, resetToken, resetOtp, ...safeUser } = user;

    // 3. Mathematical Segregation (THE FIX: Stop mixing Available and Ledger concepts)
    const availableBalance = parseFloat(user.balance || "0"); // Raw DB balance is the Available liquidity
    const activeEscrowAmount = parseFloat(activeEscrowResult[0]?.totalLocked || "0");
    const trueLedgerBalance = availableBalance + activeEscrowAmount; // Ledger = Available + Locked
    const totalSubAccountLiquidity = userSubAccounts.reduce((sum, sub) => sum + parseFloat(sub.balance || "0"), 0);

    // 4. Construct the Enterprise Data Payload
    const formattedUser = {
        ...safeUser,
        name: `${user.firstName} ${user.lastName}`,
        type: user.accountType === "business" ? "Business" : "Individual",
        
        // 🌟 ENTERPRISE MATRIX: Strictly defined financial states
        balances: {
            available: availableBalance,
            lockedInEscrows: activeEscrowAmount,
            ledger: trueLedgerBalance,
            totalSubAccounts: totalSubAccountLiquidity,
            globalPlatformLiquidity: trueLedgerBalance + totalSubAccountLiquidity 
        },
        
        // ⚠️ LEGACY SUPPORT: Must strictly be the Available balance to prevent double-counting!
        balance: availableBalance,

        // 🌟 SEGREGATED LEDGERS
        subAccounts: userSubAccounts.map(sub => ({
            id: sub.id,
            name: sub.name,
            muxedId: sub.muxedId,
            muxedAddress: sub.muxedAddress,
            balance: parseFloat(sub.balance || "0")
        }))
    };

    return res.status(200).json({ success: true, user: formattedUser });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch /users/me profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use('/api/users', userRouter);
app.use('/api/crypto', cryptoRouter);

// =========================================================================
// 🚀 USERS & PROFILES (WEB2)
// =========================================================================

const createUserSchema = z.object({ body: z.object({ walletAddress: z.string().optional(), email: z.string().email().optional() }) });

app.post('/api/users', validate(createUserSchema), async (req, res) => {
  try {
    const { walletAddress, email } = req.body;
    const newUser = await db.insert(users).values({ walletAddress, email: email || `temp_${Date.now()}@blink.com`, passwordHash: "legacy" }).returning();
    res.json(newUser[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch users' }); }
});

app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id as string;
    
    // Strict BOLA Guard
    if ((req as any).user.userId !== userId) {
      return res.status(403).json({ error: "Forbidden: You cannot access another user's data." });
    }

    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (result.length === 0) return res.status(404).json({ error: "User not found" });
    
    // 🌟 FIX: Calculate active escrows to reconstruct the true Ledger Balance for the UI
    const userEscrows = await db.select().from(escrows).where(eq(escrows.creatorId, userId));
    const activeEscrowAmount = userEscrows.filter(e => e.status === 'Active' || e.status === 'Ready').reduce((sum, e) => sum + parseFloat(e.amountLocked || "0"), 0);

    const user = result[0];
    const { passwordHash, resetToken, resetOtp, ...safeUser } = user;

    const formattedUser = {
        ...safeUser,
        name: `${user.firstName} ${user.lastName}`,
        type: user.accountType === "business" ? "Business" : "Individual",
        // Add the locked escrows back so the UI math resolves perfectly
        balance: parseFloat(user.balance || "0") + activeEscrowAmount
    };

    res.status(200).json({ success: true, user: formattedUser });
  } catch (error) { 
    res.status(500).json({ error: "Internal server error" }); 
  }
});

app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id as string;
    
    if ((req as any).user.userId !== userId) {
      return res.status(403).json({ error: "Forbidden: You cannot modify another user's profile." });
    }

    const { firstName, lastName, dob, country, phone } = req.body;
    const updatedUser = await db.update(users).set({ firstName, lastName, country }).where(eq(users.id, userId)).returning();
    if (updatedUser.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user: updatedUser[0] });
  } catch (error) { res.status(500).json({ error: "Failed to update profile" }); }
});

// =========================================================================
// 🚀 TRANSACTIONS & RECIPIENTS (UUID STRICT + AUTH)
// =========================================================================

app.get('/api/transactions/:userId', authenticateToken, async (req, res) => {
  try {
      const userId = req.params.userId as string;

      if (!userId) return res.status(400).json({ error: "Invalid User ID" });

      if ((req as any).user.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: Access denied to transaction history." });
      }

      const userTransactions = await db.select().from(transactions)
            .where(or(eq(transactions.userId, userId), eq(transactions.subAccountId, userId)))
            .orderBy(desc(transactions.createdAt));
      res.status(200).json(userTransactions);
  } catch (error: any) { res.status(500).json({ error: "Internal server error." }); }
});

app.patch('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const transactionId = req.params.id as string;
    const { note } = req.body;

    const existingTx = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    
    if (existingTx.length === 0) return res.status(404).json({ error: "Transaction not found" });

    if ((req as any).user.userId !== existingTx[0].userId) {
      return res.status(403).json({ error: "Forbidden: You cannot modify this transaction." });
    }

    await db.update(transactions).set({ note: note }).where(eq(transactions.id, transactionId));
    res.status(200).json({ success: true, message: "Note updated" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/api/users/:userId/recipients', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId as string;

        if (!userId) return res.status(400).json({ error: "Invalid User ID" });

        if ((req as any).user.userId !== userId) {
          return res.status(403).json({ error: "Forbidden: Cannot view recipients for this account." });
        }

        const userRecipients = await db.select().from(recipients).where(eq(recipients.userId, userId)).orderBy(desc(recipients.createdAt));
        res.status(200).json(userRecipients);
    } catch (error) { res.status(500).json({ error: "Internal server error" }); }
});

app.post('/api/users/:userId/recipients', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId as string;
        const { name, type, details, email, walletAddress, beneficiaryType, bankCountry, bankName, accountTypeOption, routingNumber, momoCountry, momoNetwork, token, network } = req.body;

        if (!userId) return res.status(400).json({ error: "Invalid User ID" });
        if (!name || !type || !details) return res.status(400).json({ error: "Missing required fields" });

        if ((req as any).user.userId !== userId) {
          return res.status(403).json({ error: "Forbidden: Cannot add recipients to this account." });
        }

        const existing = await db.select().from(recipients).where(and(eq(recipients.userId, userId), eq(recipients.details, details), eq(recipients.type, type))).limit(1);
        if (existing.length > 0) return res.status(200).json(existing[0]); 

        const newRecipient = await db.insert(recipients).values({
            userId, name, type, details, email, walletAddress, beneficiaryType, bankCountry, bankName, accountTypeOption, routingNumber, momoCountry, momoNetwork, token, network
        }).returning();
        res.status(201).json(newRecipient[0]);
    } catch (error) { res.status(500).json({ error: "Internal server error" }); }
});

app.delete('/api/users/:userId/recipients/:recipientId', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId as string;
        const recipientId = req.params.recipientId as string;

        if (!userId || !recipientId) {
            return res.status(400).json({ error: "Invalid User or Recipient ID" });
        }

        // 🛡️ Strict BOLA Guard: Ensure the user owns this address book
        if ((req as any).user.userId !== userId) {
          return res.status(403).json({ error: "Forbidden: Cannot delete recipients from this account." });
        }

        // 🗑️ Perform the secure atomic deletion using Drizzle ORM
        const deletedRecipient = await db.delete(recipients)
            .where(
                and(
                    eq(recipients.id, recipientId), 
                    eq(recipients.userId, userId) // Double-check ownership at the database level
                )
            )
            .returning();

        if (deletedRecipient.length === 0) {
            return res.status(404).json({ error: "Recipient not found or already deleted." });
        }

        res.status(200).json({ success: true, message: "Recipient securely removed from address book." });
    } catch (error) { 
        logger.error({ err: error }, "Failed to delete recipient");
        res.status(500).json({ error: "Internal server error" }); 
    }
});


app.post('/api/upload/cloudinary-signature', authenticateToken, (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = { timestamp, folder: 'bingtellar_kyc_docs', type: 'authenticated' };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!);
    res.json({ timestamp, signature, cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY });
  } catch (error) { res.status(500).json({ error: "Failed to generate upload signature" }); }
});

// =========================================================================
// 🚀 KYC & ADMIN PROVISIONING
// =========================================================================

app.post('/api/admin/team/provision', authenticateToken, provisionAdmin);
app.post('/api/admin/team/upgrade', authenticateToken, upgradeAdminClearance);
app.get('/api/admin/team', authenticateToken, getAdminTeam); 
app.post('/api/admin/team/:id/revoke', authenticateToken, revokeAdminClearance); 
app.post('/api/admin/team/finalize-setup', authRateLimiter, finalizeAdminSetup);

app.get('/api/admin/notifications', authenticateToken, async (req, res) => {
  try {
    const alerts = await db.select().from(adminNotifications).orderBy(desc(adminNotifications.createdAt)).limit(50);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.patch('/api/admin/notifications/read', authenticateToken, async (req, res) => {
  try {
    // ENTERPRISE FIX: Only update rows that are actually unread to prevent massive table locks
    await db.update(adminNotifications)
      .set({ isRead: true })
      .where(eq(adminNotifications.isRead, false));
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

const horizonServer = new Horizon.Server(HORIZON_URL);

async function awakenStellarWallet(destinationAddress: string, startingBalance: string = "2.5") {
  try {
    const funderSecret = process.env.PLATFORM_FUNDING_SECRET;
    if (!funderSecret) throw new Error("Missing PLATFORM_FUNDING_SECRET");
    const funderKeypair = Keypair.fromSecret(funderSecret);
    
    let accountExists = false;
    try { await horizonServer.loadAccount(destinationAddress); accountExists = true; } catch (e) { accountExists = false; }

    // THE CONCURRENCY FIX: Lock and increment the sequence number in-memory!
    const seqNum = await SequenceManager.getNextSequence(funderKeypair.publicKey(), horizonServer);
    const funderAccount = new Account(funderKeypair.publicKey(), seqNum);

    const classicTxBuilder = new TransactionBuilder(funderAccount, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE });
    if (!accountExists) classicTxBuilder.addOperation(Operation.createAccount({ destination: destinationAddress, startingBalance }));
    else classicTxBuilder.addOperation(Operation.payment({ destination: destinationAddress, asset: Asset.native(), amount: startingBalance }));

    const classicTx = classicTxBuilder.setTimeout(60).build();
    classicTx.sign(funderKeypair);
    const response = await horizonServer.submitTransaction(classicTx); 
    return response.hash;
  } catch (error: any) { throw error; }
}

app.post('/api/users/:id/kyc', authenticateToken, async (req, res) => {
  const userId = req.params.id as string;
  const { businessName, registrationNumber, country, bvn, nin, documentUrl } = req.body;
  try {
    if ((req as any).user.userId !== userId) {
      return res.status(403).json({ error: "Forbidden: Cannot submit KYC for another user." });
    }

    const updatedUser = await db.update(users).set({ businessName, registrationNumber, country, bvn, nin, documentUrl, kycStatus: 'pending' }).where(eq(users.id, userId)).returning();
    if (updatedUser.length === 0) return res.status(404).json({ error: "User not found" });

    await NotificationService.alertAdmin('kyc_alert', 'Action Required: KYC Submission', `A new verification application was just submitted. Awaiting compliance review.`);
    res.json({ success: true, user: updatedUser[0] });
  } catch (error) { res.status(500).json({ error: "Failed to save KYC data" }); }
});

app.get('/api/admin/kyc-applications', authenticateToken, async (req, res) => {
  try {
    const pending = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, businessName: users.businessName,
      registrationNumber: users.registrationNumber, country: users.country, bvn: users.bvn, nin: users.nin,
      documentUrl: users.documentUrl, kycStatus: users.kycStatus, createdAt: users.createdAt
    }).from(users).where(eq(users.kycStatus, 'pending')).orderBy(desc(users.createdAt));
    res.json(pending);
  } catch (error: any) { res.status(500).json({ error: "Failed to fetch applications" }); }
});

app.post('/api/admin/kyc/:id/approve', authenticateToken, async (req, res) => {
  const userId = req.params.id as string;
  try {
    const result = await db.update(users).set({ kycStatus: 'approved', isReady: true }).where(eq(users.id, userId)).returning();
    if (result.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result[0];
    
    if (user.walletAddress) await awakenStellarWallet(user.walletAddress, "2.5");
    
    const emailResponse = await EmailService.sendKYCApproved(user.email, user.firstName || 'Blink User');
    if (emailResponse && emailResponse.error) logger.error({ err: emailResponse.error }, "Resend API rejected the KYC approval email.");

    await NotificationService.alertAdmin('kyc_alert', 'KYC Application Approved', `User ${user.email} was successfully verified and provisioned on-chain.`);
    
    // SOC2 AUDIT LOGGING: Record exactly who approved this account
    await db.insert(auditLogs).values({
        adminId: (req as any).user.userId,
        targetUserId: userId,
        action: "KYC_APPROVED",
        description: `Admin approved KYC for user ${user.email}`,
        ipAddress: extractTrueIp(req),
        metadata: { previousState: "pending", newState: "approved" }
    });

    res.json({ success: true, message: "User Approved & Provisioned" });
  } catch (error) { 
    logger.error({ err: error }, "Failed to approve KYC");
    res.status(500).json({ error: "Failed to approve" }); 
  }
});

app.post('/api/admin/kyc/:id/reject', authenticateToken, async (req, res) => {
  const userId = req.params.id as string;
  const { reason } = req.body; 
  try {
    const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRecord.length === 0) return res.status(404).json({ error: "User not found" });
    const user = userRecord[0];

    const finalReason = reason || "Your identity documents did not meet our compliance standards. Please ensure the documents are clear, valid, and match the provided details.";

    await db.update(users).set({ kycStatus: 'rejected', kycRejectionReason: finalReason, isReady: false }).where(eq(users.id, userId));

    const emailResponse = await EmailService.sendKycRejectedAlert(user.email, user.firstName || 'Blink User', finalReason);
    if (emailResponse && emailResponse.error) logger.error({ err: emailResponse.error }, "Resend API actively rejected the KYC rejection email.");

    await NotificationService.alertAdmin('kyc_alert', 'KYC Application Rejected', `User ${user.email} was rejected. Reason: ${finalReason}`);
    
    // SOC2 AUDIT LOGGING: Record exactly who rejected this account
    await db.insert(auditLogs).values({
        adminId: (req as any).user.userId,
        targetUserId: userId,
        action: "KYC_REJECTED",
        description: `Admin rejected KYC for user ${user.email}`,
        ipAddress: extractTrueIp(req),
        metadata: { reason: finalReason }
    });

    res.json({ success: true, message: "User Rejected & Email Dispatched" });
  } catch (error) { 
    logger.error({ err: error }, "Failed to process KYC rejection");
    res.status(500).json({ error: "Failed to reject application" }); 
  }
});

app.post('/api/wallet/activate-usdc', authenticateToken, async (req, res) => {
  try {
    const { userPublicKey } = req.body;
    const funderSecret = process.env.PLATFORM_FUNDING_SECRET;
    
    // 🌟 THE FIX: Dynamic USDC Contract targeting
    const USDC_CONTRACT_ID = process.env.VITE_USDC_CONTRACT_ID || process.env.TESTNET_USDC; 
    
    if (!funderSecret || !USDC_CONTRACT_ID) throw new Error("Missing Treasury configurations.");

    const funderKeypair = Keypair.fromSecret(funderSecret);
    const horizonServer = new Horizon.Server(HORIZON_URL);
    const userAccount = await horizonServer.loadAccount(userPublicKey);

    // 🌟 THE FIX: Dynamic network switching
    const txBuilder = new TransactionBuilder(userAccount, { fee: "100000", networkPassphrase: NETWORK_PASSPHRASE });
    const usdcAsset = new Asset("USDC", funderKeypair.publicKey()); 
    txBuilder.addOperation(Operation.changeTrust({ asset: usdcAsset, limit: "10000000" }));

    const usdcContract = new Contract(USDC_CONTRACT_ID);
    const transferAmountStroops = BigInt(5000 * 10000000); 
    txBuilder.addOperation(usdcContract.call("transfer", nativeToScVal(funderKeypair.publicKey(), { type: 'address' }), nativeToScVal(userPublicKey, { type: 'address' }), nativeToScVal(transferAmountStroops, { type: 'i128' })));

    const tx = txBuilder.setTimeout(180).build();
    tx.sign(funderKeypair);
    res.json({ transactionXdr: tx.toXDR() });
  } catch (error: any) { res.status(500).json({ error: "Failed to generate activation payload." }); }
});

// =========================================================================
// 🚀 SUB-ACCOUNTS
// =========================================================================

app.get('/api/accounts/:parentId/sub-accounts', authenticateToken, async (req, res) => {
  try {
    const parentId = req.params.parentId as string;
    if (!parentId) return res.status(400).json({ error: "Invalid ID" });

    if ((req as any).user.userId !== parentId) return res.status(403).json({ error: "Forbidden: Cannot access these sub-accounts." });

    const accounts = await db.select().from(subAccounts).where(eq(subAccounts.parentId, parentId)).orderBy(desc(subAccounts.createdAt));
    res.status(200).json(accounts);
  } catch (error) { res.status(500).json({ error: "Internal server error" }); }
});

const createSubAccountSchema = z.object({ body: z.object({ parentId: z.string(), name: z.string().min(2).max(100) }) });

app.post('/api/accounts/sub-account', authenticateToken, validate(createSubAccountSchema), async (req, res) => {
  try {
    const { parentId, name } = req.body;

    if ((req as any).user.userId !== parentId) return res.status(403).json({ error: "Forbidden: Cannot create sub-account for this parent." });

    const userResult = await db.select().from(users).where(eq(users.id, parentId));
    if (userResult.length === 0) return res.status(404).json({ error: "Main account not found" });
    
    const mainAccount = userResult[0];
    if (!mainAccount.walletAddress) return res.status(400).json({ error: "User has no wallet" });

    const uniqueMuxedId = (BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000))).toString();
    let muxedAddress: string;
    try {
      const baseAccount = new Account(mainAccount.walletAddress, "0");
      const muxed = new MuxedAccount(baseAccount, uniqueMuxedId);
      muxedAddress = muxed.accountId(); 
    } catch (cryptoErr: any) { return res.status(500).json({ error: "Stellar SDK Cryptography failed" }); }
    
    const newSubAccount = await db.insert(subAccounts).values({ parentId, name, muxedId: uniqueMuxedId, muxedAddress, balance: '0.00' }).returning();
    res.status(201).json(newSubAccount[0]);
  } catch (error: any) { res.status(500).json({ error: "Internal server error" }); }
});

app.get('/api/platform/info', (req, res) => {
  try {
    const funderSecret = process.env.PLATFORM_FUNDING_SECRET;
    if (!funderSecret) throw new Error("Missing");
    res.json({ platformPublicKey: Keypair.fromSecret(funderSecret).publicKey() });
  } catch(e) { res.status(500).json({ error: "Platform key not configured." }); }
});


// =========================================================================
// 🚀 DEFI ORACLE (LIVE YIELD METRICS)
// =========================================================================
app.get('/api/yield-metrics', YieldController.getMetrics);



// =========================================================================
// 🚀 P2P PAYMENT REQUESTS
// =========================================================================
app.use('/api/requests', requestRouter);



// =========================================================================
// 🚀 FRONTEND SYNCING & ESCROW MANAGEMENT
// =========================================================================

app.get('/api/users/:id/wallet-sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id as string;

    if ((req as any).user.userId !== userId) return res.status(403).json({ error: "Forbidden: Cannot sync another user's wallet." });

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userResult.length === 0) return res.status(404).json({ error: "User not found" });

    const userEscrows = await db.select().from(escrows).where(eq(escrows.creatorId, userId));
    const activeEscrowAmount = userEscrows.filter(e => e.status === 'Active' || e.status === 'Ready').reduce((sum, e) => sum + parseFloat(e.amountLocked || "0"), 0);

    // 🌟 FIX: The UI maps 'availableBalance' to the visual Ledger.
    // We calculate the True Ledger (Available + Escrows) so the UI's (Ledger - Escrow) math computes the correct Available balance.
    const trueAvailable = parseFloat(userResult[0].balance || "0");
    const visualLedgerBalance = trueAvailable + activeEscrowAmount;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ availableBalance: visualLedgerBalance, escrowBalance: activeEscrowAmount });
  } catch (error) { res.status(500).json({ error: "Failed to sync wallet balances" }); }
});

app.get('/api/users/:id/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id as string;
    
    if ((req as any).user.userId !== userId) return res.status(403).json({ error: "Forbidden: Cannot view another user's transactions." });

    const userTxs = await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
    res.json(userTxs);
  } catch (error) { res.status(500).json({ error: "Failed to fetch transactions" }); }
});


// =========================================================================
// 🚀 ADMIN COMMAND CENTER: GLOBAL SEARCH ENGINE
// =========================================================================
app.get('/api/admin/search', authenticateToken, async (req, res) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.trim().length < 2) {
      return res.json({ users: [], escrows: [], transactions: [] });
    }

    const searchTerm = `%${query.trim()}%`;
    const isNumeric = !isNaN(Number(query.trim()));

    // 1. Search Users (Emails, Names, and exact Internal DB Trace IDs)
    const matchedUsers = await db.select({
      id: users.id,
      name: users.firstName, 
      email: users.email,
      businessName: users.businessName
    })
    .from(users)
    .where(
      or(
        ilike(users.email, searchTerm),
        ilike(users.firstName, searchTerm),
        ilike(users.businessName, searchTerm),
        ilike(sql`CAST(${users.id} AS TEXT)`, searchTerm) // 🌟 Searches Internal DB Trace
      )
    )
    .limit(5);

    // 2. Search Escrows (Claim IDs, Amounts, and Creator Accounts)
    const escrowConditions: any[] = [
        ilike(escrows.claimId, searchTerm),
        ilike(sql`CAST(${escrows.id} AS TEXT)`, searchTerm),
        ilike(sql`CAST(${escrows.creatorId} AS TEXT)`, searchTerm) // 🌟 Searches User Account
    ];
    if (isNumeric) escrowConditions.push(eq(escrows.amountLocked, query.trim()));

    const matchedEscrows = await db.select({
      id: escrows.id,
      claimId: escrows.claimId,
      status: escrows.status,
      amount: escrows.amountLocked
    })
    .from(escrows)
    .where(or(...escrowConditions))
    .limit(5);

    // 3. Search Transactions (References, Amounts, and User Accounts)
    const txConditions: any[] = [
        ilike(transactions.reference, searchTerm),
        ilike(sql`CAST(${transactions.id} AS TEXT)`, searchTerm), // 🌟 Searches Internal DB Trace
        ilike(sql`CAST(${transactions.userId} AS TEXT)`, searchTerm), // 🌟 Searches User Account
        ilike(sql`CAST(${transactions.subAccountId} AS TEXT)`, searchTerm) // 🌟 FIX: Updated to match your schema
    ];
    if (isNumeric) txConditions.push(eq(transactions.amount, query.trim()));

    const matchedTxs = await db.select({
      id: transactions.id,
      reference: transactions.reference,
      type: transactions.type,
      amount: transactions.amount
    })
    .from(transactions)
    .where(or(...txConditions))
    .limit(5);

    res.json({
      users: matchedUsers,
      escrows: matchedEscrows,
      transactions: matchedTxs
    });

  } catch (error) {
    logger.error({ err: error }, "Global Admin Search Failed");
    res.status(500).json({ error: "Search engine failure." });
  }
});

app.get('/api/admin/metrics', authenticateToken, async (req, res) => {
  try {
    const allEscrows = await db.select().from(escrows);
    const metrics = {
      totalVolume: allEscrows.reduce((sum, e) => sum + parseFloat(e.amountLocked || "0"), 0),
      activeEscrowVolume: allEscrows.filter(e => e.status === 'Active' || e.status === 'Ready').reduce((sum, e) => sum + parseFloat(e.amountLocked || "0"), 0),
      totalRevenue: allEscrows.reduce((sum, e) => sum + parseFloat(e.baseFee || "0") + parseFloat(e.cancellationFee || "0"), 0),
      activeCount: allEscrows.filter(e => e.status === 'Active').length,
      pendingCount: allEscrows.filter(e => e.status === 'Ready').length,
    };
    res.json(metrics);
  } catch (error) { res.status(500).json({ error: "Failed to fetch metrics" }); }
});

app.get('/api/admin/ledger', authenticateToken, async (req, res) => {
  try {
    const globalLedger = await db.select().from(transactions).orderBy(desc(transactions.createdAt));

    // 🌟 ENTERPRISE FIX: SQL Join to fetch true Sender Identity from the Users table
    const rawGlobalPayments = await db.select({
        escrow: escrows,
        senderFirstName: users.firstName,
        senderLastName: users.lastName,
        senderBusinessName: users.businessName,
        senderEmail: users.email
    })
    .from(escrows)
    .leftJoin(users, eq(escrows.creatorId, users.id))
    .orderBy(desc(escrows.createdAt));

    const globalPayments = rawGlobalPayments.map((row: any) => {
      const item = row.escrow;
      
      // Calculate Platform Mathematics
      const feeBps = item.platformFeeBps || 500; 
      const amount = parseFloat(item.amountLocked as string || "0");
      const platformFee = (amount * feeBps) / 10000;
      const netAmount = amount - platformFee;

      // Reconstruct the verified legal name
      const resolvedSenderName = row.senderBusinessName || 
                                 (row.senderFirstName ? `${row.senderFirstName} ${row.senderLastName || ''}`.trim() : null) || 
                                 "Unknown Client";

      return {
        ...item,
        platformFee,
        netAmount,
        senderEmail: row.senderEmail || "No Email Provided",
        senderName: resolvedSenderName
      };
    });

    res.json({ transactions: globalLedger, payments: globalPayments });
  } catch (error) { res.status(500).json({ error: "Internal server error" }); }
});


app.get('/api/dev/preview-email', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Developer routes disabled in production." });
  }
  // 🌟 THE FIX: Pass both the USDC amount and the Fiat amount to satisfy the new 4-argument signature
  // const html = templates.withdrawalCompleted("2.00", "NGN 2,716.20", "REF-123456", new Date().toLocaleString());


  // 🌟 PREVIEW THE NEW CLAIM CODE EMAIL
  const html = templates.escrowClaimCode(
    "150.00",               // amount
    "849201",               // code
    "recipient@email.com"   // recipientEmail
  );

  // 🌟 PREVIEW THE NEW CLAIM CODE EMAIL
  // const html = templates.escrowReceived(
    // "James",               // Sendername
    // "849201",               // code
    // "recipient@email.com"   // recipientEmail
  // )

  res.send(html); 
});


// =========================================================================
// 🚀 SOCIAL MEDIA BOT INTERCEPTOR (DYNAMIC OG META TAGS)
// =========================================================================
app.get('/api/og/claim/:id', async (req, res) => {
    try {
        const claimId = req.params.id;
        
        // Fetch the exact escrow amount from your database
        const escrowRecord = await db.select().from(escrows).where(eq(escrows.claimId, claimId)).limit(1);
        
        // Fallback text if the claim ID is invalid
        const amount = escrowRecord.length > 0 ? escrowRecord[0].amountLocked : "funds";
        const formattedAmount = amount !== "funds" ? `$${parseFloat(amount).toFixed(2)}` : "funds";

        // Generate the raw HTML with Open Graph tags
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Blink Payment</title>
                <!-- Open Graph Meta Tags -->
                <meta property="og:title" content="You have received ${formattedAmount} on Blink" />
                <meta property="og:description" content="Click here to securely claim your funds via your preferred cashout method." />
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://app.ourblink.cash/claim/${claimId}" />
                
                <!-- 1200x630px logo for the preview image -->
                <meta property="og:image" content="https://app.ourblink.cash/og-image.png" />
                
                <!-- Twitter Card Meta Tags -->
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="You have received ${formattedAmount} on Blink" />
                <meta name="twitter:description" content="Click here to securely claim your funds via your preferred cashout method." />
                <meta name="twitter:image" content="https://app.ourblink.cash/og-image.png" />
            </head>
            <body>
                <p>Redirecting to OurBlink...</p>
                <script>window.location.replace("/claim/${claimId}");</script>
            </body>
            </html>
        `;

        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        // Fallback to a generic tag if the database lookup fails
        res.send(`<html><head><meta property="og:title" content="You have received a payment on Blink" /></head><body></body></html>`);
    }
});


// =========================================================================
// 🛡️ 404 CATCH-ALL (Prevents HTML responses on invalid routes)
// =========================================================================
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(404).json({ error: "API endpoint not found." });
});



// =========================================================================
// 🛡️ GLOBAL ERROR HANDLER (Prevents Stack Trace Leaks)
// =========================================================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log the full error internally, but never expose it to the client
  logger.error({ 
      err: err.message, 
      path: req.path,
      method: req.method
  }, 'Unhandled exception caught by global handler');
  
  // Gracefully handle payload limits
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large. Maximum size is 500kb.' });
  }

  // Gracefully handle bad JSON formatting
  if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON payload format.' });
  }
  
  // Return a completely sanitized error to the client
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});


// =========================================================================
// ⏱️ SERVER-SIDE CRON JOB: Automated Expirations, Refunds & Nudges
// =========================================================================
const expiryCron = setInterval(async () => {
  try {
    const now = new Date();
    const activeEscrows = await db.select().from(escrows).where(or(eq(escrows.status, 'Active'), eq(escrows.status, 'Ready')));

    for (const escrow of activeEscrows) {
      if (!escrow.dueDate) continue;

      const timeDiffMs = new Date(escrow.dueDate).getTime() - now.getTime();
      const hoursLeft = timeDiffMs / (1000 * 60 * 60);
      
      // Extract the timeline array to track our email nudges
      const timeline = (escrow.timeline as any[]) || [];

      // ==========================================
      // 🚨 SCENARIO 1: VAULT HAS EXPIRED (TEARDOWN)
      // ==========================================
      if (hoursLeft <= 0) {
        let netYield = 0;

        // 1. FETCH ACTUAL ON-CHAIN YIELD BEFORE REFUNDING
        if (escrow.contractId && escrow.contractId.startsWith("C")) {
           try {
             const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
             const adminKey = Keypair.fromSecret(process.env.TREASURY_SECRET || process.env.PLATFORM_FUNDING_SECRET!);
             const USDC_ID = process.env.VITE_USDC_CONTRACT_ID || process.env.TESTNET_USDC || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

             const account = await server.getAccount(adminKey.publicKey());
             const usdc = new Contract(USDC_ID);

             const tx = new TransactionBuilder(account, {
               fee: "100000",
               networkPassphrase: process.env.NODE_ENV === "production" ? Networks.PUBLIC : Networks.TESTNET
             })
             .addOperation(usdc.call("balance", nativeToScVal(escrow.contractId, { type: "address" })))
             .setTimeout(30)
             .build();

             const simResult = await server.simulateTransaction(tx);
             if (rpc.Api.isSimulationSuccess(simResult)) {
                const rawBalance = Number(scValToNative(simResult.result!.retval));
                const totalBalance = rawBalance / 10000000;
                const principal = parseFloat(escrow.amountLocked || "0");

                if (totalBalance > principal) {
                   const totalYield = totalBalance - principal;
                   const platformFeeBps = 1000;  // Blink keeps its platform cut (e.g., 10%)
                   const platformShare = (totalYield * platformFeeBps) / 10000; 
                   netYield = totalYield - platformShare; // The Sender inherits 100% of the remaining Net Yield
                }
             }
           } catch (yieldErr) {
             logger.warn(`Could not fetch yield for expired escrow ${escrow.claimId}`);
           }
        }

        await db.transaction(async (tx) => {
          const newTimeline = [...timeline, { state: "claim_expired", timestamp: now.toISOString(), metadata: { notes: "Lock period ended. Principal and Accrued Yield returned to Sender." } }];

          // 1. Update the escrow
          // 🛡️ THE CRITICAL FIX: The Atomic Expiry Guard
          const expiredUpdateRes = await tx.update(escrows).set({ 
              status: 'claim_expired', 
              timeline: newTimeline
          }).where(
              and(
                  eq(escrows.id, escrow.id),
                  or(eq(escrows.status, 'Active'), eq(escrows.status, 'Ready'))
              )
          ).returning();
          
          if (expiredUpdateRes.length === 0) {
              logger.warn(`⏳ Cron Collision: Vault ${escrow.claimId} was claimed right before expiry. Sweeper aborting refund.`);
              return; 
          }
          
          const sender = await tx.select().from(users).where(eq(users.id, escrow.creatorId)).limit(1);
          if (sender.length > 0) {
            const principal = parseFloat(escrow.amountLocked || "0");
            
             // 2. REFUND PRINCIPAL + YIELD TO THE SENDER
             const refundAmount = principal + netYield;
             const newBal = (parseFloat(sender[0].balance || "0") + refundAmount).toFixed(2);
             
             await tx.update(users).set({ balance: newBal }).where(eq(users.id, escrow.creatorId));

             // 3. GENERATE THE YIELD HARVEST RECEIPT
             if (netYield > 0) {
                await tx.insert(transactions).values({
                   userId: escrow.creatorId, amount: netYield.toString(), type: "deposit",
                   reference: `${escrow.claimId}_yield`, status: "completed", description: `Yield Harvest: Expired Vault Refund`
                });
             }
             
             // 🌟 2. DISPATCH THE HTML AUTO-REFUND EMAIL TO THE SENDER
             try {
                await EmailService.sendEscrowExpiredRefund(
                    sender[0].email, 
                    principal.toFixed(2), 
                    netYield.toFixed(4), 
                    escrow.recipientEmail
                );
             } catch (emailErr) {
                logger.error({ err: emailErr }, `Failed to send expiry refund email to ${sender[0].email}`);
             }
             
             // 🌟 3. REAL-TIME PUSH: Notify the sender's dashboard instantly!
             sseService.emitToUser(escrow.creatorId, 'escrow_updated', { 
                 claimId: escrow.claimId, 
                 status: 'claim_expired',
                 action: 'refund_processed'
             });
             sseService.emitToUser(escrow.creatorId, 'balance_updated', { 
                 availableBalance: newBal 
             });
          }
          
           // 4. FETCH THE ORIGINAL TRANSACTION AND ATTACH THE YIELD METADATA FOR THE UI
          const originalTx = await tx.select().from(transactions).where(eq(transactions.reference, escrow.claimId)).limit(1);
          if (originalTx.length > 0) {
              const currentMetadata = (originalTx[0].metadata as any) || {};
              await tx.update(transactions).set({ 
                  status: 'expired', metadata: { ...currentMetadata, yieldDistributed: netYield }
              }).where(eq(transactions.id, originalTx[0].id));
          } else {
              await tx.update(transactions).set({ status: 'expired' }).where(eq(transactions.reference, escrow.claimId));
          }
        });
        
        logger.info(`⏳ Cron: Expired Vault ${escrow.claimId}. Refunded Principal + ${netYield.toFixed(4)} USDC yield.`);
      } 
      
      // ==========================================
      // ⚠️ SCENARIO 2: PRE-EXPIRY NUDGES
      // ==========================================
      else {
        let nudgeNeeded = false;
        let hoursToDisplay = 0;
        let nudgeStateMarker = "";

        // Look inside the timeline array to see if we already sent the warning
        const hasNudge72h = timeline.some(t => t.state === 'nudge_72h_sent');
        const hasNudge24h = timeline.some(t => t.state === 'nudge_24h_sent');

        // 3. EVALUATE THRESHOLDS (72 Hours & 24 Hours)
        if (hoursLeft <= 72 && hoursLeft > 24 && !hasNudge72h) {
            nudgeNeeded = true;
            hoursToDisplay = 72;
            nudgeStateMarker = 'nudge_72h_sent';
        } else if (hoursLeft <= 24 && hoursLeft > 0 && !hasNudge24h) {
            nudgeNeeded = true;
            hoursToDisplay = 24;
            nudgeStateMarker = 'nudge_24h_sent';
        }

        // 4. SEND THE WARNING TO THE RECIPIENT
        if (nudgeNeeded) {
            try {
                const sender = await db.select({ businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
                                       .from(users).where(eq(users.id, escrow.creatorId)).limit(1);
                
                const senderName = sender[0]?.businessName || 
                                   (sender[0]?.firstName ? `${sender[0].firstName} ${sender[0].lastName || ''}`.trim() : "A Blink User");

                const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
                const claimLink = `${FRONTEND_URL}/claim/${escrow.claimId}`;
                
                await EmailService.sendEscrowExpiryWarning(
                    escrow.recipientEmail, 
                    escrow.amountLocked as string, 
                    hoursToDisplay, 
                    claimLink, 
                    senderName
                );

                // 🌟 THE FIX: Save the flag directly into the timeline so we don't spam them on the next loop
                const newTimelineEvent = { 
                    state: nudgeStateMarker, 
                    timestamp: new Date().toISOString(), 
                    metadata: { notes: `Automated ${hoursToDisplay}h expiry reminder dispatched.` } 
                };
                
                await db.update(escrows).set({ 
                    timeline: [...timeline, newTimelineEvent] 
                }).where(eq(escrows.id, escrow.id));
                
                logger.info(`📧 Sent ${hoursToDisplay}h expiry nudge to ${escrow.recipientEmail} for claim ${escrow.claimId}`);
            } catch (e) {
                logger.error({ err: e }, "Failed to send expiry nudge");
            }
        }
      }
    }
  } catch (error) { logger.error({ err: error }, "Cron Job Error"); }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3001;

let depositSweeperInterval: NodeJS.Timeout;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Secure Blink Backend running on port ${PORT}`);
  try { 
    // 🌟 Boot up the Soroban Event Listener instead of the classic Horizon listener
    SorobanEventListener.startListening(); 

    // 🌟 START THE YIELD MONITOR
    startYieldMonitor();
    
    // 🌟 1. START THE DISTRIBUTED BULLMQ CRON ENGINE (Heavy DB tasks every 3/15 mins)
    startEnterpriseCronJobs();

    // 🌟 2. START THE LIGHTWEIGHT DEPOSIT LISTENER (Every 10 seconds)
    const sweeper = new SorobanSweeper();
    depositSweeperInterval = setInterval(() => {
        sweeper.pollForDeposits();
    }, 10000);
  } catch (err) { 
    logger.error({ err }, "Background services failed to start"); 
  }
});


// =========================================================================
// 🛡️ THE GRACEFUL SHUTDOWN ENGINE (SIGTERM / SIGINT / EXCEPTIONS)
// =========================================================================
let isShuttingDown = false;

const gracefulShutdown = async (signal: string, err?: any) => {
  // Prevent multiple signals (e.g., SIGTERM + uncaughtException) from triggering overlapping shutdowns
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (err) logger.error({ err }, `[System] Fatal error triggering shutdown: ${signal}`);
  logger.info(`[System] Received ${signal}. Initiating graceful shutdown sequence...`);

  // 🌟 THE 15-SECOND FUSE
  // If the graceful shutdown hangs (e.g., Redis deadlock), we force a kill after 15s 
  // to prevent the orchestrator from issuing a catastrophic SIGKILL.
  const shutdownTimeout = setTimeout(() => {
      logger.error('[System] 🚨 Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
  }, 15000);

  try {
    // 1. Clear all internal memory intervals
    clearInterval(expiryCron);
    if (depositSweeperInterval) clearInterval(depositSweeperInterval);
    logger.info('[System] Local intervals and sweepers cleared.');

    // 2. 🌟 THE SSE ZOMBIE FIX: Stop new requests AND sever active keep-alive streams
    server.close(() => logger.info('[System] HTTP server closed.'));
    
    // Explicitly sever all active connections (Node v18.2.0+ native method)
    // This forces your frontend SSE streams to disconnect and cleanly reconnect later
    if (server.closeAllConnections) {
        server.closeAllConnections();
    }

    // 3. Tell BullMQ workers to safely finish active database transactions
    await Promise.all([
      escrowWorker.close(),
      cronWorker.close()
    ]);
    
    logger.info(`[System] All active workers finished their tasks and closed safely.`);
    
    // 4. Safely exit
    clearTimeout(shutdownTimeout);
    process.exit(err ? 1 : 0);
  } catch (error) {
    logger.error({ err: error }, `[System] Error during graceful shutdown.`);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// 🌟 INTERCEPT ALL TERMINATION SIGNALS AND FATAL ERRORS
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C in terminal
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Server restart/kill commands
process.on('uncaughtException', (err) => gracefulShutdown('uncaughtException', err));
process.on('unhandledRejection', (reason) => gracefulShutdown('unhandledRejection', reason));
import { Request, Response } from 'express';
import { db } from '../db';
import { users, auditLogs, transactions } from '../schema';
import { extractTrueIp } from '../utils/security.userIP';
import { eq, or, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { EmailService } from '../services/EmailService';
import bcrypt from 'bcrypt';

// IMPORTS FOR THE SENTINEL
import { rpc, Contract, Networks, Keypair, TransactionBuilder, scValToNative, Account, nativeToScVal, xdr, Horizon } from "@stellar/stellar-sdk";
import Redis from "ioredis";
import { logger } from '../logger';
import { NotificationService } from '../services/NotificationService';

// FIX 1: Aligned interface exactly with our true JWT payload
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    email?: string;
    [key: string]: any; 
  };
}

// ==========================================
// PROVISION NEW ADMIN
// ==========================================
export const provisionAdmin = async (req: AuthRequest, res: Response) => {
  try {
    // 1. 🛡️ RBAC Authorization Check
    const activeAdminRole = req.user?.role; 
    
    if (activeAdminRole !== 'super_admin') {
      return res.status(403).json({ error: "Unauthorized. Only Super Admins can provision infrastructure access." });
    }

    const { name, email, role, department, modules } = req.body;

    // 2. Validate Inputs
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Name, email, and clearance role are absolutely required." });
    }

    // 3. Check for existing user conflicts
    const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    
    if (existingUser.length > 0) {
      return res.status(409).json({ 
        error: "An account with this email already exists. Use the clearance upgrade tool instead." 
      });
    }

    // 4. 🔐 Generate Cryptographic Magic Token
    const rawProvisionToken = crypto.randomBytes(32).toString('hex');
    const hashedProvisionToken = crypto.createHash('sha256').update(rawProvisionToken).digest('hex');
    
    const tokenExpires = new Date();
    tokenExpires.setHours(tokenExpires.getHours() + 24);

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // 5. Insert the "Ghost" Account into Postgres
    await db.insert(users).values({
      email: email.toLowerCase(),
      firstName,
      lastName,
      role,
      department,
      modules,
      provisionToken: hashedProvisionToken,
      provisionExpires: tokenExpires,
      id: crypto.randomUUID() 
    });

    // 6. ✉️ Dispatch the Secure Email 
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173'; 
    const setupLink = `${baseUrl}/admin/setup?token=${rawProvisionToken}&email=${encodeURIComponent(email)}`;
      
    // 🌟 THE FIX 2: Decoupled the email dispatch. 
    // If the email provider fails, it logs the error but allows the DB transaction to complete successfully.
    EmailService.sendAdminProvisioning(
      email, 
      firstName, 
      role.replace('_', ' '), 
      setupLink
    ).catch(err => {
      console.error(`[Non-Fatal] Failed to send provisioning email to ${email}:`, err);
    });

    return res.status(200).json({ 
      success: true, 
      message: `Provisioning sequence initiated. Secure link dispatched to ${email}.` 
    });

  } catch (error) {
    console.error("Critical error in provisionAdmin:", error);
    return res.status(500).json({ error: "Internal server error during provisioning sequence." });
  }
};


// ==========================================
// FINALIZE ADMIN PROVISIONING
// ==========================================
export const finalizeAdminSetup = async (req: Request, res: Response) => {
  try {
    const { email, token, password } = req.body;

    // 1. Strict Input Validation
    if (!email || !token || !password) {
      return res.status(400).json({ error: "Email, security token, and passphrase are strictly required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Passphrase must be at least 8 characters to meet cryptographic standards." });
    }

    // 2. Fetch the pending "Ghost" account
    const userRecords = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    const user = userRecords[0];

    if (!user || !user.provisionToken) {
      return res.status(403).json({ error: "Invalid provisioning sequence. This account may have already been initialized." });
    }

    // 3. Cryptographic Token Verification
    const hashedIncomingToken = crypto.createHash('sha256').update(token).digest('hex');
    
    if (hashedIncomingToken !== user.provisionToken) {
      return res.status(401).json({ error: "Invalid or forged security token." });
    }

    // 4. Token Expiration Check
    if (user.provisionExpires && new Date() > user.provisionExpires) {
      return res.status(401).json({ error: "Security token has expired. Please request a new clearance invitation from a Super Admin." });
    }

    // 5. Generate Secure Password Hash
    const passwordHash = await bcrypt.hash(password, 10);

    // 6. Finalize the Database Record
    await db.update(users)
      .set({
        passwordHash,
        provisionToken: null,
        provisionExpires: null,
        isReady: true, // Clear for duty
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    return res.status(200).json({ 
      success: true, 
      message: "Cryptographic clearance initialized successfully." 
    });

  } catch (error) {
    console.error("Critical error in finalizeAdminSetup:", error);
    return res.status(500).json({ error: "Internal server error during finalization sequence." });
  }
};



// ==========================================
// FETCH ISOLATED PERSONNEL LEDGER
// ==========================================
export const getAdminTeam = async (req: AuthRequest, res: Response) => {
  try {
    const activeAdminRole = req.user?.role;
    if (activeAdminRole !== 'super_admin' && activeAdminRole !== 'admin') {
      return res.status(403).json({ error: "Unauthorized. Admin clearance required." });
    }

    const team = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      department: users.department,
      modules: users.modules, 
      createdAt: users.createdAt
    })
    .from(users)
    .where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')))
    .orderBy(desc(users.createdAt));

    const formattedTeam = team.map(admin => ({
      ...admin,
      name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || 'Admin'
    }));

    return res.status(200).json(formattedTeam);
  } catch (error) {
    console.error("Critical error fetching admin team:", error);
    return res.status(500).json({ error: "Internal server error fetching ledger." });
  }
};

// ==========================================
// REVOKE ADMIN CLEARANCE
// ==========================================
export const revokeAdminClearance = async (req: AuthRequest, res: Response) => {
  try {
    const activeAdminRole = req.user?.role;
    const activeAdminId = req.user?.userId;
    
    if (activeAdminRole !== 'super_admin') {
      return res.status(403).json({ error: "Unauthorized. Only Super Admins can revoke clearances." });
    }

    const targetUserId = req.params.id as string; 

    if (activeAdminId === targetUserId) {
      return res.status(403).json({ error: "Security violation: You cannot revoke your own clearance." });
    }

    await db.update(users)
      .set({ role: 'user', department: null, modules: null, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    return res.status(200).json({ success: true, message: "Clearance successfully revoked." });
  } catch (error) {
    console.error("Critical error revoking clearance:", error);
    return res.status(500).json({ error: "Internal server error during revocation." });
  }
};


// ==========================================
// UPGRADE EXISTING USER CLEARANCE
// ==========================================
export const upgradeAdminClearance = async (req: AuthRequest, res: Response) => {
  try {
    // 1. 🛡️ RBAC Authorization Check
    const activeAdminRole = req.user?.role;
    const activeAdminId = req.user?.userId;
    
    if (activeAdminRole !== 'super_admin') {
      return res.status(403).json({ error: "Unauthorized. Only Super Admins can modify infrastructure clearances." });
    }

    const { email, role, department, modules } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: "Email and target clearance role are required." });
    }

    // 2. Fetch the existing user
    const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    const user = existingUser[0];

    if (!user) {
      return res.status(404).json({ error: "Account not found. Please use the Provisioning tool for new personnel." });
    }

    // 3. 🛡️ Self-Modification Guardrail
    if (user.id === activeAdminId) {
      return res.status(403).json({ error: "Security violation: You cannot modify your own clearance level." });
    }

    // 4. Update the user's clearance in Postgres
    await db.update(users)
      .set({
        role,
        department,
        modules,
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    // 5. ✉️ Dispatch the Notification Email
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    EmailService.sendClearanceUpgradeAlert(
      user.email,
      user.firstName || 'Team Member',
      role.replace('_', ' '),
      baseUrl
    ).catch(err => console.error("Failed to send upgrade alert:", err));

    return res.status(200).json({ 
      success: true, 
      message: `${user.email} has been successfully upgraded to ${role.replace('_', ' ')}.` 
    });

  } catch (error) {
    console.error("Critical error in upgradeAdminClearance:", error);
    return res.status(500).json({ error: "Internal server error during clearance upgrade." });
  }
};


// ==========================================
// 🚨 SOC2: TOGGLE USER FREEZE STATUS
// ==========================================
export const toggleFreezeUser = async (req: AuthRequest, res: Response) => {
    try {
        // 🌟 TYPE FIX: Explicitly cast to string for Drizzle ORM
        const adminId = req.user?.userId as string;
        if (!adminId) return res.status(401).json({ error: "Unauthorized." });
        
        // 🌟 TYPE FIX: Explicitly cast the URL param to string
        const targetUserId = req.params.id as string;

        // 1. Fetch the target user
        const targetUserRecord = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
        if (targetUserRecord.length === 0) return res.status(404).json({ error: "User not found." });
        const user = targetUserRecord[0];

        // 2. Toggle the state
        const newFreezeState = !user.isFrozen; 

        // 3. Update the database
        await db.update(users).set({ isFrozen: newFreezeState }).where(eq(users.id, targetUserId));

        // 4. 🌟 IMMUTABLE SOC2 AUDIT LOG
        await db.insert(auditLogs).values({
            adminId,
            targetUserId,
            action: newFreezeState ? "ACCOUNT_FROZEN" : "ACCOUNT_UNFROZEN",
            description: `Admin ${newFreezeState ? 'suspended' : 'restored'} access for account ${user.email}`,
            ipAddress: extractTrueIp(req),
            metadata: { previousState: user.isFrozen, newState: newFreezeState }
        });

        return res.status(200).json({ 
            success: true, 
            isFrozen: newFreezeState, 
            message: `User account successfully ${newFreezeState ? 'frozen' : 'unfrozen'}.` 
        });
    } catch (error) {
        console.error("[Admin Controller] Freeze Toggle Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ==========================================
// 🏦 SOC2: RECORD TREASURY SWEEP
// ==========================================
export const logTreasurySweep = async (req: AuthRequest, res: Response) => {
    try {
        const adminId = req.user?.userId;
        if (!adminId) return res.status(401).json({ error: "Unauthorized." });

        const { txHash, amountSwept } = req.body;

        if (!txHash || !amountSwept) {
            return res.status(400).json({ error: "Missing transaction hash or amount." });
        }

        // 1. Record the sweep in global transactions so it reflects in the Revenue/Dashboard metrics
        await db.insert(transactions).values({
            userId: adminId, 
            amount: amountSwept.toString(),
            type: "withdrawal", // Sweeping out of platform into corporate cold storage
            reference: `SWEEP_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            status: "completed",
            txHash,
            description: "Treasury Fee Sweep to Corporate Cold Wallet",
        });

        // 2. 🌟 IMMUTABLE SOC2 AUDIT LOG
        await db.insert(auditLogs).values({
            adminId,
            action: "TREASURY_SWEPT",
            description: `Admin executed treasury sweep of $${amountSwept} USDC to corporate.`,
            ipAddress: extractTrueIp(req),
            metadata: { txHash, amountSwept }
        });

        return res.status(200).json({ success: true, message: "Treasury sweep successfully verified and audited." });
    } catch (error) {
        console.error("[Admin Controller] Treasury Sweep Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};


// ==========================================
// 🛡️ SECURITY SENTINEL: FETCH TELEMETRY
// ==========================================
export const getSentinelTelemetry = async (req: AuthRequest, res: Response) => {
    try {
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        const rawTelemetry = await redis.get('invariant_monitor:telemetry');
        const strikes = await redis.get('invariant_monitor:consecutive_strikes');

        // 1. Instantly verify the physical blast doors on Soroban
        const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
        const factoryKey = xdr.ScVal.scvLedgerKeyContractInstance();
        let isPaused = false;
        try {
            const factoryEntry = await server.getContractData(process.env.FACTORY_CONTRACT_ID!, factoryKey);
            const instanceMap = factoryEntry?.val.contractData().val().instance().storage();
            const isPausedEntry = instanceMap?.find((item: any) => {
                try { return scValToNative(item.key()) === "PAUSED"; } catch { return false; }
            });
            if (isPausedEntry && scValToNative(isPausedEntry.val()) === true) {
                isPaused = true;
            }
        } catch (e) {
            logger.warn("Telemetry API: Could not read factory pause state.");
        }

        // 2. Default state if the cron hasn't run its first loop yet
        let telemetry = {
            web2Liabilities: 0,
            web3Assets: 0,
            deficit: 0,
            activeVaults: 0,
            sentinelStrikes: Number(strikes || 0),
            isFactoryPaused: isPaused,
            lastAuditTime: new Date().toISOString()
        };

        // 3. Merge the mathematical invariants calculated by the background Cron
        if (rawTelemetry) {
            const parsed = JSON.parse(rawTelemetry);
            telemetry = { 
                ...telemetry, 
                ...parsed, 
                sentinelStrikes: Number(strikes || 0), 
                isFactoryPaused: isPaused 
            };
        }

        return res.status(200).json(telemetry);
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch Sentinel Telemetry.");
        return res.status(500).json({ error: "Failed to fetch telemetry" });
    }
};

// ==========================================
// 🛑 MANUAL KILL SWITCH
// ==========================================
export const manualKillSwitch = async (req: AuthRequest, res: Response) => {
    try {
        const adminId = req.user?.userId;
        const adminRole = req.user?.role;

        if (!adminId || (adminRole !== 'admin' && adminRole !== 'super_admin')) {
            return res.status(403).json({ error: "Unauthorized. Admin clearance required to engage Kill Switch." });
        }

        const server = new rpc.Server(process.env.SOROBAN_RPC_URL!);
        const HORIZON_URL = process.env.NODE_ENV === 'production' ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
        const horizonServer = new Horizon.Server(HORIZON_URL);

        const adminKeypair = Keypair.fromSecret(process.env.PLATFORM_FUNDING_SECRET!);
        const factoryContract = new Contract(process.env.FACTORY_CONTRACT_ID!);
        
        // Get sequence number
        const accountInfo = await server.getAccount(adminKeypair.publicKey());

        // Get available XLM balance for dynamic fee
        let availableXlm = 100;
        try {
            const horizonAccount = await horizonServer.loadAccount(adminKeypair.publicKey());
            availableXlm = Number(horizonAccount.balances.find((b: any) => b.asset_type === "native")?.balance || "0");
        } catch (e) {
            logger.warn("⚠️ [Kill Switch] Horizon unavailable for fee check. Defaulting to 10 XLM surge fee.");
        }

        let dynamicEmergencyFee = "100000000"; // 10 XLM
        if (availableXlm < 10) dynamicEmergencyFee = "10000000"; // 1 XLM
        if (availableXlm < 1) dynamicEmergencyFee = "1000000"; // 0.1 XLM

        const pauseTx = new TransactionBuilder(accountInfo, { fee: dynamicEmergencyFee, networkPassphrase: process.env.NODE_ENV === 'production' ? Networks.PUBLIC : Networks.TESTNET })
            .addOperation(factoryContract.call("admin_pause_factory", nativeToScVal(true, { type: 'bool' })))
            .setTimeout(60)
            .build();

        const preparedTx = await server.prepareTransaction(pauseTx) as any;
        preparedTx.sign(adminKeypair);
        const sentTx = await server.sendTransaction(preparedTx);

        if (sentTx.status === "ERROR") {
            const errorPayload = (sentTx as any).errorResultXdr || JSON.stringify(sentTx);
            throw new Error(`tx_error_${errorPayload}`);
        }

        // Polling
        let txStatus = await server.getTransaction(sentTx.hash);
        let pollAttempts = 0;
        
        while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && pollAttempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            txStatus = await server.getTransaction(sentTx.hash);
            pollAttempts++;
        }

        if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
            throw new Error(`Kill Switch rejected by ledger. Status: ${txStatus.status}`);
        }

        logger.warn(`🚨 MANUAL KILL SWITCH ENGAGED BY ADMIN: ${adminId}. Hash: ${sentTx.hash}`);
        
        await NotificationService.alertAdmin(
            'system_alert', 
            '🚨 MANUAL DEFCON 1: PROTOCOL FROZEN', 
            `Admin ${adminId} has engaged the manual circuit breaker. The Factory is paused.`
        );

        // SOC2 Audit Log
        await db.insert(auditLogs).values({
            adminId,
            action: "KILL_SWITCH_ENGAGED",
            description: `Admin manually engaged global protocol kill switch.`,
            ipAddress: extractTrueIp(req),
            metadata: { txHash: sentTx.hash }
        });

        return res.status(200).json({ success: true, hash: sentTx.hash });
    } catch (error: any) {
        logger.error({ err: error }, "Failed to broadcast pause command.");
        return res.status(500).json({ error: "Failed to broadcast pause command." });
    }
};

// ==========================================
// 🟢 MANUAL RESUME PROTOCOL
// ==========================================
export const manualResumeProtocol = async (req: AuthRequest, res: Response) => {
    try {
        const adminId = req.user?.userId;
        const adminRole = req.user?.role;
        
        if (!adminId || (adminRole !== 'admin' && adminRole !== 'super_admin')) {
            return res.status(403).json({ error: "Unauthorized. Admin clearance required to resume protocol." });
        }

        const server = new rpc.Server(process.env.SOROBAN_RPC_URL!);
        const adminKeypair = Keypair.fromSecret(process.env.PLATFORM_FUNDING_SECRET!);
        const factoryContract = new Contract(process.env.FACTORY_CONTRACT_ID!);
        
        const accountInfo = await server.getAccount(adminKeypair.publicKey());
        
        const resumeTx = new TransactionBuilder(accountInfo, { 
            fee: "50000000", // 5 XLM priority fee
            networkPassphrase: process.env.NODE_ENV === 'production' ? Networks.PUBLIC : Networks.TESTNET 
        })
        .addOperation(factoryContract.call("admin_pause_factory", nativeToScVal(false, { type: 'bool' })))
        .setTimeout(60)
        .build();

        const preparedTx = await server.prepareTransaction(resumeTx) as any;
        preparedTx.sign(adminKeypair);
        
        const sentTx = await server.sendTransaction(preparedTx);
        if (sentTx.status === "ERROR") {
            const errorPayload = (sentTx as any).errorResultXdr || JSON.stringify(sentTx);
            throw new Error(`tx_error_${errorPayload}`);
        }

        let txStatus = await server.getTransaction(sentTx.hash);
        let pollAttempts = 0;
        
        while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND && pollAttempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            txStatus = await server.getTransaction(sentTx.hash);
            pollAttempts++;
        }

        if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
            throw new Error(`Resume command rejected by ledger. Status: ${txStatus.status}`);
        }

        logger.info(`✅ ALL CLEAR: PROTOCOL RESUMED BY ADMIN: ${adminId}. Hash: ${sentTx.hash}`);
        
        await NotificationService.alertAdmin(
            'system_alert', 
            '✅ PROTOCOL RESUMED', 
            `Admin ${adminId} has successfully lifted the Factory lockdown. Escrows are routing normally.`
        );

        // SOC2 Audit Log
        await db.insert(auditLogs).values({
            adminId,
            action: "PROTOCOL_RESUMED",
            description: `Admin manually resumed global protocol operations.`,
            ipAddress: extractTrueIp(req),
            metadata: { txHash: sentTx.hash }
        });

        return res.status(200).json({ success: true, hash: sentTx.hash });

    } catch (error: any) {
        logger.error({ err: error }, "🚨 FAILED TO RESUME PROTOCOL.");
        return res.status(500).json({ error: "Failed to broadcast resume command." });
    }
};
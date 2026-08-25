
import { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';
import { 
    rpc, 
    Contract, 
    Address, 
    Keypair, 
    TransactionBuilder, 
    Networks, 
    scValToNative 
} from '@stellar/stellar-sdk';

/**
 * 🌟 HIGH-INTEGRITY BALANCE SYNC
 * Reaches directly into the Soroban smart contract to fetch the user's true on-chain balance.
export const syncAndGetWalletBalance = async (userId: string): Promise<number> => {
    const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRecord.length === 0) return 0;
    
    const user = userRecord[0];
    const safeDbBalance = user.balance || "0"; // 🌟 THE FIX: Null-safe fallback defined once
    const dbBalance = parseFloat(safeDbBalance);

    if (!user.walletAddress) return dbBalance;

    try {
        const IS_MAINNET = process.env.NODE_ENV === 'production';
        const NETWORK_PASSPHRASE = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
        const RPC_URL = process.env.VITE_SOROBAN_RPC_URL || (IS_MAINNET ? "https://soroban-rpc.mainnet.stellar.org" : "https://soroban-testnet.stellar.org");
        const NATIVE_TOKEN_ID = process.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

        const server = new rpc.Server(RPC_URL);
        const tokenContract = new Contract(NATIVE_TOKEN_ID);

        const TREASURY_SECRET = process.env.PLATFORM_FUNDING_SECRET;
        if (!TREASURY_SECRET) return dbBalance; 

        const adminKeypair = Keypair.fromSecret(TREASURY_SECRET);
        const adminAccount = await server.getAccount(adminKeypair.publicKey());

        const tx = new TransactionBuilder(adminAccount, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
            .addOperation(tokenContract.call("balance", new Address(user.walletAddress).toScVal()))
            .setTimeout(30)
            .build();

        const simulation = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
            const stroops = scValToNative(simulation.result.retval);
            const trueOnChainBalance = (Number(stroops) / 10000000).toFixed(2);

            // Reconciliation: The Blockchain is the ultimate source of truth
            if (trueOnChainBalance !== safeDbBalance) {
                if (parseFloat(trueOnChainBalance) === 0 && dbBalance > 0) {
                    logger.warn(`[Sync Engine] Blocked suspicious wipe...`);
                    return dbBalance;
                }

                // 🌟 FIX: We log the discrepancy for admin auditing, but we DO NOT overwrite the Postgres DB.
                // Overwriting here destroys virtual fee deductions and pending escrows.
                logger.info(`[Sync Engine] Chain reports $${trueOnChainBalance}, but DB virtual ledger holds $${safeDbBalance}. Retaining DB state.`);
                
                // REMOVED: await db.update(users).set({ balance: trueOnChainBalance }).where(eq(users.id, userId));
                
                return dbBalance; // 🌟 ALWAYS return the database truth
            }
        }
        
        return dbBalance;
    } catch (error) {
        logger.warn({ err: error }, `[Sync Engine] Soroban RPC timeout for user ${userId}. Falling back to DB cache.`);
        return dbBalance;
    }
};
*/


/**
 * 🌟 HIGH-INTEGRITY BALANCE SYNC
 * The PostgreSQL Virtual Ledger is the absolute source of truth for platform availability.
 * We no longer poll the raw Soroban chain here, as it lacks context on platform fees/locks.
 */
export const syncAndGetWalletBalance = async (userId: string): Promise<number> => {
    const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRecord.length === 0) return 0;
    
    const user = userRecord[0];
    const safeDbBalance = user.balance || "0"; 
    const dbBalance = parseFloat(safeDbBalance);

    // 🌟 RETURN THE DB TRUTH IMMEDIATELY
    // No RPC calls. No network latency. Absolute database sovereignty.
    return dbBalance;
};


/**
 * 🌟 FETCH DASHBOARD PROFILE
 * The endpoint your frontend calls when the app loads to get the user data & live balance.
 */
export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId; 

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized request." });
        }

        // 1. Trigger the sync engine first to ensure absolute state accuracy
        await syncAndGetWalletBalance(userId);

        // 2. Fetch the newly corrected user data
        const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (userRecord.length === 0) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const user = userRecord[0];

        // 3. Strip sensitive data before sending to React frontend
        const { passwordHash, resetToken, resetOtp, ...safeUser } = user;

        const formattedUser = {
            ...safeUser,
            name: `${user.firstName} ${user.lastName}`,
            type: user.accountType === "business" ? "Business" : "Individual",
            balance: parseFloat(user.balance || "0")
        };

        return res.status(200).json({ success: true, user: formattedUser });

    } catch (error) {
        logger.error({ err: error }, "Failed to fetch user profile.");
        return res.status(500).json({ error: "Internal server error fetching profile." });
    }
};


/**
 * FETCH USER IDENTITY
 * The endpoint your frontend calls when the app get user identity in our contact directory
 */
export const lookupUserIdentity = async (req: Request, res: Response) => {
    try {
        const email = (req.query.email as string)?.toLowerCase().trim();
        if (!email) return res.status(400).json({ error: "Email query parameter required." });

        const targetUser = await db.select({
            firstName: users.firstName,
            lastName: users.lastName,
            businessName: users.businessName,
        }).from(users).where(eq(users.email, email)).limit(1);

        if (targetUser.length > 0) {
            const user = targetUser[0];
            const displayName = user.businessName || `${user.firstName} ${user.lastName || ''}`.trim();
            return res.json({ isBlinkUser: true, name: displayName });
        }
        
        return res.json({ isBlinkUser: false });
    } catch (error) {
        return res.status(500).json({ error: "Identity resolution failed." });
    }
};


/**
 * 🌟 UPDATE USER PROFILE (Finalize Google Auth / Account Setup)
 * Merges Web3 Wallet data into an existing account (e.g., created via Google OAuth).
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    // 🌟 THE FIX: Explicitly cast the parameter as a string
    const id = req.params.id as string;
    
    // 🛡️ SECURITY GUARD: Cross-check the session token ID with the requested URL ID
    const sessionUserId = (req as any).user.userId;
    if (sessionUserId !== id) {
        return res.status(403).json({ error: "Forbidden: You cannot modify a different user's account." });
    }

    const { 
      accountType, 
      country, 
      services, 
      walletAddress, 
      encryptedWalletKey, 
      timezone 
    } = req.body;

    // 🛡️ SECURITY GUARD: Prevent incomplete wallet states
    if (!walletAddress || !encryptedWalletKey) {
      return res.status(400).json({ error: "Cryptographic wallet keys are strictly required to finalize this account." });
    }

    // 1. Update the database record
    const updatedUsers = await db.update(users)
      .set({
        accountType,
        country,
        services,
        walletAddress,
        encryptedWalletKey,
        timezone,
        // 🌟 THE FIX: Removed `isReady: true`. 
        // This forces the Google user to go through the KYC AccountSetupFlow!
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();

    const updatedUser = updatedUsers[0];

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // 2. Format the payload exactly as the frontend Zustand store expects it
    const formattedUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      name: `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`.trim(),
      type: updatedUser.accountType === "business" ? "Business" : "Individual",
      walletAddress: updatedUser.walletAddress,
      encryptedWalletKey: updatedUser.encryptedWalletKey,
      balance: parseFloat(updatedUser.balance || '0'),
      isReady: updatedUser.isReady,
      kycStatus: updatedUser.kycStatus
    };

    return res.status(200).json({
      message: "Account setup finalized successfully.",
      user: formattedUser
    });

  } catch (error) {
    logger.error({ err: error }, "Failed to update user profile.");
    return res.status(500).json({ error: "Failed to update user profile." });
  }
};
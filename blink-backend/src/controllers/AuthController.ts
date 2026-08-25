// src/controllers/AuthController.ts
import { Request, Response } from 'express';
import { EmailService } from '../services/EmailService';
import { db } from '../db';
import { otps, users } from '../schema'; 
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';         
import jwt from 'jsonwebtoken';      
import crypto from 'crypto';
import { subAccounts } from '../schema'; 
import { Account, MuxedAccount } from '@stellar/stellar-sdk';
import { captureSecurityMetadata, extractTrueIp } from '../utils/security.userIP';
import { OAuth2Client } from 'google-auth-library';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ==========================================
// 1. SEND OTP
// ==========================================
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const rawEmail = req.body.email;
    if (!rawEmail) return res.status(400).json({ error: "Email is required" });
    
    // 🌟 FIX: Case-insensitive email normalization
    const email = rawEmail.toLowerCase().trim();

    // 🌟 FIX: Cryptographically secure RNG for financial-grade OTPs
    const code = crypto.randomInt(100000, 1000000).toString();
    
    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Write to Neon Postgres using Drizzle (Upsert logic)
    await db.insert(otps)
      .values({
        email,
        code,
        expiresAt,
        isUsed: false
      })
      .onConflictDoUpdate({
        target: otps.email,
        set: {
          code,
          expiresAt,
          isUsed: false,
          updatedAt: new Date()
        }
      });

    // Dispatch Email via Resend
    const { error } = await EmailService.sendOTP(email, code);
    
    if (error) {
      console.error("Resend Error:", error);
      return res.status(500).json({ error: "Failed to dispatch email via provider." });
    }

    return res.status(200).json({ message: "Verification code sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================================
// 2. VERIFY OTP
// ==========================================
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, otp } = req.body;
    if (!rawEmail || !otp) return res.status(400).json({ error: "Email and code required" });

    const email = rawEmail.toLowerCase().trim();

    // Fetch OTP record from database
    const records = await db.select().from(otps).where(eq(otps.email, email)).limit(1);
    const record = records[0];

    // Cryptographic and State Validation
    if (!record) {
      return res.status(404).json({ error: "No verification code found for this email." });
    }
    
    if (record.isUsed) {
      return res.status(401).json({ error: "This code has already been used. Please request a new one." });
    }

    if (record.code !== otp) {
      return res.status(401).json({ error: "Invalid verification code." });
    }
    
    // Check Expiry
    if (new Date() > record.expiresAt) {
      return res.status(401).json({ error: "Verification code has expired. Please request a new one." });
    }

    // Mark as used in Postgres to prevent Replay Attacks
    await db.update(otps)
      .set({ isUsed: true, updatedAt: new Date() })
      .where(eq(otps.email, email));

    return res.status(200).json({ message: "Email verified successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================================
// 3. LOGIN (WEB2 CREDENTIALS -> JWT)
// ==========================================
export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const email = rawEmail.toLowerCase().trim();

    // 1. Fetch the user from the Neon Postgres database
    const userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRecords[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // 🛡️ THE GHOST ACCOUNT BLOCK
    if (!user.passwordHash) {
      return res.status(403).json({ 
        error: "Account initialization incomplete. Please check your email for the setup link to create your password." 
      });
    }

    // 2. Cryptographically verify the password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (user.isFrozen) {
      return res.status(403).json({ error: "This account has been suspended. Please contact support." });
    }

    // 3. Generate the JSON Web Token (JWT)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("FATAL: JWT_SECRET environment variable is missing.");
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // 4. Strip sensitive data before sending the user object back to the React frontend
    const { passwordHash, resetOtp, resetToken, ...safeUser } = user;

    // Map `accountType` to `type` and ensure names are combined so the frontend parses it correctly
    const formattedUser = {
      ...safeUser,
      name: `${user.firstName} ${user.lastName}`,
      type: user.accountType === "business" ? "Business" : "Individual"
    };

    const ipAddress = extractTrueIp(req); 
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    const currentTime = new Date().toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' });

    // Asynchronously fire the login alert
    EmailService.sendLoginAlert(
      user.email,
      user.firstName || 'User',
      currentTime,
      userAgent as string,
      ipAddress 
    ).catch(err => {
      console.error("Failed to send login alert to", user.email, err);
    });

    // Capture the true IP and Geolocation silently in the background
    captureSecurityMetadata(user.id, req);

    // 🌟 THE ENTERPRISE UPGRADE: Set the HttpOnly Cookie
    res.cookie('bingtellar_jwt', token, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict', // 🌟 UNIFIED CSRF PROTECTION
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
    });

    return res.status(200).json({
      message: "Authentication successful.",
      user: formattedUser
    });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Internal server error during authentication." });
  }
};

// ==========================================
// 4. VERIFY OTP FOR PASSWORD RESET
// ==========================================
export const verifyResetOtp = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, otp } = req.body;
    if (!rawEmail || !otp) return res.status(400).json({ error: "Email and code required" });

    const email = rawEmail.toLowerCase().trim();

    // 1. Fetch OTP record
    const records = await db.select().from(otps).where(eq(otps.email, email)).limit(1);
    const record = records[0];

    if (!record || record.isUsed || record.code !== otp || new Date() > record.expiresAt) {
      return res.status(401).json({ error: "Invalid or expired recovery code." });
    }

    // 2. Mark OTP as used
    await db.update(otps).set({ isUsed: true, updatedAt: new Date() }).where(eq(otps.email, email));

    // 3. Generate a secure, temporary reset token (Valid for 15 minutes)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    // 4. Save the token to the user's database record
    await db.update(users)
      .set({ resetToken, tokenExpiry, updatedAt: new Date() })
      .where(eq(users.email, email));

    return res.status(200).json({ 
      message: "Recovery code verified.", 
      resetToken 
    });

  } catch (err) {
    console.error("Verify Reset Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================================
// 5. UPDATE TO NEW PASSWORD
// ==========================================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, resetToken, newPassword } = req.body;

    if (!rawEmail || !resetToken || !newPassword) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const email = rawEmail.toLowerCase().trim();

    // 1. Find the user
    const userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRecords[0];

    if (!user) {
      return res.status(404).json({ error: "Account not found." });
    }

    // 2. Validate the Reset Token
    if (user.resetToken !== resetToken) {
      return res.status(401).json({ error: "Invalid or unauthorized reset token." });
    }

    if (!user.tokenExpiry || new Date() > user.tokenExpiry) {
      return res.status(401).json({ error: "Reset token has expired. Please request a new code." });
    }

    // 3. Hash the new password (10 salt rounds is the industry standard)
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update the database and instantly invalidate the reset token
    await db.update(users)
      .set({ 
        passwordHash: hashedPassword, 
        resetToken: null, 
        tokenExpiry: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    // Asynchronously fire the security alert email
    EmailService.sendPasswordResetSuccess(user.email, user.firstName || 'User')
      .catch(err => {
        console.error("Failed to send password reset alert to", user.email, err);
      });

    return res.status(200).json({ message: "Password updated successfully." });

  } catch (err) {
    console.error("Reset Password Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ==========================================
// 6. SECURE SIGNUP WITH AUTOMATED WELCOME EMAIL
// ==========================================
export const signUp = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, firstName, lastName, accountType, walletAddress, encryptedWalletKey, timezone = 'UTC', country, services } = req.body;

    const email = rawEmail?.toLowerCase().trim();

    // 🛡️ NEW SECURITY GUARD: Application-level password enforcement
    if (!password || password.length < 8) {
      return res.status(400).json({ 
        error: "A secure password of at least 8 characters is strictly required for registration." 
      });
    }

    // 🛡️ NEW SECURITY GUARD: Validate Stellar Wallet Address Format
    if (!walletAddress || !walletAddress.startsWith('G') || walletAddress.length !== 56) {
      return res.status(400).json({ 
        error: "Invalid wallet address format. A valid Stellar public key is required." 
      });
    }
    
    if (!encryptedWalletKey) {
      return res.status(400).json({ 
        error: "Missing encrypted wallet custody key." 
      });
    }

    // 1. Check for duplicate email
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // 2. Cryptographically hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 3. Create user in Postgres via Drizzle
    const newUser = await db.insert(users).values({
      email, 
      passwordHash, 
      firstName, 
      lastName, 
      accountType, 
      walletAddress,       
      encryptedWalletKey,  
      timezone,            
      country,             
      services,            
      balance: '0.00', 
      isReady: false 
    }).returning();

    const mainAccount = newUser[0];


     /*
    // 4. Auto-provision default Stellar Sub-Account
    if (mainAccount.walletAddress) {
      const uniqueMuxedId = (BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000))).toString();
      try {
        const baseAccount = new Account(mainAccount.walletAddress, "0");
        const muxed = new MuxedAccount(baseAccount, uniqueMuxedId);
        await db.insert(subAccounts).values({
          parentId: mainAccount.id, 
          name: accountType === "business" ? "Ops Account" : "Personal Wallet",
          muxedId: uniqueMuxedId, 
          muxedAddress: muxed.accountId(), 
          balance: '0.00'
        });
      } catch (err) {
        console.error("Failed to provision sub-account during signup:", err);
      }
    }
    */



    // 4. Generate secure JWT cookie
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is missing");

    const token = jwt.sign(
      { 
        userId: mainAccount.id, 
        email: mainAccount.email,
        role: mainAccount.role 
      }, 
      jwtSecret, 
      { expiresIn: '24h' } // Note: Signup sets a 24h token, login sets 7d. This is good practice.
    );

    res.cookie('bingtellar_jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // 🌟 UNIFIED CSRF PROTECTION
      maxAge: 24 * 60 * 60 * 1000 // 24 Hours to match the token
    });

    // 🌟 5. DISPATCH WELCOME EMAIL VIA RESEND
    EmailService.sendWelcome(mainAccount.email, mainAccount.firstName || 'User')
      .catch(err => {
        console.error("Failed to send welcome email to", mainAccount.email, err);
      });

    // Capture security footprint immediately
    captureSecurityMetadata(mainAccount.id, req);

    // 6. Format clean payload
    return res.status(201).json({
      message: "Signup successful.",
      user: {
        id: mainAccount.id, 
        email: mainAccount.email, 
        firstName: mainAccount.firstName, 
        lastName: mainAccount.lastName,
        walletAddress: mainAccount.walletAddress, 
        encryptedWalletKey: mainAccount.encryptedWalletKey,
        balance: parseFloat(mainAccount.balance || '0'), 
        isReady: mainAccount.isReady, 
        kycStatus: mainAccount.kycStatus,
        type: mainAccount.accountType === "business" ? "Business" : "Individual",
        name: `${mainAccount.firstName} ${mainAccount.lastName}`
      }
    });

  } catch (error) {
    console.error("Signup Error:", error);
    return res.status(500).json({ error: "Internal server error during signup" });
  }
};


// ==========================================
// 7. SECURE LOGOUT (DESTROY HTTP-ONLY COOKIE)
// ==========================================
export const logout = async (req: Request, res: Response) => {
  try {
    // 🌟 THE FIX: We must match the exact flags used during creation to destroy it
    res.clearCookie('bingtellar_jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return res.status(200).json({ message: "Logged out successfully. Session destroyed." });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({ error: "Failed to process logout." });
  }
};


// ==========================================
// 8. GOOGLE OAUTH 2.0 (LOGIN & REGISTRATION)
// ==========================================
export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "No Google token provided" });

    // 1. RESTORED FIX: Fetch user profile securely using the access token
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!googleRes.ok) {
      throw new Error("Invalid Google access token or unable to fetch profile");
    }

    const payload = await googleRes.json();
    const { email, given_name, family_name, email_verified } = payload;

    if (!email_verified) {
      return res.status(403).json({ error: "Google email is not verified." });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 2. Check if user already exists
    let userRecords = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    let user = userRecords[0];

    // 3. If they don't exist, create a new account automatically (Upsert)
    if (!user) {
      // Generate a random secure hash so the DB constraint doesn't fail.
      const dummyPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      
      const insertRes = await db.insert(users).values({
        email: cleanEmail,
        passwordHash: dummyPassword, // They will never use this
        firstName: given_name || "",
        lastName: family_name || "",
        accountType: "individual", // Defaulting to individual
        balance: '0.00',
        isReady: false, 
        role: "user"
      }).returning();

      user = insertRes[0];

      // Send Welcome Email for new users
      EmailService.sendWelcome(user.email, user.firstName || 'User').catch(err => {
        console.error("Failed to send Google Auth welcome email:", err);
      });
    }

    // 4. Generate OUR platform's sovereign JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("FATAL: JWT_SECRET is missing");

    const authToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '7d' } // 7-day persistent login for Google users
    );

    // 5. Capture security footprints
    captureSecurityMetadata(user.id, req);

    // 6. Set the HttpOnly Cookie to match your standard login flow
    res.cookie('bingtellar_jwt', authToken, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
    });

    // 7. Format the user object exactly how the React app expects it
    const formattedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      type: user.accountType === "business" ? "Business" : "Individual",
      walletAddress: user.walletAddress, // Will be null for new Google signups until they create a PIN
      encryptedWalletKey: user.encryptedWalletKey,
      balance: parseFloat(user.balance || '0'),
      isReady: user.isReady,
      kycStatus: user.kycStatus
    };

    return res.status(200).json({
      success: true,
      message: "Google Authentication successful.",
      user: formattedUser,
      token: authToken // Send token to frontend so it can save to localStorage
    });

  } catch (error: any) {
    console.error("Google Auth Error:", error);
    return res.status(401).json({ error: "Google authentication failed or expired." });
  }
};
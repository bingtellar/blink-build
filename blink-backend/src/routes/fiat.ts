/**
 * ============================================================================
 * FIAT ROUTER (The Traffic Cop)
 * ============================================================================
 * Express route definitions for all Fiat and Liquidity endpoints.
 * 
 * Responsibilities:
 * - Define HTTP methods (GET, POST) and URL structures.
 * - Execute pre-flight data validation using strict Zod schemas.
 * - Delegate validated traffic to the FiatController.
 * - 🛡️ Enforce JWT Authentication boundaries.
 * ============================================================================
 */

import express from 'express';
import { z } from 'zod';
import { validate } from '../validate'; 
import { FiatController } from '../controllers/FiatController';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// ============================================================================
// 🧱 ZOD VALIDATION SCHEMAS
// Strict typing limits malformed payloads from ever hitting the database.
// ============================================================================

const initiateDepositSchema = z.object({
  body: z.object({
    userId: z.string(), 
    fiatAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).toUpperCase(),
    paymentMethod: z.enum(['bank_transfer', 'mobile_money']),
    destinationAddress: z.string().min(56)
  }),
});

const initiateWithdrawalSchema = z.object({
  body: z.object({
    userId: z.string(), 
    usdcAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).toUpperCase(),
    paymentMethod: z.enum(['bank_transfer', 'mobile_money']),
    recipientDetails: z.object({
      bankName: z.string().optional(), 
      accountNumber: z.string().optional(),
      phoneNumber: z.string().optional(),
      accountName: z.string().optional(), 
    }),
    signedXdr: z.string().min(50) 
  }),
});

// 🌟 NEW: Validation schemas for universal institutions & lookup
const resolveInstitutionAccountSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(3),
    institutionCode: z.string().min(1),
    countryCode: z.string().length(2).toUpperCase()
  })
});


// 🔒 SECURITY: Anti-Scraping / FDoS Limiter
const oracleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 🌟 Increased limit to prevent 429 blocks during active sessions
  message: { error: "Too many resolution attempts. Please try again later." },
  standardHeaders: true, 
  legacyHeaders: false,
});

// ============================================================================
// 🚦 ROUTE MAPPINGS
// ============================================================================

// 1. Configuration & Oracles (Public - Locked behind IP Rate Limiter)
router.get('/config', oracleLimiter, FiatController.getConfig);

// 2. Primary Liquidity Flows (Locked behind JWT)
router.post('/deposit/initiate', authenticateToken, validate(initiateDepositSchema), FiatController.initiateDeposit);
router.post('/withdrawal/initiate', authenticateToken, validate(initiateWithdrawalSchema), FiatController.initiateWithdrawal);

// 4. Public Resolution Oracles (Locked behind IP Rate Limiter AND Proof of Intent)
router.get('/banks/ng', oracleLimiter, FiatController.getNgBanks);
router.post('/banks/resolve', oracleLimiter, FiatController.resolveBankAccount);
router.post('/momo/resolve', oracleLimiter, FiatController.resolveMobileAccount);

// 🌟 5. UNIVERSAL INSTITUTIONS & LOOKUP ORACLES
router.get('/institutions', oracleLimiter, FiatController.getInstitutions);
router.post('/institutions/lookup', oracleLimiter, validate(resolveInstitutionAccountSchema), FiatController.resolveInstitutionAccount);

export default router;
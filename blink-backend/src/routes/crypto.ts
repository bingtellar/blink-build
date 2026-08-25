// src/routes/crypto.ts
import express from 'express';
import { z } from 'zod';
import { validate } from '../validate';
import { authenticateToken } from '../middleware/auth';
import { CryptoController } from '../controllers/CryptoController';

const router = express.Router();

const initiateCryptoWithdrawalSchema = z.object({
  body: z.object({
    userId: z.string(), 
    usdcAmount: z.number().positive(),
    networkFee: z.number().min(0),
    recipientDetails: z.object({
      walletAddress: z.string().min(20),
      network: z.string(),
      accountName: z.string()
    }),
    signedXdr: z.string().min(50) 
  }),
});

const mintSchema = z.object({ 
    body: z.object({ 
        destinationAddress: z.string().length(56).startsWith('G'), 
        amount: z.number().positive(), 
    }), 
});

// 🟢 CROSS-CHAIN & NATIVE CRYPTO WITHDRAWAL INITIATION
router.post('/withdrawal/initiate', authenticateToken, validate(initiateCryptoWithdrawalSchema), CryptoController.initiateWithdrawal);

// 🟢 DEV FAUCET (Local testing only - Controller blocks this in production)
router.post('/mint-usdc', validate(mintSchema), CryptoController.mintUsdc);

export default router;
import express from 'express';
import { z } from 'zod';
import { validate } from '../validate';
import { EscrowController } from '../controllers/EscrowController';
import { LedgerController } from '../controllers/LedgerController'; 
import { authenticateToken } from '../middleware/auth';
import { otpRateLimiter, pollingLimiter } from '../middleware/rateLimiter';


const router = express.Router();

// Input validation schema
const createEscrowSchema = z.object({
  body: z.object({
    creatorId: z.string(), 
    amountLocked: z.string().refine((val) => parseFloat(val) > 0, { message: "Amount must be > 0" }),
    feeAmount: z.string().optional(), 
    recipientEmail: z.string().email(), 
    title: z.string().default("General Service"),
    claimableAfter: z.string().optional(), 
    contractId: z.string().optional(), 
    expiryDate: z.string().optional(), 
    signedXdr: z.string().optional(), 
    
    // ZOD FIX: Whitelist the OTP, Notification flags, AND the Note
    claimCode: z.string().optional(),
    notifyOnClaim: z.boolean().optional(),
    note: z.string().optional(),
  }),
});

// -----------------------------------------------------
// 🔒 AUTHENTICATED ROUTES (For the Sender / Dashboard)
// -----------------------------------------------------
router.post('/build-deploy-tx', authenticateToken, EscrowController.buildDeployTx);
router.post('/', authenticateToken, validate(createEscrowSchema), EscrowController.createEscrow);
router.post('/bulk', authenticateToken, EscrowController.createBulkEscrows);
router.post('/submit-sponsored', authenticateToken, EscrowController.submitSponsored);
router.post('/:claimId/claim-internal', authenticateToken, EscrowController.claimInternalEscrow);
router.post('/:reference/cancel', authenticateToken, EscrowController.cancelEscrow);

// 🌟 ADMIN OVERRIDE ROUTES (Protected by Internal Role Checks)
router.post('/:claimId/admin-reset', authenticateToken, EscrowController.adminResetEscrow);
router.post('/:claimId/admin-force-cancel', authenticateToken, EscrowController.adminForceCancel);

// Fetch Master Ledger Batch Details for Split-Pane Modal
router.get('/batch/:batchId', authenticateToken, EscrowController.getBatchEscrows);

// 🚨 SECURED: Moved from Public to Authenticated
router.get('/', authenticateToken, EscrowController.getAllEscrows);
router.patch('/:claimId/status', authenticateToken, EscrowController.updateStatus);

// -----------------------------------------------------
// 🌍 PUBLIC ROUTES (For the Unauthenticated Claim Portal)
// -----------------------------------------------------
router.get('/:claimId', EscrowController.getEscrowById);

// On-Chain Truth Verifier Route
// Placed here so the recipient's browser can securely fetch the Soroban math without needing a JWT session
// Applied the dedicated high-tolerance polling limiter
router.get('/:claimId/onchain-truth', pollingLimiter, LedgerController.getOnChainTruth);


router.post('/:claimId/generate-link', EscrowController.generateClaimLink);
router.post('/:claimId/process', EscrowController.processClaim);

// 🛡️ SECURED: Applied Brute-Force Rate Limiter
router.post('/:claimId/verify-claim-code', otpRateLimiter, EscrowController.verifyClaimCode); // FOR GATE 1
router.post('/:claimId/verify-otp', otpRateLimiter, EscrowController.verifyOtp); // FOR GATE 2
router.post('/:claimId/send-recipient-otp', otpRateLimiter, EscrowController.sendRecipientOtp);

export default router;
import express from 'express';
import { db } from '../db';
import { paymentRequests } from '../schema';
import { desc } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { RequestController } from '../controllers/RequestController';

const router = express.Router();

/**
 * @route   GET /api/requests
 * @desc    Fetch all payment requests
 */
router.get('/', async (req, res) => {
  try {
    const allRequests = await db.select().from(paymentRequests).orderBy(desc(paymentRequests.createdAt));
    res.json(allRequests);
  } catch (error) { 
    res.status(500).json({ error: 'Internal server error' }); 
  }
});

/**
 * @route   POST /api/requests/bulk
 * @desc    Generate a base request and child requests
 */
router.post('/bulk', authenticateToken, RequestController.createBulkRequests);

router.post('/open', authenticateToken, RequestController.createOpenRequest);

/**
 * @route   GET /api/requests/public/:reference
 * @desc    Fetch a specific request (Public guest access)
 */
router.get('/public/:reference', RequestController.getRequestByReference);

/**
 * @route   PATCH /api/requests/public/:reference/status
 * @desc    Process a public guest payment
 */
router.patch('/public/:reference/status', RequestController.processPublicPayment);

/**
 * @route   GET /api/requests/:reference
 * @desc    Fetch a specific request (Authenticated access)
 */
router.get('/:reference', RequestController.getRequestByReference);

/**
 * @route   PATCH /api/requests/:reference/status
 * @desc    Process an internal Blink-to-Blink payment
 */
router.patch('/:reference/status', authenticateToken, RequestController.processInternalPayment);

export default router;
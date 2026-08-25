import { Router } from 'express';
import { WebhookController } from '../controllers/WebhookController';

const router = Router();

// 🌍 PUBLIC WEBHOOK ROUTE
// Mounted at /webhook in index.ts, so this resolves to /webhook/bingtellar
router.post('/bingtellar', WebhookController.handleWebhook);

export default router;
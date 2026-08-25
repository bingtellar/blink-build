import express from 'express';
import multer from 'multer'; 
import { getUserProfile, lookupUserIdentity, updateUser } from '../controllers/UserController';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { AssistantController } from '../controllers/AssistantController';
import { SupportController } from '../controllers/SupportController';
import { authenticateToken } from '../middleware/auth'; 
import rateLimit from 'express-rate-limit';

const router = express.Router();

// 🌟 ENTERPRISE MEMORY STORAGE (RAM)
// Protects against Disk leaks and DDoS memory exhaustion
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // Strict 10MB limit
});

// 🛡️ THE COPILOT SHIELD
const copilotLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 20, 
  message: { answer: "You are asking questions a bit too fast. Please wait a moment and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});


// 🟢 USER PROFILE & SYNC ENDPOINT
router.get('/me', authenticateToken, getUserProfile);

// 🟢 DIRECTORY LOOKUP
router.get('/lookup', authenticateToken, lookupUserIdentity); 

// 🟢 ACCOUNT FINALIZATION
router.patch('/:id', authenticateToken, updateUser);

// 🟢 RADAR ANALYTICS 
router.get('/:id/radar', authenticateToken, AnalyticsController.getRadarInsights);

// 🤖 RADAR COPILOT (AI Assistant)
router.post('/:id/ask', authenticateToken, copilotLimiter, AssistantController.askRadar);

// 🎙️ HYBRID VOICE RECOGNITION (Firefox Fallback)
// Wrapped securely to enforce JSON API contract on file-size limits
router.post(
  '/:id/stt', 
  authenticateToken, 
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: "Audio recording is too long. Please keep it under 10 minutes." });
        }
        return res.status(400).json({ error: "Audio upload failed." });
      } else if (err) {
        return res.status(500).json({ error: "An unknown error occurred during upload." });
      }
      next(); // Proceed to controller
    });
  }, 
  AssistantController.transcribeAudio
);

// 🌟 PRIORITY SUPPORT TICKETING
router.post('/:id/support/ticket', authenticateToken, SupportController.createTicket);

export default router;
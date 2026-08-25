// src/routes/auth.ts
import { Router } from 'express';
import { sendOtp, verifyOtp, login, verifyResetOtp, resetPassword, signUp, logout, googleAuth } from '../controllers/AuthController';
import { authRateLimiter } from '../middleware/rateLimiter'; 

const router = Router();

// 🛡️ INJECTION: here we apply the strict rate limiter to all entry and verification points
router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtp);
router.post('/login', authRateLimiter, login);
router.post('/verify-reset-otp', authRateLimiter, verifyResetOtp);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/signup', authRateLimiter, signUp);

// GOOGLE ROUTE HERE:
router.post('/google', authRateLimiter, googleAuth);

// Secure logout endpoint to destroy the HttpOnly cookie
router.post('/logout', authRateLimiter, logout);

export default router;
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { extractTrueIp } from '../utils/security.userIP';

// 1. Initialize Redis Client
const redisClient = createClient({ 
  // 🌟 THE FIX: Align the local fallback port to the isolated 6379 port defined in docker-compose
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' 
});

// Prevent Node from crashing if Redis connection drops, fail gracefully
redisClient.on('error', (err) => {
    console.warn('⚠️ Redis Rate Limiter Error:', err.message);
});

redisClient.connect()
  .then(() => console.log('✅ Redis Rate Limiter connected.'))
  .catch(() => console.warn('⚠️ Redis failed to connect initially. Commands will be queued.'));

// ==========================================
// 🛡️ 1. THE RESTORED AUTH LIMITER (For Login / Signup)
// ==========================================
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  
  // 🌟 THE FIX 1: Officially tells express-rate-limit to "Fail Open" if Redis drops
  passOnStoreError: true, 
  
  store: new RedisStore({
    // 🌟 THE FIX 2: Satisfies TypeScript strict types while gracefully catching timeouts
    sendCommand: (...args: string[]) => redisClient.sendCommand(args).catch(() => undefined as any),
  }),
    
  message: {
    error: "Too many authentication attempts from this IP. To protect this account, please try again in 15 minutes."
  },
  
  keyGenerator: (req) => extractTrueIp(req)
});


// ==========================================
// 🛡️ 2. THE OTP / CLAIM LIMITER (For the Claim Portal)
// ==========================================
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  
  passOnStoreError: true, 
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args).catch(() => undefined as any),
  }),
    
  message: {
    error: "Too many authentication attempts. To protect these funds, please try again in 10 minutes."
  },
  
  keyGenerator: (req) => extractTrueIp(req)
});

// ==========================================
// 🛡️ 3. THE POLLING LIMITER (For Background React Tasks)
// ==========================================
export const pollingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: process.env.NODE_ENV === 'production' ? 120 : 3000, 
  standardHeaders: true, 
  legacyHeaders: false,
  
  passOnStoreError: true, 
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args).catch(() => undefined as any),
  }),
    
  message: {
    error: "Polling rate limit exceeded. Please slow down."
  },
  
  keyGenerator: (req) => extractTrueIp(req)
});
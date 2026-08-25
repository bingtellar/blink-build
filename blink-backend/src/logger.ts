// src/logger.ts
import pino from 'pino';

// Define exactly what keys should NEVER appear in plain text in your logs
const sensitiveKeys = [
  'email',
  'walletAddress',
  'password',
  'token',
  'secret',
  'contractId',
  'txHash'
];

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: sensitiveKeys.map(key => `*.${key}`), // Scans nested objects
    censor: '[REDACTED]', // Replaces the sensitive data with this string
  },
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty', // Makes logs readable in your local terminal
    options: { colorize: true }
  } : undefined, // In production, it defaults to raw, highly efficient JSON
});
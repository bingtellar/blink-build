import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("FATAL ERROR: DATABASE_URL environment variable is missing. Cannot start the server.");
}

// 🌟 CLOUD DB FIX: Environment-aware SSL configuration
// Managed databases (AWS RDS, Supabase, Neon) require SSL in production.
const isProduction = process.env.NODE_ENV === 'production';

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 50, // Increase max concurrent connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if no connection is available
};

// Inject SSL only in production to prevent localhost Docker connection issues
if (isProduction) {
  poolConfig.ssl = {
    rejectUnauthorized: false // Bypasses self-signed cert rejections common in cloud DBs
  };
}

// Enterprise-grade connection pool
const pool = new Pool(poolConfig);

// 🌟 THE FIX: Background Error Interceptor
// Prevents Postgres socket drops from bubbling up into fatal uncaughtExceptions.
pool.on('error', (err, client) => {
  console.error('🚨 [DB Pool] Unexpected error on idle PostgreSQL client. Connection dropped, but preventing fatal Node.js crash.', err.message);
  // The pool will gracefully discard the broken client and spin up a new one when needed.
});

export const db = drizzle(pool, { schema });
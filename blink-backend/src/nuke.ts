import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function nukeDatabase() {
  // 🛡️ THE CRITICAL FIX: Environment Guardrail
  // This physically prevents the script from executing if connected to production.
  if (process.env.ENVIRONMENT === "MAINNET" || process.env.NODE_ENV === "production") {
    console.error("🚨 FATAL: You cannot nuke the production database!");
    process.exit(1);
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    console.log("🧨 Nuking old database tables...");
    
    // This forcefully deletes all tables and their relationships
    await sql`DROP SCHEMA public CASCADE;`;
    
    // This recreates the empty canvas for Drizzle
    await sql`CREATE SCHEMA public;`;
    
    console.log("✅ Database completely reset and ready for new schema!");
  } catch (error) {
    console.error("❌ Failed to nuke database:", error);
    process.exit(1);
  }
}

nukeDatabase();
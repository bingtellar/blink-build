// 🌟 FIX: Pointed the imports into the /src directory
import { db } from '../src/db';
import { users } from '../src/schema';
import bcrypt from 'bcrypt';

async function seedGenesisAdmin() {
  console.log("🔒 Initializing Bingtellar Genesis Admin...");

  const email = "heyjosh@bingtellar.com"; // Our Master Email
  const rawPassword = "Supercheck223$"; // Change this before running!

  try {
    // 1. Hash the password securely
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // 2. Inject directly into Postgres
    await db.insert(users).values({
      email,
      passwordHash,
      firstName: "Joshua",
      lastName: "Tebepina",
      role: "super_admin", // 🌟 Grants absolute system clearance
      isReady: true,       // Bypass KYC
      kycStatus: "approved"
    });

    console.log(`✅ Genesis Admin created successfully: ${email}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create Genesis Admin:", error);
    process.exit(1);
  }
}

seedGenesisAdmin();
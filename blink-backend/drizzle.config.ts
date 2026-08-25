import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Explicitly tell dotenv where to look
dotenv.config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from the .env file!");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
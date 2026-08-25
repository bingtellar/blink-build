import { execSync } from 'child_process';

console.log("🎬 Forwarding command to God-Mode Manager...");
try {
  // This automatically runs the 'reset' command from manage.ts
  // using 'tsx' to execute the TypeScript file directly.
  execSync('npx tsx src/manage.ts reset', { stdio: 'inherit' });
} catch (e) {
  console.error("❌ Seed failed:", e);
  process.exit(1);
}
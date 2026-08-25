import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Connect to your local Redis instance
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

// Target the exact queue name used in your EscrowWorker
const queue = new Queue('escrow-deployments', { connection: redis });

async function retryFailedJobs() {
  console.log("♻️ Scanning Redis for stuck BullMQ jobs...");
  
  // Fetch all jobs that crashed and gave up
  const failedJobs = await queue.getFailed();

  if (failedJobs.length === 0) {
    console.log("✅ No failed jobs found in the queue.");
  } else {
    for (const job of failedJobs) {
      console.log(`🔄 Pushing Job ${job.id} (Claim: ${job.data.claimId}) back to the active line...`);
      await job.retry();
    }
    console.log("🚀 All stuck jobs have been resurrected!");
  }

  process.exit(0);
}

retryFailedJobs();
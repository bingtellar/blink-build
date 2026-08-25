import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../logger';

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const escrowQueue = new Queue('escrow-deployments', { 
  connection: redisConnection,
  defaultJobOptions: {
    //  THE NETWORK FIX: Give the SDF public nodes up to 5 chances (~1 minute total) to recover from a 503 outage
    attempts: 5, 
    backoff: { type: 'exponential', delay: 2000 }, // Auto-retry on blockchain network failures
    // THE MEMORY FIX: Flush heavy 2KB XDR strings from Redis RAM instantly upon success
    removeOnComplete: { count: 1000 }, 
    // Keep a reasonable tail of failed jobs for observability without leaking memory
    removeOnFail: { count: 5000 }      
  }
});

export const enqueueEscrowDeployment = async (claimId: string, signedXdr: string) => {
  await escrowQueue.add('deploy', { claimId, signedXdr });
  logger.info(`[Queue] Escrow deployment ${claimId} added to background queue.`);
};


// ==========================================
// 🕒 ENTERPRISE CRON QUEUES
// ==========================================
export const cronQueue = new Queue('cron-jobs', { 
  connection: redisConnection 
});

export const startEnterpriseCronJobs = async () => {
  // 1. 🧹 The Ghost Sweeper: Runs every 3 minutes to heal DB desyncs
  await cronQueue.add('ghost-sweeper', {}, {
      repeat: { pattern: '*/3 * * * *' },
      jobId: 'system-ghost-sweeper' // Strict jobId prevents duplicate registrations on reboot
  });

  // 2. ⚙️ The Yield Maturity Crank: Runs every 15 minutes to unwind DeFindex vaults
  await cronQueue.add('maturity-crank', {}, {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'system-maturity-crank'
  });

  // 3. 🛡️ The Invariant Sentinel: Runs every 1 minute to mathematically audit Soroban TVL and trigger Kill Switch
  await cronQueue.add('invariant-monitor', {}, {
      repeat: { pattern: '* * * * *' },
      jobId: 'system-invariant-monitor'
  });
  
  logger.info("[Queue] 🕒 Enterprise Distributed Cron Jobs registered successfully.");
};
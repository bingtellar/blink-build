import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { SorobanSweeper } from '../cron/SorobanSweeper';
import { runInvariantCheck } from '../cron/InvariantMonitor';
import { logger } from '../logger';

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const cronWorker = new Worker('cron-jobs', async (job) => {
    const sweeper = new SorobanSweeper();
    
    if (job.name === 'ghost-sweeper') {
        logger.info(`[Cron] 🧹 Running Ghost Sweeper cycle...`);
        // We isolate these so they can be tracked as distinct execution steps
        await sweeper.reconcileStuckWithdrawals();
        await sweeper.reconcileStuckEscrows();
    } 
    else if (job.name === 'maturity-crank') {
        logger.info(`[Cron] ⚙️ Running DeFindex Maturity Crank...`);
        // This will find all lock vaults expiring in < 4 hours and unwind their yield shares to USDC
        await sweeper.runMaturityCrank();
    }
    // ADDED INVARIANT MONITOR JOB BRANCH HERE
    else if (job.name === 'invariant-monitor') {
        logger.info(`[Cron] 🛡️ Running Global Invariant Reconciliation...`);
        await runInvariantCheck();
    }
}, { 
    connection: redisConnection,
    concurrency: 1 // Mutex Lock: Only one sweeping process across your entire cluster
});

cronWorker.on('ready', () => console.log('🚀 BullMQ Cron Worker (Sweeper, Crank & Invariant Sentinel) is active and listening...'));
cronWorker.on('failed', (job, err) => logger.error(`[Cron Worker] Job ${job?.name} failed: ${err.message}`));
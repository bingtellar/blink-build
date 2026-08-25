// src/workers/yieldMonitor.ts
import cron from "node-cron";
import { rpc, Contract, Networks, Keypair, TransactionBuilder, scValToNative, Account } from "@stellar/stellar-sdk";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "../db"; 
import { escrows } from "../schema"; 

// 🌟 Environment Config
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const PLATFORM_FUNDING_SECRET = process.env.PLATFORM_FUNDING_SECRET; 

const server = new rpc.Server(SOROBAN_RPC_URL);

// 🛡️ MUTEX LOCK: Prevents overlapping cron executions
let isMonitorRunning = false;

async function checkVaultYields() {
    if (isMonitorRunning) {
        console.warn("⚠️ [CRON] Yield Monitor is still processing. Skipping overlap.");
        return;
    }
    
    isMonitorRunning = true;
    console.log("🔍 [CRON] Running Blink Yield Monitor...");
    
    if (!PLATFORM_FUNDING_SECRET) {
        console.error("❌ PLATFORM_FUNDING_SECRET is missing. Cannot simulate RPC calls.");
        isMonitorRunning = false;
        return;
    }

    try {
        const simKeypair = Keypair.fromSecret(PLATFORM_FUNDING_SECRET);
        
        // 🛡️ MOCKED ACCOUNT: Bypasses network sequence fetch, preventing SDK version crashes
        const account = new Account(simKeypair.publicKey(), "0");

        // 1. Fetch active escrows from Postgres
        const activeVaults = await db.select().from(escrows).where(
            and(
                isNotNull(escrows.contractId),
                inArray(escrows.status, ["processing", "active"])
            )
        );

        if (activeVaults.length === 0) {
            console.log("⏸️ No active vaults found on-chain. Sleeping.");
            isMonitorRunning = false;
            return;
        }

        // 🛡️ BATCHING: Process 10 vaults at a time to prevent Soroban RPC Rate Limits (HTTP 429)
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < activeVaults.length; i += BATCH_SIZE) {
            const batch = activeVaults.slice(i, i + BATCH_SIZE);
            
            // 🛡️ TELEGRAM QUEUE: Collects alerts to prevent bot rate-limiting
            const alertsToSend: string[] = [];
            
            // Process the batch in parallel
            await Promise.all(batch.map(async (vault) => {
                if (!vault.contractId) return;

                // 🛡️ ISOLATED ERROR HANDLING: One corrupted vault won't crash the batch
                try {
                    const vaultContract = new Contract(vault.contractId);

                    const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
                        .addOperation(vaultContract.call("get_claimable_amount"))
                        .setTimeout(30)
                        .build();

                    const simulation = await server.simulateTransaction(tx);
                    
                    if (rpc.Api.isSimulationError(simulation)) {
                        console.error(`❌ RPC Read Failed for vault ${vault.id}:`, simulation.events);
                        return;
                    }

                    const rawResult = simulation.result?.retval;
                    if (!rawResult) return;

                    // 🛡️ BIGINT SAFE PARSING: Prevents v8 type mixing crashes
                    const currentTotalStroops = BigInt(scValToNative(rawResult).toString());
                    const currentTotalUsdc = Number(currentTotalStroops) / 10000000;

                    // 🛡️ NaN SAFE FALLBACKS
                    const principalUsdc = Number(vault.principal || "0");
                    const currentYield = Math.max(0, currentTotalUsdc - principalUsdc);
                    const previouslyRecordedYield = Number(vault.estimatedYield || "0");

                    // 🛡️ FLOATING POINT FIX: Only trigger if yield grew by at least 0.0001 USDC
                    if (currentYield - previouslyRecordedYield > 0.0001) {
                        console.log(`📈 Yield detected on ${vault.contractId}: +${currentYield} USDC`);

                        await db.update(escrows)
                            .set({ estimatedYield: currentYield.toString() })
                            .where(eq(escrows.id, vault.id));
                        
                        // Queue the alert instead of firing instantly
                        alertsToSend.push(
                            `📈 *Blink Yield Update!*\n\n` +
                            `Vault ID: \`${vault.id.substring(0, 8)}...\`\n` +
                            `Contract: \`${vault.contractId}\`\n` +
                            `Principal: *${principalUsdc} USDC*\n` +
                            `Yield Earned: *+${currentYield.toFixed(4)} USDC* 🚀`
                        );
                    }
                } catch (vaultError) {
                    console.error(`🚨 Failed to process yield for vault ${vault.contractId}:`, vaultError);
                }
            }));

            // 🛡️ TELEGRAM BOT THROTTLE: Send queued alerts strictly 1.5 seconds apart
            for (const alert of alertsToSend) {
                await sendTelegramAlert(alert);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // 🛡️ RPC BREATHER: Wait 500ms between parallel batches
            if (i + BATCH_SIZE < activeVaults.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (globalError) {
        console.error("🚨 Yield Monitor DB/Auth crashed:", globalError);
    } finally {
        // 🛡️ MUTEX UNLOCK
        isMonitorRunning = false;
    }
}

async function sendTelegramAlert(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) return;

    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error("Failed to send Telegram alert", e);
    }
}

export function startYieldMonitor() {
    // ⚠️ Remember to run `npm install -D @types/node-cron` if you haven't yet!
    // Set to '*/30 * * * * *' for testing, then switch back to '0 * * * *'
    cron.schedule('0 * * * *', () => {
        checkVaultYields();
    });
    console.log("⏱️ Yield Monitor scheduled.");
}
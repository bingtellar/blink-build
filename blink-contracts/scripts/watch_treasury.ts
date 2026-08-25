import { Horizon } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const { TREASURY_ADDRESS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

if (!TREASURY_ADDRESS || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ Error: Missing credentials in .env (Treasury, Telegram Token, or Chat ID)");
    process.exit(1);
}

const server = new Horizon.Server(HORIZON_URL);

async function sendTelegram(message: string) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });
        if (!response.ok) console.error("❌ Telegram Error:", await response.text());
    } catch (err) {
        console.error("💥 Network Error (Telegram):", err);
    }
}

console.log("-------------------------------------------------------");
console.log("💰 BINGTELLAR BLINK REVENUE WATCHER: ONLINE 🚀");
console.log(`📡 Monitoring: ${TREASURY_ADDRESS}`);
console.log("-------------------------------------------------------");

sendTelegram(`<b>⚡️ Watcher Activated</b>\nMonitoring Bingtellar Treasury at <code>${TREASURY_ADDRESS.slice(0, 8)}...</code>`);

// ✅ This stream listens for 'effects' (the actual movement of money)
const closeStream = server.effects()
    .forAccount(TREASURY_ADDRESS)
    .cursor('now')
    .stream({
        onmessage: async (effect: any) => {
            // We only care when the treasury gets PAID
            if (effect.type === 'account_credited') {
                const assetName = effect.asset_type === 'native' ? 'XLM' : effect.asset_code;
                const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${effect.transaction_hash}`;

                console.log(`\n💵 FEE RECEIVED: ${effect.amount} ${assetName}`);

                const telegramMsg = 
                    `<b>💰 New Revenue Detected!</b>\n\n` +
                    `📦 <b>Asset:</b> ${assetName}\n` +
                    `💵 <b>Amount:</b> <code>${effect.amount}</code>\n` +
                    `🕒 <b>Time:</b> ${new Date().toLocaleTimeString()}\n\n` +
                    `<a href="${explorerUrl}">🔍 View on Stellar.expert</a>`;
                
                await sendTelegram(telegramMsg);
            }
        },
        onerror: (error) => {
            console.error("❌ Horizon Stream Error:", error);
            // 🟢 In production, we would add a reconnect loop here, 
            // but for now, we just notify Telegram that the bot died so we aren't flying blind!
            sendTelegram("🚨 <b>WARNING:</b> Bingtellar Revenue Watcher disconnected from Horizon! Restart required.");
        }
    });

// Graceful shutdown
process.on('SIGINT', () => {
    console.log("\n🛑 Shutting down watcher...");
    closeStream();
    process.exit();
});
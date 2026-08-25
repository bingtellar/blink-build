require('dotenv').config();
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.BINGTELLAR_WEBHOOK_SECRET || "your_local_test_secret";
const LOCAL_URL = "http://localhost:3001/api/fiat/webhook/bingtellar";

// 🎯 TARGETING THE 'PROCESSING' WITHDRAWAL FROM YOUR DB
const TARGET_REFERENCE = "WD-19714222";

const payload = {
    event: "withdrawal.successful",
    data: {
        reference: TARGET_REFERENCE,
        orderId: "94b972f0-34b6-4d03-a50f-ca6adeaf8dd4", // Matching Bingtellar order ID from your DB metadata
        fiatAmount: 4140.00,
        fiatCurrency: "NGN",
        fiat_leg: {
            amount: 4140.00,
            gross_amount: 4190.00, // 4140 + 50 NGN fee
            rail_fee: 50.00,
            delivery_provider: "PALMPAY_API"
        },
        rates: {
            execution_exchange_rate: 1386.55 // From your DB
        }
    }
};

const payloadString = JSON.stringify(payload);

const timestamp = Date.now().toString();
const signaturePayload = `${timestamp}.${payloadString}`;
const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signaturePayload).digest('hex');
const signatureHeader = `t=${timestamp},v1=${signature}`;

async function fireWebhook() {
    console.log(`🚀 Firing simulated Bingtellar Webhook for Ref: ${TARGET_REFERENCE}...`);

    try {
        const response = await fetch(LOCAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-bingtellar-signature': signatureHeader
            },
            body: payloadString
        });

        const resultText = await response.text();
        console.log(`\n📡 Server Response [${response.status}]:`, resultText);
    } catch (error) {
        console.error("❌ Failed to hit local server:", error);
    }
}

fireWebhook();
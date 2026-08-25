import crypto from 'crypto';

// 🛑 IMPORTANT: Update this to match the BINGTELLAR_WEBHOOK_SECRET in your backend .env
const WEBHOOK_SECRET = process.env.BINGTELLAR_WEBHOOK_SECRET || "whsec_dd69ce3e5c11f024b4e0c20945b5936283e98707c280b7be"; 
const TARGET_URL = "http://localhost:3001/api/webhook/bingtellar";

// 🛑 IMPORTANT: Find a real transaction in your Postgres database that is currently "processing" or "pending"
// and paste its reference here (e.g., "WD-1A2B3C4D")
const TARGET_REFERENCE = "BTO-2CDF8D0B"; 

const payload = {
    // THE FIX: Change the event to trigger the failure state machine
    event: "payout.failed",
    data: {
        reference: TARGET_REFERENCE,
        // Bingtellar includes the bank's rejection reason in the payload
        reason: "Destination Bank Network Offline - Reversal Processed",
        fiat_leg: {
            amount: 2760,
            delivery_provider: "SIMULATED_PALMPAY_API"
        }
    }
};

async function simulateWebhook() {
    console.log(`🧪 Building simulated Bingtellar Webhook...`);
    
    // 1. Stringify the exact payload
    const payloadString = JSON.stringify(payload);
    
    // 2. Cryptographically sign it using HMAC SHA-256
    const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payloadString)
        .digest('hex');

    console.log(`🔐 Generated Signature: ${signature}`);
    console.log(`📡 Firing to ${TARGET_URL} for reference: ${TARGET_REFERENCE}...`);

    try {
        // 3. Fire the request just like Bingtellar would (Node 18+ native fetch)
        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-bingtellar-signature': signature
            },
            body: payloadString
        });

        const responseText = await response.text();
        
        if (response.ok) {
            console.log(`✅ SUCCESS! HTTP ${response.status}: ${responseText}`);
        } else {
            console.error(`❌ REJECTED! HTTP ${response.status}: ${responseText}`);
        }
    } catch (error) {
        console.error(`🚨 Network Error:`, error);
    }
}

simulateWebhook();
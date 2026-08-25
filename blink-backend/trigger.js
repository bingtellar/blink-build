const crypto = require('crypto');

const BINGTELLAR_WEBHOOK_SECRET = "whsec_dd69ce3e5c11f024b4e0c20945b5936283e98707c280b7be";

const payload = JSON.stringify({
    eventType: "payout.completed",
    data: {
        reference: "WD-CC0907EC", // 👈 Exact reference from DB Transaction [1]
        orderId: "8aac9957-e354-485d-8c2e-efdc1e8e10a3", // 👈 Exact bingtellarOrderId from metadata
        fiatAmount: 2760,
        fiatCurrency: "NGN",
        fiat_leg: {
            amount: 2760,
            rail_fee: 50,
            delivery_provider: "PALMPAY_API"
        }
    }
});

const timestamp = Math.floor(Date.now() / 1000);
const signaturePayload = `${timestamp}.${payload}`;
const sig = crypto.createHmac('sha256', BINGTELLAR_WEBHOOK_SECRET).update(signaturePayload).digest('hex');

fetch('http://localhost:3001/api/fiat/webhook/bingtellar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bingtellar-signature': `t=${timestamp},v1=${sig}`
        },
        body: payload
    })
    .then(async(res) => {
        console.log("HTTP Status:", res.status);
        console.log("Response:", await res.text());
    })
    .catch(console.error);
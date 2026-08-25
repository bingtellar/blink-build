const crypto = require('crypto');

// 🌟 Uses your live active secret
const secret = "whsec_dd69ce3e5c11f024b4e0c20945b5936283e98707c280b7be";

// 🌟 We use the legacy event name and the internal WD- reference Blink knows
const payload = JSON.stringify({
    event: "PAYOUT_COMPLETED",
    data: { reference: "WD-531EAB6B" }
});

const timestamp = Math.floor(Date.now() / 1000);
const signaturePayload = `${timestamp}.${payload}`;
const sig = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
const header = `t=${timestamp},v1=${sig}`;

// Fire it at your local blink-backend
fetch('http://localhost:3001/api/fiat/webhook/bingtellar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bingtellar-signature': header
        },
        body: payload
    })
    .then(res => res.text())
    .then(data => console.log("✅ Fix Result:", data))
    .catch(console.error);
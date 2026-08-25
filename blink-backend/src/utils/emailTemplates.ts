// src/utils/emailTemplates.ts

// ============================================================================
// 🌟 GLOBAL UTILITIES
// ============================================================================

/**
 * Universal Currency Formatter
 * Safely strips existing commas and applies standard US locale comma grouping.
 * Automatically handles integers and floats while preserving symbols like USDC or NGN.
 */
export const formatMoney = (val: string | number) => {
  if (!val) return val;
  // 1. Strip existing commas to prevent double formatting
  const cleanStr = String(val).replace(/,/g, '');
  // 2. Intelligently add commas back to the integer parts (preserves NGN, USDC, etc.)
  return cleanStr.replace(/\b(\d+)(\.\d+)?\b/g, (match, p1, p2) => {
    return parseInt(p1, 10).toLocaleString('en-US') + (p2 || '');
  });
};

/**
 * 🌟 ANTI-CLIPPING INJECTOR (The Gmail Fix)
 * Gmail hides footers behind "..." if the bottom of the HTML matches previous emails.
 * This injects a unique, invisible timestamp to force Gmail to render the full email every time.
 */
const preventGmailClipping = () => `
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 0px; line-height: 0px; color: transparent;">
    Blink-Secure-Ref: ${Date.now()}-${Math.random().toString(36).substring(2, 8)}
  </div>
`;

/**
 * Base HTML Template Wrapper
 * Used ONLY for transactional System Alerts (OTPs, Escrows, Deposits) 
 * to maintain a unified, clean, and responsive brand identity.
 */
const baseTemplate = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F9FAFB; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E5E7EB; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { padding: 32px 40px; text-align: left; border-bottom: 1px solid #F3F4F6; }
    .logo { font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin: 0; }
    .content { padding: 40px; color: #374151; font-size: 15px; line-height: 1.6; }
    .title { font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 24px; }
    .footer { padding: 24px 40px; background-color: #F9FAFB; text-align: center; color: #9CA3AF; font-size: 12px; border-top: 1px solid #E5E7EB; }
    .btn { display: inline-block; background-color: #111827; color: #FFFFFF; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px; margin-bottom: 12px; }
    .highlight-box { background-color: #F3F4F6; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">Blink</h1>
    </div>
    <div class="content">
      ${title ? `<h2 class="title">${title}</h2>` : ""}
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Bingtellar Inc. All rights reserved.</p>
      <p>Secure financial infrastructure for emerging markets.</p>
    </div>
  </div>
  ${preventGmailClipping()}
</body>
</html>
`;


// ============================================================================
// 📨 THE EMAIL TEMPLATE REGISTRY
// ============================================================================

export const templates = {

  // --------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & SECURITY
  // --------------------------------------------------------------------------

  otpCode: (code: string) => baseTemplate(
    "Verify your email",
    `
    <p>Please use the verification code below to complete your authentication. This code will expire in 10 minutes.</p>
    <div class="highlight-box">
      <h1 style="font-size: 36px; letter-spacing: 8px; color: #111827; margin: 0;">${code}</h1>
    </div>
    <p>If you didn't request this code, you can safely ignore this email.</p>
    `
  ),

  welcome: (name: string, dashboardLink: string, apiDocsLink: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 15px; line-height: 1.6; margin: 0; padding: 40px; background-color: #FFFFFF;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin-top: 0; margin-bottom: 32px;">Blink</h1>
    
    <p style="margin-bottom: 16px;">Hi ${name},</p>
    
    <p style="margin-bottom: 16px;">Welcome to Blink. My name is Joshua, founding CEO of Blink (a Bingtellar Co) and I’m genuinely excited to have you onboard.</p>
    
    <p style="margin-bottom: 16px;">You’ve just taken the first step toward reclaiming the capital efficiency that traditional finance has ignored for too long. You’ve likely noticed that today, money spends an awful lot of time... sleeping. It sits in transit, waits in escrow, or naps in a "nostro" account while the clock ticks.</p>
    
    <p style="margin-bottom: 16px;">At Blink, we think your capital deserves a better work ethic. We built this infrastructure because we were frustrated that it didn't exist when we needed it — so we finally decided to build it ourselves. We’ve designed the most reliable, efficient engine for your treasury stack so you can stop leaving yield / monetizable returns on the table. Whether you’re optimizing liquidity corridors, settling cross-border payables, or generating yield on idle balances, you’re now equipped to do it in real-time.</p>
    
    <p style="margin-top: 32px; margin-bottom: 16px; color: #111827; font-weight: 600;">How to get started:</p>
    <ul style="padding-left: 20px; margin-bottom: 24px; color: #374151;">
      <li style="margin-bottom: 12px;">
        <strong>Access your dashboard:</strong> <a href="${dashboardLink}" style="color: #2775CA; text-decoration: none; font-weight: 600;">Go to Dashboard</a> — This is your command center for executing your first payments, tracking settlement processes, and viewing real-time yield accrual.
      </li>
      <li style="margin-bottom: 12px;">
        <strong>The technical stuff:</strong> <a href="${apiDocsLink}" style="color: #2775CA; text-decoration: none; font-weight: 600;">API & Integration Docs</a> — For the builders who want to automate everything and need deeper integrations.
      </li>
      <li style="margin-bottom: 12px;">
        <strong>Talk to us:</strong> We view our relationship with you as a partnership. If you have any questions on optimizing your settlement corridors or want to explore deeper yield strategies, hit “reply” to this email. I read and reply to every email.
      </li>
    </ul>
    
    <p style="margin-bottom: 16px;">Thank you for trusting us with your treasury. Let’s get your money working.</p>
    
    <p style="margin-top: 32px; margin-bottom: 0;">Cheers,</p>
    <p style="margin-top: 4px; font-weight: 600;">Josh</p>
    
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin-top: 48px; margin-bottom: 24px;" />
    <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 4px;">© ${new Date().getFullYear()} Bingtellar Inc. All rights reserved.</p>
    <p style="color: #9CA3AF; font-size: 12px; margin-top: 0;">Secure financial infrastructure for emerging markets.</p>
  </div>
  ${preventGmailClipping()}
</body>
</html>
  `,

  loginAlert: (name: string, time: string, device: string, ipAddress: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 15px; line-height: 1.6; margin: 0; padding: 40px; background-color: #FFFFFF;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin-top: 0; margin-bottom: 32px;">Blink Security</h1>
    
    <p style="margin-bottom: 16px;">Hi ${name},</p>
    <p style="margin-bottom: 16px;">We noticed a new login to your Blink account. If this was you, you can safely ignore this email.</p>
    
    <ul style="padding-left: 20px; margin-bottom: 24px; color: #374151; background-color: #F9FAFB; padding: 16px 16px 16px 36px; border-radius: 8px;">
      <li style="margin-bottom: 8px;"><strong>Time:</strong> ${time}</li>
      <li style="margin-bottom: 8px;"><strong>Device:</strong> ${device}</li>
      <li style="margin-bottom: 0;"><strong>IP Address:</strong> ${ipAddress}</li>
    </ul>
    
    <p style="margin-bottom: 16px;"><strong>Didn't log in recently?</strong></p>
    <p style="margin-bottom: 16px;">If you do not recognize this activity, please secure your account immediately by resetting your password.</p>
    
    <p style="margin-top: 32px; margin-bottom: 0;">Stay secure,</p>
    <p style="margin-top: 4px; font-weight: 600;">The Blink Security Team</p>
    
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin-top: 48px; margin-bottom: 24px;" />
    <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 4px;">© ${new Date().getFullYear()} Bingtellar Inc. All rights reserved.</p>
    <p style="color: #9CA3AF; font-size: 12px; margin-top: 0;">This is an automated security notification.</p>
  </div>
  ${preventGmailClipping()}
</body>
</html>
  `,

  passwordResetSuccess: (name: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 15px; line-height: 1.6; margin: 0; padding: 40px; background-color: #FFFFFF;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin-top: 0; margin-bottom: 32px;">Blink Security</h1>
    
    <p style="margin-bottom: 16px;">Hi ${name},</p>
    <p style="margin-bottom: 16px;">The password for your Blink account was just successfully updated.</p>
    
    <div style="background-color: #F9FAFB; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #34A853;">
      <p style="margin: 0; color: #374151; font-weight: 500;">If you made this change, you can safely ignore this email. You may now log in with your new credentials.</p>
    </div>
    
    <p style="margin-bottom: 16px;"><strong>Didn't change your password?</strong></p>
    <p style="margin-bottom: 16px;">If you did not authorize this change, please reply to this email immediately so our security team can lock your account and secure your funds.</p>
    
    <p style="margin-top: 32px; margin-bottom: 0;">Stay secure,</p>
    <p style="margin-top: 4px; font-weight: 600;">The Blink Security Team</p>
    
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin-top: 48px; margin-bottom: 24px;" />
    <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 4px;">© ${new Date().getFullYear()} Bingtellar Inc. All rights reserved.</p>
    <p style="color: #9CA3AF; font-size: 12px; margin-top: 0;">This is an automated security notification.</p>
  </div>
  ${preventGmailClipping()}
</body>
</html>
  `,


  // --------------------------------------------------------------------------
  // SECTION 2: COMPLIANCE & KYC
  // --------------------------------------------------------------------------

  kycApproved: (firstName: string) => baseTemplate(
    "KYC Verification Approved",
    `
    <p>Hi ${firstName},</p>
    <p>Great news! Your KYC / identity verification has been successfully processed and approved.</p>
    <p>Congratulations on completing this important step. With your KYC verification now confirmed, you now have full access to global liquidity pools, yield strategies, enterprise-grade withdrawal limits and premium features.</p>
    `
  ),

  kycRejected: (firstName: string, reason: string) => baseTemplate(
    "Verification Update",
    `
    <p>Hi ${firstName},</p>
    <p>Thank you for submitting your verification details to Blink. Our compliance team has reviewed your application, but unfortunately, we are unable to approve it at this time.</p>
    <div style="background-color: #FEF2F2; padding: 16px; border-radius: 8px; border-left: 4px solid #EF4444; margin: 24px 0; text-align: left;">
      <strong style="color: #991B1B;">Reason from Compliance:</strong>
      <p style="margin-top: 8px; margin-bottom: 0; color: #991B1B; font-weight: 500;">${reason}</p>
    </div>
    <p>Please log back into your Blink dashboard to update your information and re-submit your KYC application.</p>
    `
  ),


  // --------------------------------------------------------------------------
  // SECTION 3: ESCROW & TRANSFERS (SENDER SIDE)
  // --------------------------------------------------------------------------

  escrowClaimCode: (amount: string, code: string, recipientEmail: string) => baseTemplate(
    "Transfer Successful: Your Claim Code",
    `
    <p>You have successfully made a transfer of <strong>${formatMoney(amount)}</strong> to ${recipientEmail} and funds are now secured in Blink escrow vault.</p>
    <p>To protect your funds, a secure authentication code has been generated for this transfer.</p>
    
    <div class="highlight-box">
      <p style="margin: 0; font-size: 12px; color: #6B7280;">Secure Authentication Code</p>
      <h1 style="font-size: 30px; letter-spacing: 8px; color: #111827; margin: 8px 0 0 0;">${code}</h1>
    </div>
    
    <p><strong>Next Steps:</strong> Please share this 6-digit code securely with the recipient via text or chat. They will need it to unlock the funds.</p>
    
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
    <p style="font-size: 12px; color: #6B7280;">If you did not initiate this transfer, please ignore this mail and do not send the authentication to anyone else or contact customer desk support@bingtellar.com immediately. Cheers!</p>
    `
  ),

  senderClaimNotification: (reference: string) => baseTemplate(
    "Transfer Successfully Claimed",
    `
    <p>Good news! The recipient has successfully claimed your Blink transfer (Ref: <strong>${reference}</strong>).</p>
    <p>The funds have been securely routed to their destination and the smart contract escrow vault has been successfully closed and settled.</p>
    <p>You can view the final settlement details and download your receipt directly from your dashboard.</p>
    
    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="btn">View Dashboard</a>
    `
  ),

  escrowExpiredRefund: (amount: string, yieldAmount: string, recipientEmail: string) => {
    // Math executed safely using clean parsed floats to prevent NaN HTML rendering
    const cleanAmount = parseFloat(String(amount).replace(/,/g, '')) || 0;
    const cleanYield = parseFloat(String(yieldAmount).replace(/,/g, '')) || 0;
    const totalRefund = cleanAmount + cleanYield;

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F4F0; margin: 0; padding: 40px 20px; color: #1A1A1A; }
        .container { max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #EAEAEA; }
        .header { text-align: left; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #1A1A1A; text-decoration: none; }
        .title { font-size: 20px; font-weight: 700; margin: 0 0 10px 0; color: #1A1A1A; }
        .text { font-size: 14px; line-height: 1.6; color: #757575; margin: 0 0 24px 0; }
        .receipt-box { background: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 16px; padding: 24px; margin-bottom: 30px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; }
        .row:last-child { margin-bottom: 0; padding-top: 16px; border-top: 1px solid #EAEAEA; }
        .label { color: #757575; font-weight: 500; }
        .value { color: #1A1A1A; font-weight: 700; text-align: right; }
        .yield-value { color: #3BA66A; font-weight: 700; text-align: right; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #A3A3A3; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="logo">Blink</span>
        </div>
        <h1 class="title">Transfer Expired & Refunded</h1>
        <p class="text">The 30-day window for your transfer to <strong>${recipientEmail}</strong> has closed without being claimed.</p>
        <p class="text">We have automatically destroyed the on-chain vault and credited your principal${cleanYield > 0 ? ' plus all generated yield' : ''} back to your available ledger balance.</p>
        
        <div class="receipt-box">
          <div class="row">
            <span class="label">Original Principal</span>
            <span class="value">$${formatMoney(cleanAmount.toFixed(2))} USDC</span>
          </div>
          ${cleanYield > 0 ? `
          <div class="row">
            <span class="label">Yield Harvested</span>
            <span class="yield-value">+$${formatMoney(cleanYield.toFixed(4))} USDC</span>
          </div>
          ` : ''}
          <div class="row">
            <span class="label">Total Refunded</span>
            <span class="value">$${formatMoney(totalRefund.toFixed(4))} USDC</span>
          </div>
        </div>

        <div class="footer">
          This is an automated security protocol to ensure your funds are never permanently locked.<br>
          © ${new Date().getFullYear()} Bingtellar Inc. All rights reserved
        </div>
      </div>
      ${preventGmailClipping()}
    </body>
    </html>
    `;
  },


  // --------------------------------------------------------------------------
  // SECTION 4: ESCROW & TRANSFERS (RECIPIENT SIDE)
  // --------------------------------------------------------------------------

  escrowReceived: (senderName: string, claimLink: string, note?: string) => {
    const noteHtml = note 
      ? `<div style="background-color: #F9FAFB; padding: 16px; border-radius: 12px; margin: 24px 0; border: 1px solid #E5E7EB;">
           <p style="font-size: 11px; color: #6B7280; text-transform: uppercase; margin: 0 0 6px 0; font-weight: 700; letter-spacing: 0.05em;">Note from Sender</p>
           <p style="font-size: 14px; color: #111827; margin: 0; font-style: italic; line-height: 1.5;">"${note}"</p>
         </div>`
      : '';

    return baseTemplate(
      `Yay! You just received a Blink payment 💸`,
      `
      <p>You have a payment waiting for you from <strong>${senderName}</strong>.</p>
      <p>Please use the unique secure code provided by the sender to claim your funds and complete the transaction.</p>
      <p><em>Please keep the Authentication code safe and do not send it to anyone.</em></p>
      
      ${noteHtml}
      
      <br/>
      <a href="${claimLink}" class="btn">Claim money now</a>
      
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #6B7280;">If you've got any issues redeeming your Blink funds, please contact support@bingtellar.com</p>
      <p style="font-size: 12px; color: #6B7280;">No Blink staff will ever ask you for your password, OTP, transfer authentication code, or security questions to help you solve an issue.</p>
      <p style="font-size: 12px; color: #6B7280;">Cheers and keep Blinking fren!</p>
      `
    );
  },

  withdrawalOtpCode: (code: string) => baseTemplate(
    "Authorize Your Claim Withdrawal",
    `
    <p>You are about to securely withdraw funds from your Blink escrow. Please use the verification code below to authorize this transaction.</p>
    <div class="highlight-box">
      <h1 style="font-size: 36px; letter-spacing: 8px; color: #111827; margin: 0;">${code}</h1>
    </div>
    <p>If you did not initiate this withdrawal, please ignore this email. Blink will never ask you for this code.</p>
    `
  ),

  claimPayoutSuccess: (fiatAmount: string, reference: string) => baseTemplate(
    "Payment Successfully Delivered 🎉",
    `
    <p>Great news! The money sent to you via Blink has successfully arrived in your account.</p>
    
    <div class="highlight-box" style="background-color: #E5F7ED; border: 1px solid #C6F6D5;">
      <p style="margin: 0; font-size: 12px; color: #374151; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Amount Received</p>
      <h1 style="font-size: 36px; color: #3BA66A; margin: 8px 0 0 0; letter-spacing: -1px;">${formatMoney(fiatAmount)}</h1>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #6B7280;">Ref: ${reference}</p>
    </div>
    
    <h3 style="color: #111827; margin-top: 32px; font-size: 16px;">Want to start sending money globally yourself?</h3>
    <p>Join thousands of users moving money instantly across borders with zero hidden fees and daily yield.</p>
    
    <a href="https://your-production-url.com/signup" class="btn" style="background-color: #3BA66A; width: 100%; box-sizing: border-box; text-align: center;">Create your free Blink account</a>
    `
  ),

  escrowExpiryWarning: (amount: string, hoursLeft: number, claimLink: string, senderName: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F4F0; margin: 0; padding: 40px 20px; color: #1A1A1A; }
        .container { max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #EAEAEA; }
        .header { text-align: left; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #1A1A1A; text-decoration: none; }
        .title { font-size: 20px; font-weight: 700; margin: 0 0 10px 0; color: #1A1A1A; }
        .text { font-size: 14px; line-height: 1.6; color: #757575; margin: 0 0 24px 0; }
        .amount-box { background: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 30px; }
        .amount-label { font-size: 12px; font-weight: 700; color: #A3A3A3; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .amount-value { font-size: 32px; font-weight: 800; color: #1A1A1A; letter-spacing: -1px; margin: 0; }
        .warning-box { background: #FFF9F2; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px; margin-bottom: 30px; }
        .warning-text { font-size: 13px; color: #D97706; font-weight: 600; margin: 0; text-align: center; }
        .btn { display: inline-block; background-color: #1A1A1A; color: #FFFFFF; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 14px; text-align: center; width: calc(100% - 64px); box-sizing: border-box; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #A3A3A3; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="logo">Blink</span>
        </div>
        <h1 class="title">Action Required: Transfer Expiring</h1>
        <p class="text">You have a pending transfer from <strong>${senderName}</strong> that has not been claimed yet. Please securely claim your funds before the secure vault automatically closes.</p>
        
        <div class="amount-box">
          <div class="amount-label">Available to Claim</div>
          <div class="amount-value">$${formatMoney(amount)} USDC</div>
        </div>

        <div class="warning-box">
          <p class="warning-text">This transfer will expire and be returned to the sender in exactly ${hoursLeft} hours.</p>
        </div>

        <a href="${claimLink}" class="btn">Claim Funds Now</a>
        
        <div class="footer">
          If you have already claimed this, you can safely ignore this email.<br>
          © ${new Date().getFullYear()} Bingtellar Operations Ltd.
        </div>
      </div>
      ${preventGmailClipping()}
    </body>
    </html>
  `,


  // --------------------------------------------------------------------------
  // P2P PAYMEMENT REQUEST (RECEIVER SIDE)
  // The Payment Request Template
  // --------------------------------------------------------------------------

  paymentRequest: (creatorName: string, amount: string, link: string, note?: string) => {
    const noteHtml = note 
      ? `<div style="background-color: #F9FAFB; padding: 16px; border-radius: 12px; margin: 24px 0; border: 1px solid #E5E7EB;">
           <p style="font-size: 11px; color: #6B7280; text-transform: uppercase; margin: 0 0 6px 0; font-weight: 700; letter-spacing: 0.05em;">Note from ${creatorName}</p>
           <p style="font-size: 14px; color: #111827; margin: 0; font-style: italic; line-height: 1.5;">"${note}"</p>
         </div>`
      : '';

    return baseTemplate(
      `Payment Request from ${creatorName}`,
      `
      <p><strong>${creatorName}</strong> has requested a payment of <span style="font-size: 18px; font-weight: bold; color: #111827;">${amount}</span>.</p>
      
      ${noteHtml}
      
      <p>You can securely complete this payment using your Blink balance, bank transfer, mobile money, or an external crypto wallet.</p>
      
      <br/>
      <a href="${link}" class="btn" style="background-color: #111827; color: #ffffff;">Pay ${amount} Now</a>
      
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="font-size: 12px; color: #6B7280;">If you don't know this person or believe this request was sent in error, you can safely ignore or reject this email. No money will be deducted from your account.</p>
      `
    );
  },


  // --------------------------------------------------------------------------
  // SECTION 5: WALLET & LEDGER OPERATIONS
  // --------------------------------------------------------------------------

  depositCompleted: (amount: string, reference: string, date: string) => baseTemplate(
    "Deposit Successful",
    `
    <p>ka-ching! Your account has been credited with some funds. Login to check your Blink balance.</p>
    <p>You can now use this balance to execute cross-border payouts or yield strategies.</p>
    <table style="width: 100%; margin-top: 24px; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Amount Received</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #111827;">${formatMoney(amount)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Reference</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #111827;">${reference}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Status</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #34A853;">Available</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Date & Time</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #111827;">${date}</td>
      </tr>
    </table>
    `
  ),

  withdrawalCompleted: (usdcAmount: string, fiatAmount: string, reference: string, date: string) => baseTemplate(
    "Withdrawal Processed",
    `
    <p>Your withdrawal has been successfully processed and the funds have left your Balance.</p>
    <p>Depending on the destination network or banking rails, please allow standard processing times for the funds to reflect in your receiving account.</p>
    <table style="width: 100%; margin-top: 24px; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Amount Withdrawn</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #111827;">${formatMoney(usdcAmount)} USDC</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Amount to Receive</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #34A853;">${formatMoney(fiatAmount)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Reference</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #111827;">${reference}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; color: #6B7280;">Status</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #34A853;">Completed</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6B7280;">Date & Time</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #111827;">${date}</td>
      </tr>
    </table>
    `
  ),


  // --------------------------------------------------------------------------
  // SECTION 6: ADMIN & ENTERPRISE PROVISIONING
  // --------------------------------------------------------------------------

  adminProvisioning: (name: string, role: string, setupLink: string) => `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-w: 600px; margin: 0 auto; padding: 40px; border: 1px solid #EAEAEA; border-radius: 12px;">
      
      <div style="width: 40px; height: 40px; background: #111827; color: white; font-weight: bold; font-size: 20px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-bottom: 24px;">
        B
      </div>

      <h2 style="color: #111827; font-size: 24px; margin-bottom: 16px;">Admin Access Granted</h2>
      
      <p style="color: #4B5563; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Hello ${name},<br><br>
        You have been provisioned with <strong>${role}</strong> clearance on the Blink Infrastructure network.
      </p>

      <div style="background: #FAFAFA; border: 1px solid #EAEAEA; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px 0;">
          To initialize your session and generate your secure password, please click the authentication link below.
        </p>
        <a href="${setupLink}" style="display: inline-block; background: #111827; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px;">
          Initialize Account
        </a>
      </div>

      <p style="color: #9CA3AF; font-size: 12px; line-height: 1.5;">
        <strong>Security Notice:</strong> This link will expire in exactly 24 hours. If you did not expect this invitation, please disregard this email or contact the Bingtellar security team immediately.
      </p>
    </div>
    ${preventGmailClipping()}
  `,

  clearanceUpgraded: (name: string, role: string, baseUrl: string) => `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-w: 600px; margin: 0 auto; padding: 40px; border: 1px solid #EAEAEA; border-radius: 12px;">
      
      <div style="width: 40px; height: 40px; background: #111827; color: white; font-weight: bold; font-size: 20px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-bottom: 24px;">B</div>
      
      <h2 style="color: #111827; font-size: 24px; margin-bottom: 16px;">Clearance Level Upgraded</h2>
      
      <p style="color: #4B5563; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Hello ${name},<br><br>
        Your account has been upgraded. You now have <strong>${role}</strong> clearance on the Blink infrastructure network.
      </p>
      
      <div style="background: #FAFAFA; border: 1px solid #EAEAEA; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px 0;">Log out and log back into your Operations Command Center to sync your new admin permissions.</p>
        <a href="${baseUrl}/admin" style="display: inline-block; background: #111827; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px;">Access Command Center</a>
      </div>

    </div>
    ${preventGmailClipping()}
  `
};
// src/services/EmailService.ts
import { Resend } from 'resend';
import { templates, formatMoney } from '../utils/emailTemplates';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'noreply@ourblink.cash';

const DASHBOARD_URL = process.env.FRONTEND_URL || 'http://localhost:5173/dashboard';
const API_DOCS_URL = process.env.DOCS_URL || 'https://docs.bingtellar.com';

export class EmailService {
  
  // ==========================================================================
  // 🔐 1. CORE AUTHENTICATION & SECURITY
  // ==========================================================================

  static async sendOTP(to: string, code: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Your Blink Verification Code',
      html: templates.otpCode(code),
    });
  }

  static async sendWelcome(to: string, name: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Welcome to Blink: Your treasury is about to start working harder',
      html: templates.welcome(name, DASHBOARD_URL, API_DOCS_URL),
      replyTo: 'heyjosh@bingtellar.com'
    });
  }
    
  static async sendLoginAlert(to: string, name: string, time: string, device: string, ipAddress: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Important Alert: New login to your Blink account',
      html: templates.loginAlert(name, time, device, ipAddress),
    });
  }
    
  static async sendPasswordResetSuccess(to: string, name: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Security Alert: Your password has been changed',
      html: templates.passwordResetSuccess(name),
      replyTo: 'security@bingtellar.com' 
    });
  }


  // ==========================================================================
  // 📋 2. COMPLIANCE & KYC STATUS
  // ==========================================================================

  static async sendKYCApproved(to: string, name: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'KYC Approved - Full Service Unlocked',
      html: templates.kycApproved(name),
      replyTo: 'compliance@ourblink.cash'
    });
  }

  static async sendKycRejectedAlert(to: string, name: string, reason: string) {
    return await resend.emails.send({
      from: FROM_EMAIL, 
      to,
      subject: 'Action Required: Your Blink Verification Update',
      html: templates.kycRejected(name, reason),
      replyTo: 'compliance@ourblink.cash'
    });
  }


  // ==========================================================================
  // 🚀 3. TREASURY: PAYMENTS & ESCROWS
  // ==========================================================================

  static async sendEscrowClaimCode(to: string, amount: string, code: string, recipientEmail: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      // 🌟 FORMATTER: The 'amount' variable already includes currency strings (e.g. "300.00 USDC (Batch)")
      // We rely on the template helper to strip the string and apply commas.
      subject: 'Transfer Successful: Your Blink Secured Claim Code 🔒',
      html: templates.escrowClaimCode(amount, code, recipientEmail),
    });
  }

  static async sendEscrowReceived(to: string, senderName: string, claimLink: string, note?: string) {
    // Inject a unique identifier into the subject line to prevent Gmail from threading the receipts
    const shortRef = claimLink.split('/').pop()?.substring(0, 6).toUpperCase() || 'New';
    
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Yay! You just received a Blink payment 💸 [${shortRef}]`,
      html: templates.escrowReceived(senderName, claimLink, note), 
    });
  }

  static async sendWithdrawalOtp(to: string, code: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Action Required: Authorize your Blink Withdrawal 🔒',
      html: templates.withdrawalOtpCode(code),
    });
  }

  static async sendSenderClaimNotification(to: string, reference: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Update: Your Blink transfer has been claimed`,
      html: templates.senderClaimNotification(reference),
    });
  }

  static async sendEscrowExpiryWarning(to: string, amount: string, hoursLeft: number, claimLink: string, senderName: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      // 🌟 FORMATTER: Add commas to the dynamic Subject Line
      subject: `Action Required: Your $${formatMoney(amount)} transfer is expiring soon`,
      html: templates.escrowExpiryWarning(amount, hoursLeft, claimLink, senderName),
    });
  }

  static async sendEscrowExpiredRefund(to: string, amount: string, yieldAmount: string, recipientEmail: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Update: Transfer Expired & Funds Refunded',
      html: templates.escrowExpiredRefund(amount, yieldAmount, recipientEmail),
    });
  }


  // ==========================================================================
  // P2P PAYMENTS REQUEST
  // The Payment Request Dispatcher
  // ==========================================================================

  static async sendPaymentRequest(to: string, creatorName: string, amount: string, link: string, note?: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Action Required: ${creatorName} requested ${amount} from you`,
      html: templates.paymentRequest(creatorName, amount, link, note),
    });
  }


  // ==========================================================================
  // 🏦 4. TREASURY: DEPOSITS & WITHDRAWALS (FIAT OFF-RAMPS)
  // ==========================================================================

  static async sendDepositSuccess(to: string, amount: string, reference: string, date: string) {
    // Generate a short 6-character unique ID from the reference to break Gmail threading
    const shortRef = reference.substring(0, 8); 
    
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Deposit Successful: ${formatMoney(amount)} [${shortRef}]`,
      html: templates.depositCompleted(amount, reference, date),
    });
  }

  static async sendWithdrawalSuccess(to: string, usdcAmount: string, fiatAmount: string, reference: string, date: string) {
    // Generate a short unique ID (e.g. CW-EE2AB) to ensure the email never gets clipped
    const shortRef = reference.substring(0, 8);
    
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Withdrawal Processed: ${formatMoney(fiatAmount)} [${shortRef}]`,
      html: templates.withdrawalCompleted(usdcAmount, fiatAmount, reference, date),
    });
  }

  static async sendClaimPayoutSuccess(to: string, fiatAmount: string, reference: string) {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      // 🌟 FORMATTER: Add commas to the dynamic Subject Line
      subject: `Payment Delivered: ${formatMoney(fiatAmount)} 🎉`,
      html: templates.claimPayoutSuccess(fiatAmount, reference),
    });
  }


  // ==========================================================================
  // 🛡️ 5. INTERNAL ADMIN & ENTERPRISE PROVISIONING
  // ==========================================================================

  static async sendAdminProvisioning(to: string, name: string, role: string, setupLink: string) {
    return await resend.emails.send({
      from: 'security@ourblink.cash', // Force High-Priority dedicated sender domain
      to,
      subject: `Action Required: Blink ${role} Access Provisioned`,
      html: templates.adminProvisioning(name, role, setupLink),
      replyTo: 'security@ourblink.cash'
    });
  }

  static async sendClearanceUpgradeAlert(to: string, name: string, role: string, baseUrl: string) {
    return await resend.emails.send({
      from: 'security@ourblink.cash', // Force High-Priority dedicated sender domain
      to,
      subject: `Security Update: Upgraded to ${role}`,
      html: templates.clearanceUpgraded(name, role, baseUrl),
      replyTo: 'security@ourblink.cash'
    });
  }

}
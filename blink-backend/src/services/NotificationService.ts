import { db } from '../db';
import { adminNotifications } from '../schema';
import { logger } from '../logger';

export class NotificationService {
  /**
   * Broadcasts a critical system event to the Admin Dashboard and Telegram Pager
   */
  public static async alertAdmin(type: 'kyc_alert' | 'escrow_alert' | 'fiat_alert' | 'system_alert', title: string, message: string) {
    let dbSuccess = false;

    // 1. Primary Route: Database Persistence for the React UI
    try {
      await db.insert(adminNotifications).values({
        type,
        title,
        message,
      });
      dbSuccess = true;
    } catch (error) {
      logger.error({ err: error, title }, "🚨 CRITICAL: Failed to write admin notification to Postgres.");
    }

    // 2. Secondary Route: Autonomous Telegram Dispatcher (The Pager)
    // Always send if it's a system_alert, OR if the database failed (Fallback mechanism)
    if (type === 'system_alert' || !dbSuccess) {
      await this.dispatchTelegramAlert(type, title, message, !dbSuccess);
    }
  }

  /**
   * Centralized off-chain pager for immediate Ops team visibility
   */
  private static async dispatchTelegramAlert(type: string, title: string, message: string, isDbFailure: boolean) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        logger.warn("Telegram Pager not configured. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");
        return;
    }

    // Format for Markdown
    const emoji = type === 'system_alert' ? '🚨' : type === 'fiat_alert' ? '🏦' : type === 'kyc_alert' ? '🛡️' : '🔔';
    const dbWarning = isDbFailure ? `\n\n⚠️ *WARNING:* This alert could not be saved to the database. The Postgres connection may be compromised.` : '';
    
    const telegramMsg = `${emoji} *BLINK ADMIN ALERT*\n\n*${title}*\n${message}${dbWarning}`;

    try {
        // 🌟 THE TIMEOUT FIX: Force abort if Telegram is hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second hard limit

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                text: telegramMsg, 
                parse_mode: 'Markdown' 
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 🌟 THE HTTP ERROR FIX: Force fetch to throw if the API rejects the payload
        if (!response.ok) {
            throw new Error(`Telegram API rejected request with status: ${response.status}`);
        }
        
    } catch (telegramErr) {
        // If both the DB and Telegram fail, write a fatal local log as the absolute last resort
        logger.fatal({ err: telegramErr, title, message }, "TOTAL ALERT PIPELINE FAILURE. Both DB and Telegram rejected the alert.");
    }
  }
}
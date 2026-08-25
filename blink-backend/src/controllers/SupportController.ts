import { Request, Response } from 'express';
import { db } from '../db';
import { supportTickets, users } from '../schema';
import { eq, and, gte } from 'drizzle-orm';

const notifyOpsTeam = async (ticket: any, userEmail: string) => {
  const webhookUrl = process.env.SLACK_SUPPORT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = {
    text: `🚨 *New Support Ticket*\n*User:* ${userEmail}\n*Category:* ${ticket.category}\n*TxID:* ${ticket.transactionId || 'None'}\n*Subject:* ${ticket.subject}\n> ${ticket.message}`
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Failed to notify Ops team", e);
  }
};

export const SupportController = {
  createTicket: async (req: Request, res: Response) => {
    try {
      // 🌟 THE TYPE SAFETY FIX: Explicitly cast as string to satisfy Drizzle ORM
      let targetUserId: string = req.params.userId as string;
      
      if (targetUserId === 'me') {
         targetUserId = ((req as any).user?.id || (req as any).user?.userId) as string;
      }

      if (!targetUserId || targetUserId === 'undefined') {
        return res.status(401).json({ error: "Unauthorized request. User identity missing." });
      }

      const { category, subject, message, transactionId } = req.body;

      if (!category || !subject || !message) {
        return res.status(400).json({ error: "Category, subject, and message are required." });
      }

      if (subject.length > 255) return res.status(400).json({ error: "Subject is too long." });
      if (message.length > 5000) return res.status(400).json({ error: "Message is too long." });
      
      const safeTxId = transactionId ? String(transactionId) : null;
      if (safeTxId && safeTxId.length > 255) return res.status(400).json({ error: "Transaction ID is invalid." });

      // 60-Second Anti-Spam Lock
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const recentTickets = await db.select()
        .from(supportTickets)
        .where(and(eq(supportTickets.userId, targetUserId), gte(supportTickets.createdAt, oneMinuteAgo)))
        .limit(1);

      if (recentTickets.length > 0) {
        return res.status(429).json({ error: "You are submitting tickets too quickly. Please wait a moment." });
      }

      const [newTicket] = await db.insert(supportTickets).values({
        userId: targetUserId,
        category: String(category),
        subject: String(subject),
        message: String(message),
        transactionId: safeTxId,
      }).returning();

      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, targetUserId)).limit(1);

      if (user?.email) {
        notifyOpsTeam(newTicket, user.email);
      }

      return res.status(201).json({ 
        message: "Support ticket created successfully.", 
        ticket: newTicket 
      });
    } catch (error) {
      console.error("[SupportController] Error creating ticket:", error);
      return res.status(500).json({ error: "Failed to create support ticket. Please try again." });
    }
  }
};
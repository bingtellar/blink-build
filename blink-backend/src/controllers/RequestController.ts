import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { paymentRequests, transactions, users } from '../schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../logger';
import { EmailService } from '../services/EmailService';
import { XService } from '../services/XService';

export const RequestController = {
  createBulkRequests: async (req: Request, res: Response) => {
    try {
      const creatorId = (req as any).user.userId;
      const { amount, fiatAmount, fiatCurrency, note, recipients, splitType, customAmounts } = req.body;

      if (!recipients || recipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient is required." });
      }

      // =========================================================================
      // 🛡️ THE FIX: SMART CONTACT SANITIZER
      // =========================================================================
      // If the user types "jc_sdk" instead of "@jc_sdk", this catches it and 
      // forces it into the X-Router instead of letting it fall into the void.
      recipients.forEach((r: any) => {
        const contact = r.contact?.trim() || "";
        const isEmail = contact.includes('@') && contact.includes('.');
        const isPhone = /^[\d\+\-\s\(\)]+$/.test(contact);
        const isStellarWallet = contact.startsWith('G') && contact.length === 56;
        
        // If it's not an email, phone, or wallet, and missing the '@', append it.
        if (!isEmail && !isPhone && !isStellarWallet && contact.length > 0 && !contact.startsWith('@')) {
          r.contact = `@${contact}`;
        } else {
          r.contact = contact;
        }
      });

      const creatorRecord = await db.select().from(users).where(eq(users.id, creatorId)).limit(1);
      if (creatorRecord.length === 0) throw new Error("Creator not found");
      const creator = creatorRecord[0];
      const creatorName = creator.businessName || (creator.firstName ? `${creator.firstName} ${creator.lastName || ''}`.trim() : "Blink User");

      const baseRef = `REQ${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const totalAmount = parseFloat(amount);
      const totalFiat = fiatAmount ? parseFloat(fiatAmount) : undefined;
      const recipientNames = recipients.map((r: any) => r.contact);

      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

      // =========================================================================
      // PHASE 1: PRE-FLIGHT (Parallel Network Checks OUTSIDE DB Transaction)
      // =========================================================================
      
      const xHandlesToVerify = recipients
          .map((r: any) => r.contact)
          .filter((contact: string) => contact.startsWith('@'));
          
      const validXHandlesSet = await XService.verifyHandlesBatch(xHandlesToVerify);

      const verifiedRecipients = recipients.map((payer: any) => {
          // Strict 2-decimal rounding to prevent the floating-point penny problem
          const rawFiat = splitType === "EQUAL" ? (totalFiat ? totalFiat / recipients.length : 0) : parseFloat(customAmounts[payer.id] || "0");
          const payerFiatAmount = parseFloat(rawFiat.toFixed(2));
          
          const rawUsdc = splitType === "EQUAL" ? (totalAmount / recipients.length) : (payerFiatAmount / (totalFiat ? (totalFiat / totalAmount) : 1));
          const payerUsdcAmount = parseFloat(rawUsdc.toFixed(2));
          
          const childRef = `REQ${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const formattedAmount = `${payerFiatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${fiatCurrency}`;
          const paymentLink = `${FRONTEND_URL}/pay?pay_req=${childRef}`;

          let isXHandleValid = false;
          if (payer.contact.startsWith('@')) {
            const cleanHandle = payer.contact.replace('@', '').toLowerCase();
            isXHandleValid = validXHandlesSet.has(cleanHandle);
          }

          return {
            ...payer,
            childRef,
            payerFiatAmount,
            payerUsdcAmount,
            formattedAmount,
            paymentLink,
            isXHandleValid
          };
      });

      const emailsToSend: { email: string; amount: string; link: string }[] = [];
      const xMentionsToSend: { handle: string; amount: string; link: string }[] = [];

      // =========================================================================
      // PHASE 2: PERSISTENCE (Ultra-fast ACID Transaction inside DB)
      // =========================================================================
      await db.transaction(async (tx) => {
        
        await tx.insert(paymentRequests).values({
          creatorId,
          creatorName,
          amount: totalAmount.toString(),
          fiatAmount: totalFiat?.toString(),
          fiatCurrency,
          status: "pending",
          reference: baseRef,
          note,
          recipients: recipientNames,
          isPublicLink: false,
          isBaseRequest: true,
          timeline: [{ state: "request_created", timestamp: new Date().toISOString(), metadata: { notes: "Payment request container created." } }]
        });

        await tx.insert(transactions).values({
          userId: creatorId,
          type: "request",
          amount: totalAmount.toString(),
          fiatAmount: totalFiat?.toString(),
          fiatCurrency,
          status: "pending",
          reference: baseRef,
          note,
          recipients: recipientNames,
          description: recipients.length > 1 ? `Request to ${recipients[0].name || recipients[0].contact} and ${recipients.length - 1} others` : `Request to ${recipients[0].name || recipients[0].contact}`,
          role: "creator"
        });

        for (const item of verifiedRecipients) {
          await tx.insert(paymentRequests).values({
            creatorId,
            creatorName,
            amount: item.payerUsdcAmount.toString(),
            fiatAmount: item.payerFiatAmount.toString(),
            fiatCurrency,
            status: "pending",
            reference: item.childRef,
            note,
            isPublicLink: true,
            isBaseRequest: false,
            baseRequestId: baseRef,
            payerEmail: item.contact,
            timeline: [{ state: "request_created", timestamp: new Date().toISOString(), metadata: { notes: "Request sent to payer." } }]
          });

          const internalUser = await tx.select().from(users).where(eq(users.email, item.contact.toLowerCase())).limit(1);
          if (internalUser.length > 0) {
              await tx.insert(transactions).values({
                userId: internalUser[0].id,
                type: "request",
                amount: item.payerUsdcAmount.toString(),
                fiatAmount: item.payerFiatAmount.toString(),
                fiatCurrency,
                status: "pending",
                reference: item.childRef,
                note,
                description: `Request from ${creatorName}`,
                role: "payer"
              });
          }

          if (item.contact.startsWith('@')) {
              if (item.isXHandleValid) {
                 xMentionsToSend.push({ handle: item.contact, amount: item.formattedAmount, link: item.paymentLink });
              } else {
                 logger.warn(`Skipped X routing to ${item.contact}: Handle does not exist.`);
              }
          } else if (item.contact.includes('@')) {
              emailsToSend.push({ email: item.contact, amount: item.formattedAmount, link: item.paymentLink });
          }
        }
      }); 

      // =========================================================================
      // PHASE 3: DISPATCH (Background Side-Effects OUTSIDE DB Transaction)
      // =========================================================================
      Promise.all(emailsToSend.map(e => EmailService.sendPaymentRequest(e.email, creatorName, e.amount, e.link, note))).catch(err => logger.error({ err }, "Failed to dispatch request emails"));
      Promise.all(xMentionsToSend.map(x => XService.routePaymentRequest(x.handle, creatorName, x.amount, x.link))).catch(err => logger.error({ err }, "Failed to dispatch X mentions"));

      res.status(201).json({ success: true, reference: baseRef });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to create bulk requests");
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },

  createOpenRequest: async (req: Request, res: Response) => {
    try {
      const creatorId = (req as any).user.userId;
      const { amount, fiatAmount, fiatCurrency, note } = req.body;

      const creatorRecord = await db.select().from(users).where(eq(users.id, creatorId)).limit(1);
      if (creatorRecord.length === 0) throw new Error("Creator not found");
      const creator = creatorRecord[0];
      const creatorName = creator.businessName || (creator.firstName ? `${creator.firstName} ${creator.lastName || ''}`.trim() : "Blink User");

      const reference = `REQ${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      await db.transaction(async (tx) => {
        await tx.insert(paymentRequests).values({
          creatorId,
          creatorName,
          amount: amount.toString(),
          fiatAmount: fiatAmount?.toString(),
          fiatCurrency,
          status: "pending",
          reference,
          note,
          isPublicLink: true,
          isBaseRequest: true,
          timeline: [{ state: "request_created", timestamp: new Date().toISOString(), metadata: { notes: "Open payment request created." } }]
        });

        await tx.insert(transactions).values({
          userId: creatorId,
          type: "request",
          amount: amount.toString(),
          fiatAmount: fiatAmount?.toString(),
          fiatCurrency,
          status: "pending",
          reference,
          note,
          description: "Open Request Link",
          role: "creator"
        });
      });

      res.status(201).json({ success: true, reference });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to create open request");
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },

  getRequestByReference: async (req: Request, res: Response) => {
    try {
      const reference = req.params.reference as string;
      const reqRecord = await db.select().from(paymentRequests).where(eq(paymentRequests.reference, reference)).limit(1);
      if (reqRecord.length === 0) return res.status(404).json({ error: "Request not found" });
      res.json(reqRecord[0]);
    } catch (error: any) {
      logger.error({ err: error }, "Failed to fetch request");
      res.status(500).json({ error: "Internal server error" });
    }
  },

  processInternalPayment: async (req: Request, res: Response) => {
    try {
      const reference = req.params.reference as string;
      const { status, note, paymentPayload } = req.body; 
      const payerId = (req as any).user.userId;

      if (status === "request_canceled" || status === "request_rejected") {
          await db.transaction(async (tx) => {
              const existing = await tx.select().from(paymentRequests).where(eq(paymentRequests.reference, reference)).limit(1).for('update');
              if (existing.length === 0) throw new Error("Request not found");
              
              const safeNote = note ? String(note).substring(0, 250) : undefined;
              const newTimeline = [...(existing[0].timeline as any[]), { state: status, timestamp: new Date().toISOString(), metadata: { notes: safeNote } }];
              const mappedStatus = status === "request_canceled" ? "cancelled" : "rejected";
              
              await tx.update(paymentRequests).set({ status, timeline: newTimeline }).where(eq(paymentRequests.reference, reference));
              await tx.update(transactions).set({ status: mappedStatus }).where(eq(transactions.reference, reference));
          });
          return res.json({ success: true }); 
      }

      const grossUsdc = Math.round(parseFloat(paymentPayload?.grossUsdc) * 100) / 100;
      let netUsdcToCreator = Math.round(parseFloat(paymentPayload?.netUsdcToCreator) * 100) / 100;
      const fiatPaid = Math.round(parseFloat(paymentPayload?.fiatPaid || "0") * 100) / 100;

      if (isNaN(grossUsdc) || grossUsdc <= 0 || isNaN(netUsdcToCreator) || netUsdcToCreator < 0 || isNaN(fiatPaid) || fiatPaid < 0) {
          throw new Error("Malicious payload detected: Invalid payment amounts.");
      }

      if (netUsdcToCreator > grossUsdc) {
          logger.warn({ payerId, reference, grossUsdc, netUsdcToCreator }, "CRITICAL: Attempted ledger manipulation detected.");
          netUsdcToCreator = grossUsdc; 
      }

      await db.transaction(async (tx) => {
          // 🛡️ .for('update') prevents double-spends and race conditions
          const existing = await tx.select().from(paymentRequests).where(eq(paymentRequests.reference, reference)).limit(1).for('update');
          if (existing.length === 0) throw new Error("Request not found");
          const reqRecord = existing[0];

          if (['request_canceled', 'request_rejected', 'request_paid', 'completed'].includes(reqRecord.status)) {
              throw new Error(`Cannot pay. Request is already ${reqRecord.status.replace('_', ' ')}.`);
          }

          const isFiatRequest = !!reqRecord.fiatAmount;
          const targetFiat = Math.round(parseFloat(reqRecord.fiatAmount || "0") * 100) / 100;
          const currentFiatPaid = Math.round(parseFloat(reqRecord.fiatAmountPaid || "0") * 100) / 100;
          const targetUsdc = Math.round(parseFloat(reqRecord.amount) * 100) / 100;
          const currentUsdcPaid = Math.round(parseFloat(reqRecord.amountPaid || "0") * 100) / 100;

          if (isFiatRequest) {
              const expectedUsdcForThisFiat = (fiatPaid / targetFiat) * targetUsdc;
              if (grossUsdc < (expectedUsdcForThisFiat * 0.98)) {
                  throw new Error("Exchange rate mismatch: USDC provided does not cover the Fiat value claimed.");
              }
          }

          const targetAmountToCheck = isFiatRequest ? targetFiat : targetUsdc;
          const currentPaidToCheck = isFiatRequest ? currentFiatPaid : currentUsdcPaid;
          const amountBeingPaid = isFiatRequest ? fiatPaid : grossUsdc;

          const proposedNewTotal = Math.round((currentPaidToCheck + amountBeingPaid) * 100) / 100;
          if (proposedNewTotal > targetAmountToCheck) {
              throw new Error(`Payment exceeds remaining limit. Remaining: ${(targetAmountToCheck - currentPaidToCheck).toFixed(2)}`);
          }

          // 🛡️ EPSILON FIX: 2 cents tolerance for floating point split penny issues
          const EPSILON = 0.02; 
          const isFullyPaid = (targetAmountToCheck - proposedNewTotal) <= EPSILON;
          
          const secureStatus = isFullyPaid ? "request_paid" : "request_partially_paid";

          const updatedPayer = await tx.update(users)
              .set({ balance: sql`CAST(COALESCE(${users.balance}, '0') AS NUMERIC) - ${grossUsdc}` })
              .where(and(eq(users.id, payerId), sql`CAST(COALESCE(${users.balance}, '0') AS NUMERIC) >= ${grossUsdc}`))
              .returning();

          if (updatedPayer.length === 0) {
              throw new Error("Insufficient Blink Balance or concurrent modification.");
          }

          const safeNote = note ? String(note).substring(0, 250) : undefined;
          const newTimeline = [...(reqRecord.timeline as any[]), { state: secureStatus, timestamp: new Date().toISOString(), metadata: { notes: safeNote } }];
          const mappedStatus = secureStatus === "request_paid" ? "completed" : "pending";

          await tx.update(users).set({ balance: sql`CAST(COALESCE(${users.balance}, '0') AS NUMERIC) + ${netUsdcToCreator}` }).where(eq(users.id, reqRecord.creatorId));
          
          await tx.insert(transactions).values({
              userId: reqRecord.creatorId, 
              amount: netUsdcToCreator.toString(), 
              type: "deposit", 
              reference: `${reference}_${crypto.randomBytes(4).toString('hex')}`, 
              status: "completed", 
              description: `Payment Received from ${updatedPayer[0].firstName || 'Blink User'}`
          });
          
          await tx.update(paymentRequests)
            .set({ 
                status: secureStatus, 
                amountPaid: sql`CAST(COALESCE(${paymentRequests.amountPaid}, '0') AS NUMERIC) + ${grossUsdc}`, 
                fiatAmountPaid: sql`CAST(COALESCE(${paymentRequests.fiatAmountPaid}, '0') AS NUMERIC) + ${fiatPaid}`, 
                timeline: newTimeline 
            })
            .where(eq(paymentRequests.reference, reference));
            
          await tx.update(transactions).set({ status: mappedStatus }).where(eq(transactions.reference, reference));
      });

      res.json({ success: true });
    } catch (error: any) { 
      logger.error({ err: error }, "Failed to process internal payment");
      res.status(400).json({ error: error.message }); 
    }
  },

  processPublicPayment: async (req: Request, res: Response) => {
    try {
      const reference = req.params.reference as string;
      const { status, note, txHash } = req.body; 

      await db.transaction(async (tx) => {
          const secureStatus = status === "request_rejected" ? "request_rejected" : "processing";
          
          // 🛡️ .for('update') lock
          const existing = await tx.select().from(paymentRequests).where(eq(paymentRequests.reference, reference)).limit(1).for('update');
          if (existing.length === 0) throw new Error("Request not found");
          const reqRecord = existing[0];

          if (['request_paid', 'request_canceled', 'processing', 'request_rejected'].includes(reqRecord.status)) {
              return res.json({ success: true }); 
          }
          
          const safeNote = note ? String(note).substring(0, 250) : undefined;
          const safeTxHash = txHash ? String(txHash).substring(0, 150) : undefined;
          const newTimeline = [...(reqRecord.timeline as any[]), { state: secureStatus, timestamp: new Date().toISOString(), metadata: { notes: safeNote, expectedTxHash: safeTxHash } }];
          
          await tx.update(paymentRequests).set({ status: secureStatus, timeline: newTimeline }).where(eq(paymentRequests.reference, reference));
          if (secureStatus === "request_rejected") {
              await tx.update(transactions).set({ status: "rejected" }).where(eq(transactions.reference, reference));
          }
      });

      res.json({ success: true, message: "External payment state updated." });
    } catch (error: any) { 
      logger.error({ err: error }, "Failed to process public payment");
      res.status(400).json({ error: error.message }); 
    }
  }
};
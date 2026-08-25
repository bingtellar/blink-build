// ==========================================
// 🚨 ADVANCED LINK TRACKER & STATE MACHINE
// ==========================================
export type ClaimState = 
  | "claim_created"     
  | "claim_started"     
  | "claim_pending"     
  | "claim_processing"  
  | "claim_completed"   
  | "claim_canceled"    
  | "claim_expired";    

export type RequestState = 
  | "request_created"   
  | "request_partially_paid" 
  | "request_paid"      
  | "request_canceled"
  | "request_rejected";      

export interface ClaimEvent {
  state: ClaimState | RequestState; 
  timestamp: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    failureReason?: string;
    notes?: string;
    amountPaidStr?: string; 
  };
}

export interface LedgerEntry {
  id: string;
  accountId: string; 
  amount: number; 
  type: "debit" | "credit";
  description: string;
  timestamp: string;
}

export interface EscrowPayment {
  id: string;              
  batchId: string;         
  claimId: string;         
  idempotencyKey: string;
  senderAccountId: string;
  senderName: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  usdcEquivalent: number;
  feeAmount: number;
  status: ClaimState;      
  timeline: ClaimEvent[];  
  dateCreated: string;
  note: string;            
  yieldRecipient: string;
  claimableAfter: string;
  dueDate: string;
  estimatedYield: number;
  otp: string;           
  lockedAt: number | null; 
  claimLink: string;       
  notifySenderOnClaim: boolean; 
}

export interface PaymentRequest {
  id: string;
  reference: string;
  creatorAccountId: string;
  creatorName?: string;     
  amount: number;         
  amountPaid: number;       
  fiatAmount?: number;
  fiatAmountPaid?: number;  
  fiatCurrency?: string;
  status: RequestState;
  timeline: ClaimEvent[]; 
  dateCreated: string;
  note?: string;
  recipients?: string[];  
  isPublicLink: boolean;  
  isBaseRequest?: boolean;
  baseRequestId?: string;
  payerEmail?: string;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "payment" | "transfer" | "request"; 
  amount: number;         
  date: string;
  status: string; 
  description: string;
  trackingState?: string; 
  reference?: string;     
  network?: string;
  fiatAmount?: number;    
  fiatCurrency?: string;  
  exchangeRate?: number;  
  networkFee?: number;    
  processingFee?: number; 
  note?: string;          
  memo?: string;          
  recipientEmail?: string; 
  recipients?: string[];   
  role?: "creator" | "payer"; 
  amountDisbursed?: number; 
  // 🌟 NEW: Granular Metrics Tracking for Batches
  completedCount?: number;
  cancelledCount?: number;
  totalCount?: number;
}

export interface Recipient {
  id: string;
  name: string;
  type: string; 
  details: string; 
  email?: string; 
  walletAddress?: string; 
  dateAdded: string;
  beneficiaryType?: string;
  bankCountry?: string;
  bankName?: string;
  accountTypeOption?: string;
  routingNumber?: string;
  momoCountry?: string;
  momoNetwork?: string;
  token?: string;
  network?: string;
}

// 🌟 NEW: Admin Notification Interface
export interface AdminNotification {
  id: string;
  type: "success" | "warning" | "alert" | "info";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// 🌟 FIX: Dynamic Source of Truth for all platform fees
export const getPlatformFees = () => {
  try {
    const saved = localStorage.getItem("bingtellar_platform_fees");
    return saved ? JSON.parse(saved) : { cancellation: 1.00, processing: 1.00 };
  } catch {
    return { cancellation: 1.00, processing: 1.00 };
  }
};

const DB_KEY = "bingtellar_escrow_db";
const LEDGER_KEY = "bingtellar_ledger_db";
const RECIPIENTS_KEY = "bingtellar_recipients"; 
const TRANSACTIONS_KEY = "bingtellar_mock_transactions"; 
const REQUESTS_KEY = "bingtellar_mock_requests";
const ADMIN_NOTIFS_KEY = "bingtellar_admin_notifs"; // 🌟 NEW KEY

export const mockDB = {

  // 🌟 NOTIFICATION SYSTEM CONTROLLERS
  getAdminNotifications: (): AdminNotification[] => {
    try {
      const data = localStorage.getItem(ADMIN_NOTIFS_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  addAdminNotification: (notif: Omit<AdminNotification, "id" | "timestamp" | "read">) => {
    const notifs = mockDB.getAdminNotifications();
    const newNotif: AdminNotification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      read: false
    };
    const updated = [newNotif, ...notifs].slice(0, 50); // Keep last 50 to prevent bloating
    localStorage.setItem(ADMIN_NOTIFS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('admin_notification_received'));
    return newNotif;
  },

  markAdminNotificationsRead: () => {
    const notifs = mockDB.getAdminNotifications().map(n => ({ ...n, read: true }));
    localStorage.setItem(ADMIN_NOTIFS_KEY, JSON.stringify(notifs));
    window.dispatchEvent(new Event('admin_notification_received'));
  },

  getPayments: (): EscrowPayment[] => {
    const data = localStorage.getItem(DB_KEY);
    if (!data) return [];
    const payments: EscrowPayment[] = JSON.parse(data);
    
    const APY = 0.13; 
    const msPerYear = 365 * 24 * 60 * 60 * 1000;

    return payments.map(p => {
      const terminalStates = ["claim_completed", "claim_canceled", "claim_expired"];
      if (terminalStates.includes(p.status)) {
        return p; 
      }
      
      const durationMs = Date.now() - new Date(p.dateCreated).getTime();
      const liveYield = durationMs > 0 ? (p.amount * APY * (durationMs / msPerYear)) : 0;
      
      return { ...p, estimatedYield: liveYield };
    });
  },

  getLedger: (): LedgerEntry[] => {
    const data = localStorage.getItem(LEDGER_KEY);
    return data ? JSON.parse(data) : [];
  },

  getTransactions: (): TransactionRecord[] => {
    const data = localStorage.getItem(TRANSACTIONS_KEY);
    return data ? JSON.parse(data) : [];
  },

  getRequests: (): PaymentRequest[] => {
    const data = localStorage.getItem(REQUESTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  getWalletBalance: (accountId: string): number => {
    return mockDB.getLedger()
      .filter(l => l.accountId === accountId)
      .reduce((sum, l) => sum + l.amount, 0);
  },

  getEscrowBalance: (accountId: string): number => {
    return mockDB.getPayments()
      .filter(p => p.senderAccountId === accountId && !["claim_completed", "claim_canceled", "claim_expired"].includes(p.status))
      .reduce((sum, p) => sum + p.amount, 0);
  },

// 🌟 FIX: Yield calculator now respects 50/50 splits, recipient gifts, and 100% cancellation refunds
  getTotalYieldEarned: (accountId: string): number => {
    return mockDB.getPayments()
      .filter(p => p.senderAccountId === accountId)
      .reduce((sum, p) => {
         let earned = 0;
         
         if (p.status === "claim_canceled" || p.status === "claim_expired") {
            // If cancelled, 100% always reverts to the sender
            earned = p.estimatedYield;
         } else {
            // If completed or pending, respect the user's routing choice
            if (p.yieldRecipient === "split") earned = p.estimatedYield / 2;
            else if (p.yieldRecipient === "recipient") earned = 0; // Sender gave it away
            else earned = p.estimatedYield; // Sender kept it
         }
         
         return sum + earned;
      }, 0);
  },

  // 🌟 NEW: PERFECT METRICS HELPER FOR MAIN DASHBOARD
  getPaymentMetrics: (accountId: string) => {
    const payments = mockDB.getPayments().filter(p => p.senderAccountId === accountId);
    return {
      totalSent: payments.length,
      successful: payments.filter(p => p.status === 'claim_completed').length,
      failedOrCancelled: payments.filter(p => p.status === 'claim_canceled' || p.status === 'claim_expired').length,
      pending: payments.filter(p => ['claim_created', 'claim_started', 'claim_pending', 'claim_processing'].includes(p.status)).length
    };
  },

  addTransaction: (tx: Omit<TransactionRecord, "id" | "date">): TransactionRecord => {
    const transactions = mockDB.getTransactions();
    const newTx: TransactionRecord = {
      ...tx,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
    };
    const updatedTxs = [newTx, ...transactions];
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTxs));
    window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

    // 🌟 NOTIFICATION TRIGGER: Deposits & Withdrawals
    if (tx.type === "withdrawal") {
        mockDB.addAdminNotification({ type: "info", title: "New Withdrawal Order", message: `Account ${tx.accountId.substring(0,8)} requested a withdrawal of $${tx.amount.toFixed(2)}.`});
    } else if (tx.type === "deposit") {
        mockDB.addAdminNotification({ type: "success", title: "Deposit Completed", message: `Account ${tx.accountId.substring(0,8)} successfully deposited $${tx.amount.toFixed(2)}.`});
    }

    return newTx;
  },

  addRequest: (req: Omit<PaymentRequest, "id" | "dateCreated" | "timeline" | "status" | "amountPaid" | "fiatAmountPaid">): PaymentRequest => {
    const requests = mockDB.getRequests();
    const newReq: PaymentRequest = {
      ...req,
      id: Math.random().toString(36).substr(2, 9),
      amountPaid: 0,
      fiatAmountPaid: 0,
      creatorName: req.creatorName || "Timi Fred", 
      dateCreated: new Date().toISOString(),
      status: "request_created",
      timeline: [{
        state: "request_created",
        timestamp: new Date().toISOString(),
        metadata: { notes: "Payment request created." }
      }]
    };
    const updatedReqs = [newReq, ...requests];
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(updatedReqs));
    return newReq;
  },

  updateRequestState: (
    identifier: string, 
    newState: RequestState, 
    metadata?: ClaimEvent['metadata'],
    paymentPayload?: { grossUsdc: number; netUsdcToCreator: number; fiatPaid: number; fee: number } 
  ): { success: boolean; message: string; request?: PaymentRequest } => {
    
    const requests = mockDB.getRequests();
    const index = requests.findIndex((r) => r.id === identifier || r.reference === identifier);
    if (index === -1) return { success: false, message: "Request not found." };
    const r = requests[index];

    const terminalStates = ["request_paid", "request_canceled", "request_rejected"];
    if (terminalStates.includes(r.status)) {
      return { success: false, message: `Cannot update. Request is already: ${r.status}` };
    }

    if (newState === "request_canceled" || newState === "request_rejected") {
      const txs = mockDB.getTransactions();
      let txsChanged = false;

      if (newState === "request_canceled") {
        const childReqs = requests.filter(child => child.baseRequestId === r.reference);
        childReqs.forEach(child => {
          child.status = "request_canceled";
          child.timeline.push({ state: "request_canceled", timestamp: new Date().toISOString(), metadata: { notes: "Base request was canceled by creator." } });
        });

        txs.forEach(tx => {
          if (tx.type === "request" && (tx.reference === r.reference || childReqs.some(c => c.reference === tx.reference))) {
            tx.status = "cancelled"; 
            txsChanged = true;
          }
        });
      }

      if (newState === "request_rejected") {
         if (r.baseRequestId) {
            const baseIndex = requests.findIndex(base => base.reference === r.baseRequestId);
            if (baseIndex !== -1) {
               requests[baseIndex].status = "request_rejected";
               requests[baseIndex].timeline.push({ 
                 state: "request_rejected", 
                 timestamp: new Date().toISOString(), 
                 metadata: metadata || { notes: "Request rejected by payer." } 
               });
            }
         }

         txs.forEach(tx => {
            if (tx.type === "request" && (tx.reference === r.reference || tx.reference === r.baseRequestId)) {
               tx.status = "rejected";
               txsChanged = true;
            }
         });
      }

      if (txsChanged) {
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
      }
    }

    if (paymentPayload && (newState === "request_paid" || newState === "request_partially_paid")) {
      if (paymentPayload.grossUsdc <= 0) return { success: false, message: "Invalid payment amount." }; 

      r.amountPaid += paymentPayload.grossUsdc;
      if (r.fiatAmountPaid !== undefined) {
        r.fiatAmountPaid += paymentPayload.fiatPaid;
      }

      if (r.amountPaid >= r.amount - 0.01) {
        newState = "request_paid";
      } else {
        newState = "request_partially_paid";
      }

      if (r.baseRequestId) {
        const baseIndex = requests.findIndex(base => base.reference === r.baseRequestId);
        if (baseIndex !== -1) {
          const baseReq = requests[baseIndex];
          baseReq.amountPaid += paymentPayload.grossUsdc;
          if (baseReq.fiatAmountPaid !== undefined) {
            baseReq.fiatAmountPaid += paymentPayload.fiatPaid;
          }
          
          if (baseReq.amountPaid >= baseReq.amount - 0.01) {
            baseReq.status = "request_paid";
          } else {
            baseReq.status = "request_partially_paid";
          }
          requests[baseIndex] = baseReq;
        }
      }

      const ledger = mockDB.getLedger();
      ledger.push({ 
        id: `leg_${Date.now()}_req_in`, 
        accountId: r.creatorAccountId, 
        amount: paymentPayload.netUsdcToCreator, 
        type: "credit", 
        description: `Request Paid: ${r.reference}`, 
        timestamp: new Date().toISOString() 
      });
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));

      mockDB.addTransaction({
        accountId: r.creatorAccountId,
        type: "deposit",
        amount: paymentPayload.netUsdcToCreator, 
        processingFee: paymentPayload.fee, 
        fiatAmount: paymentPayload.fiatPaid,
        fiatCurrency: r.fiatCurrency,
        status: "completed",
        description: `Payment Received via Request Link`,
        reference: r.reference
      });
    }

    r.status = newState;
    r.timeline.push({
      state: newState,
      timestamp: new Date().toISOString(),
      metadata: metadata || { notes: `Request status changed to ${newState}` }
    });

    requests[index] = r;
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

    return { success: true, message: `Request successfully updated to ${newState}`, request: r };
  },

  getById: (id: string): EscrowPayment | null => {
    mockDB.runCronJobs(); 
    const payments = mockDB.getPayments();
    return payments.find((p) => p.id === id || p.claimId === id) || null;
  },

  getByClaimId: (claimId: string): EscrowPayment | null => {
    mockDB.runCronJobs(); 
    const payments = mockDB.getPayments();
    return payments.find((p) => p.claimId === claimId) || null;
  },

  getPaymentsBySender: (accountId: string): EscrowPayment[] => {
    mockDB.runCronJobs();
    const payments = mockDB.getPayments();
    return payments.filter((p) => p.senderAccountId === accountId);
  },

  getPaymentsByEmail: (email: string): EscrowPayment[] => {
    mockDB.runCronJobs();
    const payments = mockDB.getPayments();
    return payments.filter((p) => p.recipientEmail.toLowerCase() === email.toLowerCase());
  },

  getLedgerByAccountId: (accountId: string): LedgerEntry[] => {
    const ledger = mockDB.getLedger();
    return ledger.filter((l) => l.accountId === accountId);
  },

  verifyPaymentStatus: (transactionId: string): Partial<EscrowPayment> | { error: string, code: string } => {
    mockDB.runCronJobs();
    const payments = mockDB.getPayments();
    const payment = payments.find((p) => p.id === transactionId || p.claimId === transactionId);

    if (!payment) {
      return { error: "Link not found or invalid.", code: "NOT_FOUND" };
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      recipientEmail: payment.recipientEmail,
      dateCreated: payment.dateCreated,
      claimableAfter: payment.claimableAfter,
      dueDate: payment.dueDate,
      timeline: payment.timeline 
    };
  },

updateClaimState: (
    identifier: string, 
    newState: ClaimState, 
    metadata?: ClaimEvent['metadata'],
    feePayload?: { claimFeeAmount: number } 
  ): { success: boolean; message: string; payment?: EscrowPayment } => {
    
    const payments = mockDB.getPayments(); 
    const index = payments.findIndex((p) => p.id === identifier || p.claimId === identifier);
    
    if (index === -1) return { success: false, message: "Payment not found." };
    const p = payments[index];

    const terminalStates = ["claim_completed", "claim_canceled", "claim_expired"];
    if (terminalStates.includes(p.status)) {
      return { success: false, message: `Cannot update. Payment is already in terminal state: ${p.status}` };
    }

    if (newState === "claim_completed" && !["claim_processing", "claim_pending"].includes(p.status)) {
      return { success: false, message: "Fraud prevention: Cannot complete claim without prior authentication/processing state." };
    }
    if (p.status === "claim_created" && (newState === "claim_pending" || newState === "claim_processing")) {
      return { success: false, message: "Fraud prevention: Must go through 'started' state first." };
    }

    if (["claim_started", "claim_pending", "claim_processing", "claim_completed"].includes(newState)) {
      if (p.claimableAfter) {
        const unlockTime = new Date(p.claimableAfter).getTime();
        const nowTime = Date.now();
        
        if (nowTime < unlockTime) {
          return { 
            success: false, 
            message: `Time-lock active: Funds are secured in escrow and cannot be interacted with until ${new Date(p.claimableAfter).toLocaleDateString()}.` 
          };
        }
      }
    }

    p.status = newState;
    p.timeline.push({
      state: newState,
      timestamp: new Date().toISOString(),
      metadata: metadata || { notes: "System automated state transition" }
    });

    const ledger = mockDB.getLedger();
    const nowStr = new Date().toISOString();

    if (newState === "claim_completed") {
      const collectedFee = feePayload?.claimFeeAmount || 0;
      const netPayout = p.amount - collectedFee;

      ledger.push({ id: `leg_${Date.now()}_out1`, accountId: "SYSTEM_ESCROW_WALLET", amount: -p.amount, type: "debit", description: `Release escrow for: ${p.id}`, timestamp: nowStr });
      
      if (netPayout > 0) {
        ledger.push({ id: `leg_${Date.now()}_out2`, accountId: "OUTBOUND_PAYMENT_GATEWAY", amount: netPayout, type: "credit", description: `Payout cleared to recipient for ${p.id}`, timestamp: nowStr });
      }

      if (collectedFee > 0) {
        ledger.push({ id: `leg_${Date.now()}_fee1`, accountId: "SYSTEM_FEE_WALLET", amount: collectedFee, type: "credit", description: `Claim Processing Fee: ${p.id}`, timestamp: nowStr });
      }

      // 🌟 NOTIFICATION TRIGGER: Claim Successfully Completed
      mockDB.addAdminNotification({ type: "success", title: "Claim Paid Out", message: `Escrow ${p.id.substring(0,8)} was successfully claimed by ${p.recipientEmail}.`});

    }
  else if (newState === "claim_canceled" || newState === "claim_expired") {
      const isCancellation = newState === "claim_canceled";
      const fees = getPlatformFees();
      const penaltyFee = isCancellation ? Math.min(fees.cancellation, p.amount) : 0;
      const refundAmount = p.amount - penaltyFee;

      ledger.push({ id: `leg_${Date.now()}_ref1`, accountId: "SYSTEM_ESCROW_WALLET", amount: -p.amount, type: "debit", description: `Refund escrow: ${p.id}`, timestamp: nowStr });
      
      if (penaltyFee > 0) {
        ledger.push({ id: `leg_${Date.now()}_pen1`, accountId: "SYSTEM_FEE_WALLET", amount: penaltyFee, type: "credit", description: `Cancellation Penalty: ${p.id}`, timestamp: nowStr });
      }

      if (refundAmount > 0) {
        ledger.push({ id: `leg_${Date.now()}_ref2`, accountId: p.senderAccountId, amount: refundAmount, type: "credit", description: `Refund received: ${p.id}`, timestamp: nowStr });
      }
      
      if (refundAmount > 0) {
        const refundDesc = `Refund: ${isCancellation ? "Cancelled (Penalty Applied)" : "Expired"} Transfer`;
        
        mockDB.addTransaction({
          accountId: p.senderAccountId,
          type: "deposit",
          amount: refundAmount,
          status: "completed",
          description: refundDesc,
          note: refundDesc, 
          reference: p.id
        });
      }

      // 🌟 NOTIFICATION TRIGGER: Claim Failed or Cancelled
      mockDB.addAdminNotification({ 
          type: isCancellation ? "warning" : "alert", 
          title: isCancellation ? "Claim Cancelled" : "Claim Expired", 
          message: `Escrow ${p.id.substring(0,8)} was ${isCancellation ? "manually cancelled by the sender" : "expired by the system cron job"}.`
      });
    }

    if (p.estimatedYield > 0 && terminalStates.includes(newState)) {
      let yieldAmountToSender = 0;

      if (newState === "claim_completed") {
        if (p.yieldRecipient === "split") {
          const splitAmount = p.estimatedYield / 2;
          yieldAmountToSender = splitAmount; 
          
          ledger.push({ id: `leg_${Date.now()}_yld1`, accountId: "SYSTEM_YIELD_RESERVE", amount: -p.estimatedYield, type: "debit", description: `Yield minted for: ${p.id}`, timestamp: nowStr });
          ledger.push({ id: `leg_${Date.now()}_yld2`, accountId: p.senderAccountId, amount: splitAmount, type: "credit", description: `50% Yield earned from ${p.id}`, timestamp: nowStr });
          ledger.push({ id: `leg_${Date.now()}_yld3`, accountId: "OUTBOUND_PAYMENT_GATEWAY", amount: splitAmount, type: "credit", description: `50% Yield sent to recipient for ${p.id}`, timestamp: nowStr });
        } else {
          const yieldDestination = p.yieldRecipient === "recipient" ? "OUTBOUND_PAYMENT_GATEWAY" : p.senderAccountId;
          if (yieldDestination === p.senderAccountId) yieldAmountToSender = p.estimatedYield; 
          
          ledger.push({ id: `leg_${Date.now()}_yld1`, accountId: "SYSTEM_YIELD_RESERVE", amount: -p.estimatedYield, type: "debit", description: `Yield minted for: ${p.id}`, timestamp: nowStr });
          ledger.push({ id: `leg_${Date.now()}_yld2`, accountId: yieldDestination, amount: p.estimatedYield, type: "credit", description: `Yield earned from ${p.id}`, timestamp: nowStr });
        }
      } else {
        yieldAmountToSender = p.estimatedYield;
        ledger.push({ id: `leg_${Date.now()}_yld1`, accountId: "SYSTEM_YIELD_RESERVE", amount: -p.estimatedYield, type: "debit", description: `Yield minted for: ${p.id} (Refunded)`, timestamp: nowStr });
        ledger.push({ id: `leg_${Date.now()}_yld2`, accountId: p.senderAccountId, amount: p.estimatedYield, type: "credit", description: `100% Yield recovered from ${p.id}`, timestamp: nowStr });
      }

      if (yieldAmountToSender > 0) {
        const yieldDesc = `Yield Earned (${p.yieldRecipient === 'split' && newState === 'claim_completed' ? '50% Split' : '13% APY'})`;
        
        mockDB.addTransaction({
          accountId: p.senderAccountId,
          type: "deposit",
          amount: yieldAmountToSender,
          status: "completed",
          description: yieldDesc,
          note: yieldDesc, 
          reference: p.id
        });
      }
    }

    payments[index] = p;
    localStorage.setItem(DB_KEY, JSON.stringify(payments));
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));

   try {
      const txs = mockDB.getTransactions();
      const siblings = payments.filter(payment => payment.batchId === p.batchId);

      const totalCount = siblings.length;
      const completedCount = siblings.filter(s => s.status === "claim_completed").length;
      const cancelledCount = siblings.filter(s => s.status === "claim_canceled" || s.status === "claim_expired").length;
      const pendingCount = totalCount - completedCount - cancelledCount;

      let txStatus = "pending";
      if (pendingCount === 0) {
          if (completedCount === totalCount) txStatus = "completed";
          else if (cancelledCount === totalCount) txStatus = "cancelled";
          else txStatus = "partially_completed"; 
      } else {
          if (completedCount > 0) txStatus = "partially_completed"; 
          else txStatus = "pending"; 
      }

      const amountDisbursed = siblings
        .filter(s => s.status === "claim_completed")
        .reduce((sum, s) => sum + s.amount, 0);

      let txChanged = false;
      for (let tx of txs) {
        // 1. Update the SENDER'S Batch Transaction
        if ((tx.type === "payment" || tx.type === "transfer") && tx.reference === p.batchId) {
          tx.status = txStatus;
          tx.amountDisbursed = amountDisbursed;
          tx.completedCount = completedCount; 
          tx.cancelledCount = cancelledCount; 
          tx.totalCount = totalCount;         
          txChanged = true;
        }

        // 🌟 2. NEW: Update the RECIPIENT'S Incoming Transaction
        if (tx.type === "payment" && tx.reference === p.claimId) {
          if (newState === "claim_completed") tx.status = "completed";
          else if (newState === "claim_canceled") tx.status = "cancelled";
          else if (newState === "claim_expired") tx.status = "expired";
          
          tx.trackingState = newState;
          txChanged = true;
        }
      }

      if (txChanged) {
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
      }
    } catch (e) {
      console.error("Failed to cascade claim state to transaction record", e);
    }

    return { success: true, message: `State successfully updated to ${newState}`, payment: p };
  },
  

  create: (payment: Omit<EscrowPayment, "timeline">) => {
    const payments = mockDB.getPayments();
    const ledger = mockDB.getLedger();

    if (payments.some(p => p.idempotencyKey === payment.idempotencyKey)) {
      console.warn("Idempotency key detected. Ignoring duplicate request.");
      return; 
    }

    if (payment.amount <= 0) {
       throw new Error("Invalid payment amount");
    }

    ledger.push({ id: `leg_${Date.now()}_1`, accountId: payment.senderAccountId, amount: -(payment.amount + payment.feeAmount), type: "debit", description: `Transfer to Escrow: ${payment.id}`, timestamp: new Date().toISOString() });
    ledger.push({ id: `leg_${Date.now()}_2`, accountId: "SYSTEM_ESCROW_WALLET", amount: payment.amount, type: "credit", description: `Funds secured: ${payment.id}`, timestamp: new Date().toISOString() });
    ledger.push({ id: `leg_${Date.now()}_3`, accountId: "SYSTEM_FEE_WALLET", amount: payment.feeAmount, type: "credit", description: `Service Fee: ${payment.id}`, timestamp: new Date().toISOString() });

    const fullPayment: EscrowPayment = {
      ...payment,
      status: "claim_created",
      timeline: [{
        state: "claim_created",
        timestamp: new Date().toISOString(),
        metadata: { notes: "Payment initiated and funds locked in escrow." }
      }]
    };

    payments.push(fullPayment);
    localStorage.setItem(DB_KEY, JSON.stringify(payments));
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));

    // 🌟 NOTIFICATION TRIGGER: Escrow secured
    mockDB.addAdminNotification({ type: "info", title: "New Escrow Locked", message: `User ${payment.senderName} secured $${payment.amount.toFixed(2)} for ${payment.recipientEmail}.`});

    try {
      const accounts = JSON.parse(localStorage.getItem("bingtellar_mock_accounts") || "[]");
      const targetAccount = accounts.find((acc: any) => 
        acc.email?.toLowerCase() === payment.recipientEmail.toLowerCase() || 
        acc.name?.toLowerCase() === payment.recipientEmail.toLowerCase() 
      );

      if (targetAccount) {
        mockDB.addTransaction({
          accountId: targetAccount.id,
          type: "payment", 
          amount: payment.amount,
          fiatAmount: payment.amount, 
          fiatCurrency: payment.currency,
          status: "pending", 
          description: `Incoming Payment from ${payment.senderName}`,
          reference: payment.claimId,
          role: "creator" 
        });
      }
    } catch (e) {
      console.error("Failed to route internal P2P claim", e);
    }
  },

  runCronJobs: () => {
    const payments = mockDB.getPayments();
    let updated = false; 
    const todayTime = new Date().getTime();

    payments.forEach(p => {
      const activeStates = ["claim_created", "claim_started", "claim_pending", "claim_processing"];
      
      if (activeStates.includes(p.status) && p.dueDate && p.dueDate.trim() !== "") {
        const dateString = p.dueDate.includes('T') ? p.dueDate : `${p.dueDate}T23:59:59`;
        const dueTime = new Date(dateString).getTime();
        
        if (!isNaN(dueTime) && dueTime < todayTime) {
          mockDB.updateClaimState(p.id, "claim_expired", { notes: "Automated cron job expired the claim." });
          updated = true; 
        }
      }
    });
    
    if (updated) {
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
    }
  },

  linkPastClaimsToNewAccount: (accountId: string, email: string) => {
    const payments = mockDB.getPayments();
    const existingTxs = mockDB.getTransactions();
    let txsAdded = false;

    const orphanedPayments = payments.filter(p => p.recipientEmail.toLowerCase() === email.toLowerCase());

    orphanedPayments.forEach(p => {
      const alreadyLinked = existingTxs.some(tx => tx.accountId === accountId && tx.reference === p.claimId);
      
     if (!alreadyLinked) {
        let mappedStatus = "pending";
        if (p.status === "claim_completed") mappedStatus = "completed";
        if (p.status === "claim_canceled") mappedStatus = "cancelled";
        if (p.status === "claim_expired") mappedStatus = "expired"; // 🌟 FIX: Differentiate expired from cancelled

        mockDB.addTransaction({
          accountId: accountId,
          type: "payment",
          amount: p.amount,
          fiatAmount: p.amount,
          fiatCurrency: p.currency,
          status: mappedStatus,
          description: `Incoming Payment from ${p.senderName}`,
          reference: p.claimId,
          role: "creator"
        });
        txsAdded = true;
      }
    });

    if (txsAdded) {
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
    }
    return orphanedPayments.length;
  },

  // 🌟 ADMIN METRICS MOVED INSIDE mockDB
  getAdminPlatformMetrics: () => {
    const ledger = mockDB.getLedger();
    const payments = mockDB.getPayments();
    
    const feeEntries = ledger.filter(l => l.accountId === "SYSTEM_FEE_WALLET" && l.type === "credit");
    const totalRevenue = feeEntries.reduce((sum, entry) => sum + entry.amount, 0);

    const totalVolume = payments.reduce((sum, p) => sum + p.amount, 0);
    const activeStates = ["claim_created", "claim_started", "claim_processing"];
    const activeEscrows = payments.filter(p => activeStates.includes(p.status));
    const activeEscrowVolume = activeEscrows.reduce((sum, p) => sum + p.amount, 0);
    
    let totalUsers = 0;
    try { 
      totalUsers = JSON.parse(localStorage.getItem("bingtellar_mock_accounts") || "[]").length; 
    } catch (e) { 
      totalUsers = 0; 
    }

    const recentGlobalLedger = [...ledger]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    return {
      revenue: {
        totalRevenue,
        creationFees: feeEntries.filter(e => e.description.includes("Service Fee")).reduce((s, e) => s + e.amount, 0),
        claimFees: feeEntries.filter(e => e.description.includes("Claim Processing Fee")).reduce((s, e) => s + e.amount, 0),
        cancellationPenalties: feeEntries.filter(e => e.description.includes("Cancellation Penalty")).reduce((s, e) => s + e.amount, 0),
      },
      platform: {
        totalVolume,
        activeEscrowVolume,
        activeEscrowsCount: activeEscrows.length,
        totalUsers
      },
      recentGlobalLedger
    };
  }
}; 


// ==========================================
// 🚨 THESE REMAIN SAFELY OUTSIDE mockDB
// ==========================================
export const getGlobalRecipients = (): Recipient[] => {
  try {
    const saved = localStorage.getItem(RECIPIENTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveGlobalRecipient = (recipientData: Partial<Recipient>, id?: string | null): boolean => {
  try {
    let current = getGlobalRecipients();
    
    if (id) {
      current = current.map(r => r.id === id ? { ...r, ...recipientData } as Recipient : r);
    } else {
      const newRecipient = {
        ...recipientData,
        id: Math.random().toString(36).substr(2, 9),
        dateAdded: new Date().toISOString()
      } as Recipient;
      current = [newRecipient, ...current];
    }
    
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event('bingtellar_recipients_updated'));
    return true;
  } catch (error) {
    console.error("Error saving global recipient:", error);
    return false;
  }
};

export const deleteGlobalRecipient = (id: string): boolean => {
  try {
    const current = getGlobalRecipients();
    const updated = current.filter(r => r.id !== id);
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('bingtellar_recipients_updated'));
    return true;
  } catch (error) {
    console.error("Error deleting global recipient:", error);
    return false;
  }
};
import React from "react";
import { FIAT_CURRENCIES } from "../../../utils/constants";
import type { TransactionData as BaseTxData, AccountData } from "../MainDashboard"; 

// ==========================================
// 1. SHARED INTERFACES
// ==========================================
export interface TransactionData extends Omit<BaseTxData, 'type'> {
  type: "deposit" | "withdrawal" | "payment" | "transfer" | "request" | "bulk_payment";
  fiatAmount?: number;
  fiatCurrency?: string;
  exchangeRate?: number;
  network?: string;
  networkFee?: number;
  processingFee?: number;
  reference?: string;
  memo?: string;
  note?: string;
  recipients?: string[];      
  recipientEmail?: string;    
  role?: "creator" | "payer"; 
  status: string;
  amount: number;
  feeAmount?: number | string;
  date: string;
  // 🌟 FIX: Support native DB timestamps that arrive via SSE
  createdAt?: string;
  txHash?: string;
  timeline?: any[];
  
  // 🌟 ADDED: These fields satisfy the strict TS checks in PaymentTransactionModal
  recipientName?: string;
  metadata?: any;
  contractId?: string;
  hash?: string;
  blockchainTxHash?: string;
  claimHash?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionData | null;
  activeAccount?: AccountData | null; 
}

// ==========================================
// 2. DATA PARSER
// ==========================================
export const parseTransactionData = (tx: TransactionData) => {
  const usdcAmount = Number(tx.amount) || 0;
  const hasFiatData = tx.fiatAmount !== undefined && tx.fiatAmount !== null && tx.fiatCurrency !== "USDC" && !!tx.fiatCurrency;
  
  const fiatAmount = hasFiatData ? Number(tx.fiatAmount) : null;
  const fiatCurrency = hasFiatData ? tx.fiatCurrency?.toUpperCase() : "USDC";
  
  const exchangeRate = tx.exchangeRate || (hasFiatData && usdcAmount > 0 ? (fiatAmount! / usdcAmount) : 0);

  // Intelligent Description Sanitizer: Prevent JSON blocks from bleeding into the UI
  let cleanDescription = tx.description || tx.note || "Transaction";
  
  // 🌟 AGGRESSIVE METADATA STRIPPING
  if (cleanDescription.startsWith('{') && cleanDescription.includes('}')) {
      try {
          const parsed = JSON.parse(cleanDescription); 
          if (parsed.userNote && typeof parsed.userNote === 'string') {
              cleanDescription = parsed.userNote;
          } else {
              if (tx.type === 'deposit') cleanDescription = "Deposit";
              else if (tx.type === 'withdrawal') cleanDescription = "Withdrawal";
              else cleanDescription = "Transaction";
          }
      } catch (e) {
          // Not valid JSON, leave it alone
      }
  }

  return {
    usdcAmount,
    fiatAmount,
    fiatCurrency: fiatCurrency || "USDC",
    isFiat: hasFiatData,
    exchangeRate,
    reference: tx.reference || String(tx.id).toUpperCase(),
    cleanDescription 
  };
};

// ==========================================
// 3. SHARED UI COMPONENTS
// ==========================================
export const CurrencyIcon = ({ currency }: { currency: string }) => {
  // @ts-ignore - Ignoring just in case your constants typing doesn't expose 'code' explicitly
  const currencyData = FIAT_CURRENCIES.find(c => c.code === currency);
  const flagUrl = currencyData?.flagUrl || "https://hatscripts.github.io/circle-flags/flags/xx.svg"; 

  return (
    <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full border-[2px] border-white z-20 shadow-sm overflow-hidden bg-[#F5F5F5]">
      <img src={flagUrl} alt={currency} className="w-full h-full object-cover" />
    </div>
  );
};

export const DetailRow = ({ label, value, valueNode }: { label: string, value?: string | number, valueNode?: React.ReactNode }) => (
  <div className="flex justify-between items-start py-1.5">
    <span className="text-[12px] text-[#757575] shrink-0 mr-4 mt-[1px]">{label}</span>
    {valueNode ? valueNode : <span className="text-[13px] font-medium text-[#1A1A1A] text-right break-all max-w-[200px]">{value}</span>}
  </div>
);

// ==========================================
// 4. PDF GENERATION ENGINE (World-Class Receipt UI)
// ==========================================
export const generateReceiptPDF = (jsPDFClass: any, tx: TransactionData, typeLabel: string, bulkItems?: any[]) => {
  if (!jsPDFClass) {
    console.error("PDF generator class not provided.");
    return;
  }

  const doc = new jsPDFClass({ orientation: "portrait", unit: "mm", format: "a4" });
  const { usdcAmount, fiatAmount, fiatCurrency, isFiat, reference } = parseTransactionData(tx);
  
  const txDate = tx.date || tx.createdAt || new Date().toISOString();
  const formattedDate = new Date(txDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const displayTxId = isFiat && reference ? reference : tx.id.toUpperCase();
  const amountDisplay = isFiat 
    ? `${fiatAmount!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}` 
    : `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

  const isFailed = ['failed', 'cancelled', 'rejected'].includes(tx.status?.toLowerCase());
  const isPending = ['pending', 'partially_paid'].includes(tx.status?.toLowerCase());
  const isProcessing = tx.status?.toLowerCase() === 'processing'; // Processing trap

  // --- 1. SETUP COLORS & STYLES ---
  const bgColor = { r: 244, g: 245, b: 247 }; // Light grey background
  const cardColor = { r: 255, g: 255, b: 255 };
  const textDark = { r: 26, g: 26, b: 26 };
  const textMuted = { r: 117, g: 117, b: 117 };
  
  let accentColor = { r: 52, g: 168, b: 83 }; // Green success
  if (isFailed) accentColor = { r: 220, g: 38, b: 38 }; // Red failed
  if (isPending || isProcessing) accentColor = { r: 245, g: 158, b: 11 }; // Force Amber color for processing states

  // --- 2. DRAW BACKGROUND & CARD ---
  // Fill entire A4 page with subtle background
  doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
  doc.rect(0, 0, 210, 297, "F");

  // 🌟 FIX: Significantly increased base card height to fit the footer inside
  let cardHeight = 220; 
  if (tx.networkFee) cardHeight += 12;
  if (isFiat && tx.processingFee) cardHeight += 12;
  if (tx.note) cardHeight += 12;
  if (tx.memo) cardHeight += 12;

  // Draw White Receipt Card
  doc.setFillColor(cardColor.r, cardColor.g, cardColor.b);
  doc.roundedRect(20, 30, 170, cardHeight, 6, 6, "F"); // x, y, w, h, rx, ry

  // --- 3. DRAW TICKET STUB CUTOUTS & DASHED LINE ---
  const cutoutY = 115; // Y-coordinate for the perforated split
  const cutoutRadius = 6;

  // Draw circles using the background color over the edges of the white card
  doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
  doc.circle(20, cutoutY, cutoutRadius, "F"); // Left cutout
  doc.circle(190, cutoutY, cutoutRadius, "F"); // Right cutout

  // Draw dashed divider line
  doc.setDrawColor(226, 232, 240); // Light gray line
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(20 + cutoutRadius + 2, cutoutY, 190 - cutoutRadius - 2, cutoutY);
  doc.setLineDashPattern([], 0); // Reset dash

  // --- 4. TOP SECTION: HEADER & SUMMARY ---
  
  // Brand Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(textDark.r, textDark.g, textDark.b);
  doc.text("BLINKCASH", 105, 52, { align: "center" });

  // Receipt Type
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
  doc.text(`Official Receipt • ${typeLabel}`, 105, 60, { align: "center" });

  // Big Amount Display
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(textDark.r, textDark.g, textDark.b);
  doc.text(amountDisplay, 105, 82, { align: "center" });

  // Transaction Status
  // accurate status mapping to prevent "ghost" complete receipts
  let statusText = "COMPLETED";
  if (isFailed) statusText = "FAILED";
  else if (isProcessing) statusText = "PROCESSING";
  else if (isPending) statusText = tx.type === 'payment' ? "IN ESCROW" : "PENDING";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(accentColor.r, accentColor.g, accentColor.b);
  doc.text(statusText, 105, 92, { align: "center", tracking: 1.5 });

  // --- 5. BOTTOM SECTION: TRANSACTION DETAILS ---
  let startY = cutoutY + 18;

  const addRow = (label: string, value: string) => {
    if (!value) return; 
    
    // Label
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
    doc.setFontSize(10);
    doc.text(label, 30, startY);
    
    // Value
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textDark.r, textDark.g, textDark.b);
    const safeValue = value.length > 40 ? value.substring(0, 37) + '...' : value;
    doc.text(safeValue, 180, startY, { align: "right" });
    
    startY += 12;
  };

  // Determine From/To Routing
  let displayFrom = "Account Balance";
  let displayTo = "External Entity";

  if (tx.type === "deposit") {
    displayFrom = isFiat ? "Bank Deposit" : "External Wallet";
    displayTo = isFiat ? "USDC Account Balance" : "USDC Wallet";
  } else if (tx.type === "withdrawal") {
    let recipientName = "Recipient";
    if (tx.note?.startsWith("{")) {
       try { const parsed = JSON.parse(tx.note); if (parsed.accountName) recipientName = parsed.accountName; } catch (e) {}
    } else if (tx.description?.includes("-")) {
       recipientName = tx.description.split("-")[1]?.trim() || "Recipient";
    }
    displayTo = tx.description?.includes("MoMo") ? `Mobile money - ${recipientName}` : `Bank account - ${recipientName}`;
  } else {
    const isReceived = tx.description?.toLowerCase().includes("received") || tx.description?.toLowerCase().includes("from");
    let recipientText = "External Entity";
    
    if (Array.isArray(tx.recipients) && tx.recipients.length > 0) recipientText = tx.recipients.join(", ");
    else if (tx.recipientEmail && tx.recipientEmail.trim() !== "") recipientText = tx.recipientEmail;
    else if (tx.description) recipientText = tx.description.replace(/^(Payment to|Transfer to|Sent to|Paid to)\s+/i, "").trim();

    displayFrom = isReceived ? recipientText : "Account Balance";
    displayTo = isReceived ? "Account Balance" : recipientText;
  }

  // Determine Payment Method dynamically
  let paymentMethodDisplay = "Blink Ledger";
  if (tx.type === "deposit") {
    paymentMethodDisplay = isFiat ? "Bank Transfer" : "Stablecoins";
  } else if (tx.type === "withdrawal") {
    paymentMethodDisplay = tx.description?.includes("MoMo") ? "Mobile Money" : isFiat ? "Bank Transfer" : "USDC Wallet";
  }

  // Populate Details
  addRow("Date", formattedDate);
  addRow("Transaction ID", displayTxId);
  addRow("Payment Method", paymentMethodDisplay);
  addRow("From", displayFrom);
  addRow("To", displayTo);
  if (tx.networkFee) addRow("Network Fee", `${tx.networkFee} USDC`);
  if (isFiat && tx.processingFee) addRow("Processing Fee", `${tx.processingFee} ${fiatCurrency}`);

  // Notes & Memos
  let finalNote = tx.note;
  if (finalNote && finalNote.startsWith('{')) {
      try { const parsed = JSON.parse(finalNote); finalNote = parsed.userNote || null; } catch (e) {}
  }
  if (finalNote) addRow("Note", finalNote);
  if (tx.memo) addRow("Memo", tx.memo);

  // --- 6. FOOTER ---
  // Adjusted Y-position since it is only one line now
  const footerTop = 30 + cardHeight - 25; 
  
  // Subtle elegant separator line above the footer
  doc.setDrawColor(240, 240, 240);
  doc.setLineWidth(0.5);
  doc.line(30, footerTop, 180, footerTop);

  // Slightly smaller font to ensure all text fits perfectly on one line
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160); // Soft grey
  doc.setFont("helvetica", "normal");
  
  // Combined into a single line with bullet points
  const footerText = "Generated securely by BlinkCash (A Bingtellar Co)  •  © 2026 Bingtellar Inc. All rights reserved.";
  doc.text(footerText, 105, footerTop + 10, { align: "center" });

  // --- 7. PAGE 2+: RECIPIENT MANIFEST (For Bulk Payments) ---
  if (tx.type === 'bulk_payment' || (bulkItems && bulkItems.length > 1)) {
    const itemsToList = bulkItems && bulkItems.length > 0 ? bulkItems : (tx.recipients || []).map(email => ({ email, amount: 'N/A', status: 'Unknown' }));
    
    doc.addPage();
    let yManifest = 20;

    // Header for Manifest
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(textDark.r, textDark.g, textDark.b);
    doc.text("Bulk Payment Manifest", 105, yManifest, { align: "center" });
    
    yManifest += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
    doc.text(`Reference: ${displayTxId}  •  Total Recipients: ${itemsToList.length}`, 105, yManifest, { align: "center" });

    yManifest += 15;

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
    doc.setFontSize(10);
    doc.text("Recipient", 20, yManifest);
    doc.text("Destination", 80, yManifest);
    doc.text("Status", 145, yManifest);
    doc.text("Amount", 190, yManifest, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(20, yManifest + 3, 190, yManifest + 3);
    yManifest += 12;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(textDark.r, textDark.g, textDark.b);

    itemsToList.forEach((item: any) => {
      // Auto-paginate if we reach the bottom of the page
      if (yManifest > 270) {
        doc.addPage();
        yManifest = 20;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
        doc.text("Recipient", 20, yManifest);
        doc.text("Destination", 80, yManifest);
        doc.text("Status", 145, yManifest);
        doc.text("Amount", 190, yManifest, { align: "right" });
        doc.line(20, yManifest + 3, 190, yManifest + 3);
        yManifest += 12;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textDark.r, textDark.g, textDark.b);
      }

      const name = item.name || item.email || item;
      const destination = typeof item === 'string' ? item : (item.email || "Unknown");
      const itemStatus = item.status ? (item.status.charAt(0).toUpperCase() + item.status.slice(1).replace(/_/g, ' ')) : "N/A";
      
      let amountStr = "N/A";
      if (item.amount !== undefined) {
         const amtNum = parseFloat(item.amount);
         amountStr = !isNaN(amtNum) ? `${amtNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC` : item.amount;
      }

      const safeName = name.length > 25 ? name.substring(0, 22) + '...' : name;
      const safeDest = destination.length > 30 ? destination.substring(0, 27) + '...' : destination;

      doc.text(safeName, 20, yManifest);
      doc.text(safeDest, 80, yManifest);
      
      // Color-code the status
      if (itemStatus.toLowerCase().includes('completed') || itemStatus.toLowerCase().includes('claimed')) {
          doc.setTextColor(52, 168, 83); // Green
      } else if (itemStatus.toLowerCase().includes('failed') || itemStatus.toLowerCase().includes('cancel')) {
          doc.setTextColor(220, 38, 38); // Red
      } else {
          doc.setTextColor(245, 158, 11); // Amber
      }
      doc.text(itemStatus, 145, yManifest);
      
      // Reset text color for amount
      doc.setTextColor(textDark.r, textDark.g, textDark.b);
      doc.text(amountStr, 190, yManifest, { align: "right" });

      yManifest += 10;
    });
    
    // Final Footer for Manifest
    yManifest += 10;
    if (yManifest > 280) {
      doc.addPage();
      yManifest = 20;
    }
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text("Generated securely by BlinkCash (A Bingtellar Co)  •  © 2026 Bingtellar Inc. All rights reserved.", 105, yManifest, { align: "center" });
  }

  doc.save(`Bingtellar_Receipt_${displayTxId}.pdf`);
};
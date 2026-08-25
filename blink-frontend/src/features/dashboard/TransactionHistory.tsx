import { useState, useMemo, useEffect } from "react";
import { 
  Search, Filter, ChevronDown, MoreHorizontal, Loader2, Download, ArrowDownLeft, ArrowUpRight 
} from "lucide-react";
import { PayRequestFlow } from "./PayRequestFlow"; 

// IMPORTED FROM YOUR NEW TRANSACTION MODALS FOLDER
import { TransactionData, parseTransactionData } from "./TransactionModals/TransactionUtils";
import { DepositTransactionModal } from "./TransactionModals/DepositTransactionModal";
import { WithdrawalTransactionModal } from "./TransactionModals/WithdrawalTransactionModal";
import { PaymentTransactionModal } from "./TransactionModals/PaymentTransactionModal";
import { RequestTransactionModal } from "./TransactionModals/RequestTransactionModal";
import { ReceiveClaimModal } from "./TransactionModals/ReceiveClaimModal"; 

// GLOBAL SECURE API & STORE
import { useStore } from "../../store/useStore"; 
import { api } from "../../lib/api";
import { useTransactionStream } from "../../hooks/useTransactionStream";

interface TransactionHistoryProps {
  accountId?: string;
  onOpenDeposit?: () => void; 
  onRepeatTransaction?: (tx: any) => void; 
  isFetching?: boolean;
}

const MobileSkeleton = () => (
  <div className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] animate-pulse">
    <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#F3F4F6] shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="h-3.5 bg-[#F3F4F6] rounded w-32" />
        <div className="h-2.5 bg-[#F3F4F6] rounded w-20" />
      </div>
    </div>
    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
      <div className="h-4 bg-[#F3F4F6] rounded w-24" />
      <div className="h-2.5 bg-[#F3F4F6] rounded w-16" />
    </div>
  </div>
);

const WebSkeletonRow = () => (
  <div className="grid grid-cols-[0.8fr_1fr_0.9fr_1.8fr_1.5fr_1.4fr_110px] gap-4 py-4 border-b border-[#F5F5F5] items-center px-4 animate-pulse">
    {/* 🌟 FIX 1: Added min-w-0 and w-full max-w to skeleton elements so they squish smoothly */}
    <div className="min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[64px]" /></div>
    <div className="min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[80px]" /></div>
    <div className="min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[96px]" /></div>
    <div className="min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[128px]" /></div>
    <div className="flex justify-end pr-4 min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[80px]" /></div>
    <div className="flex justify-end min-w-0"><div className="h-3.5 bg-[#F3F4F6] rounded w-full max-w-[96px]" /></div>
    <div className="flex items-center justify-end gap-3 min-w-0">
      <div className="h-6 w-16 bg-[#F3F4F6] rounded-md shrink-0" />
      <div className="h-4 w-4 bg-[#F3F4F6] rounded-full shrink-0" />
    </div>
  </div>
);

// =========================================================================
// 🌟 THE UNIVERSAL STATE TAXONOMY (Guarantees History matches Dashboard perfectly)
// =========================================================================
const getMacroState = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (["claim_completed", "completed", "successful", "claimed", "paid", "settled"].includes(s)) return 'COMPLETED';
    if (["failed", "rejected", "expired", "cancelled", "claim_canceled"].includes(s)) return 'FAILED';
    if (["pending", "processing", "in_escrow", "claiming", "active", "ready", "deploying"].includes(s)) return 'IN_PROGRESS';
    return 'OTHER';
};

export const TransactionHistory = ({ accountId, onOpenDeposit, onRepeatTransaction, isFetching = false }: TransactionHistoryProps) => {
  
  // Guarantees real-time UI updates even on isolated routes
  useTransactionStream();

  // ZUSTAND: Global State
  const activeAccount = useStore((state) => state.activeAccount) as any;
  // Source of truth comes from MainDashboard's global sync
  const globalTransactions = useStore((state) => state.transactions) || [];
  // 🌟 FINAL ARMOR: Pull the master REST sync lock
  const isInitialSyncComplete = useStore((state: any) => state.isInitialSyncComplete);

  const [mobileFilterType, setMobileFilterType] = useState<"all" | "deposit" | "withdrawal" | "payment" | "request">("all");
  
  // 🌟 FIX: Updated Tab Names to match the Universal Taxonomy
  const [webTabFilter, setWebTabFilter] = useState<"All" | "Completed" | "In Progress" | "Paused" | "Cancelled">("All");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [dateRange, setDateRange] = useState<"all" | "today" | "7days" | "30days">("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("All");
  
  const [visibleCount, setVisibleCount] = useState(15);
  const [isExporting, setIsExporting] = useState(false);

  // Background context databases (Metadata that enriches the global transactions)
  const [escrowsDb, setEscrowsDb] = useState<any[]>([]);
  const [reqsDb, setReqsDb] = useState<any[]>([]); 
  const [isContextFetching, setIsContextFetching] = useState(true);

 // PERFECTED DB STATUS MAPPER (Handles the micro-statuses for badges)
  const mapDbStatusToUi = (dbStatus: string, trackingState?: string, txType?: string) => {
    const s = String(dbStatus || "").toLowerCase();
    const t = String(trackingState || "").toLowerCase();

    if (["claim_completed", "claimed", "completed", "released", "paid", "successful", "settled"].includes(s)) return "completed";
    if (["failed", "rejected", "expired"].includes(s)) return "failed";
    if (["claim_canceled", "cancelled"].includes(s)) return "cancelled"; 

    if (txType === 'payment' || txType === 'incoming_escrow' || txType === 'transfer' || txType === 'bulk_payment') {
        if (s === 'claiming' || t === 'claim_processing' || t === 'claim_started') return 'claiming';
        if (s === 'in_escrow' || s === 'active' || s === 'ready') return 'in_escrow';
        if (s === 'deploying' || s === 'pending' || s === 'processing') return 'processing';
    }

    if (s === "processing") return "processing"; 
    return "pending"; 
  };


  // ENTERPRISE FIX: Secure API calls via global Axios interceptor
  useEffect(() => {
  let isMounted = true;

  const fetchContextData = async () => {
    try {
      const [escrowsRes, reqsRes] = await Promise.all([
        api.get('/escrows'),
        api.get('/requests')
      ]);

      let combinedEscrows = Array.isArray(escrowsRes.data) ? escrowsRes.data : [];

      const bulkTxs = globalTransactions.filter((tx: any) => tx.type === 'bulk_payment');
      
      if (bulkTxs.length > 0) {
         const batchPromises = bulkTxs.map((tx: any) => {
            const bId = tx.batchId || tx.reference;
            return api.get(`/escrows/batch/${bId}`).catch(() => null);
         });
         
         const batchResults = await Promise.all(batchPromises);
         batchResults.forEach(res => {
            if (res && res.data && Array.isArray(res.data)) {
                combinedEscrows = [...combinedEscrows, ...res.data];
            }
         });
      }
    
      if (isMounted) {
        setEscrowsDb(combinedEscrows);
        setReqsDb(reqsRes.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch transaction context:", error);
    } finally {
      if (isMounted) setIsContextFetching(false);
    }
  };

  fetchContextData();
  const interval = setInterval(fetchContextData, 60000); 

  // 🌟 FIXED: Listen to the new unified event bus
  window.addEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);

  return () => {
    isMounted = false;
    clearInterval(interval);
    window.removeEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);
  };
  }, []);


  

  // SMART MERGE ENGINE: Isolates Sub-Account logic & stitches Escrow context
  const normalizedTransactions = useMemo(() => {
    const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
    
    const scopedTxs = globalTransactions.filter((tx: any) => {
      if (isMasterWallet) return !tx.subAccountId || tx.subAccountId === null || String(tx.subAccountId) === "null";
      return String(tx.subAccountId) === String(activeAccount?.id);
    });

    // 🌟 THE ULTIMATE IDEMPOTENCY & DATA GUARD
    const uniqueMap = new Map();
    scopedTxs.forEach((tx: any) => {
      const key = String(tx.reference || tx.id);
      
      if (key && key !== "undefined" && key !== "null") {
         if (uniqueMap.has(key) && !tx.id) {
             return; // Protects the rich Database object from the sparse WebSocket object
         }
         uniqueMap.set(key, tx);
      }
    });
    const uniqueTxs = Array.from(uniqueMap.values());

    return uniqueTxs.map((tx: any) => {
      const cleanReference = tx.reference ? String(tx.reference).replace("_incoming", "") : String(tx.id);
      const currentType = tx.type as string;
      let finalDescription = tx.description || tx.title || "Transaction";
      let enrichedTx = { ...tx };

      // === 🌟 THE AGGREGATE ENGINE FOR BULK PAYMENTS ===
      if (currentType === 'bulk_payment') {
          const bulkChildren = escrowsDb.filter((e: any) => 
             e.batchId === cleanReference || e.reference === cleanReference || e.claimId === cleanReference
          );

          if (bulkChildren.length > 0) {
              const total = bulkChildren.length;
              
              const healedChildren = bulkChildren.map(c => {
                  let parsedTimeline: any[] = [];
                  try { 
                      const raw = typeof c.timeline === 'string' ? JSON.parse(c.timeline) : (c.timeline || []); 
                      parsedTimeline = Array.isArray(raw) ? raw : []; 
                  } catch(e) {}
                  
                  const hasFailedEvent = parsedTimeline.some((evt: any) => {
                      const s = String(evt?.state || '').toLowerCase();
                      return s.includes('fail') || s.includes('expire');
                  });
                  const hasCancelledEvent = parsedTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
                  
                  const rawStatus = String(c.status || '').toLowerCase();
                  let healedStatus = rawStatus || 'pending';

                  if (hasCancelledEvent && !['cancelled', 'claim_canceled'].includes(healedStatus)) {
                      healedStatus = 'cancelled';
                  } else if (hasFailedEvent && healedStatus !== 'failed') {
                      healedStatus = 'failed';
                  }

                  return { 
                      ...c, 
                      status: healedStatus,
                      trackingState: String(c.trackingState || '').toLowerCase()
                  };
              });

              // Bulletproof status mapping ensures no string state ever falls through the cracks
              const completed = healedChildren.filter(c => ['completed', 'claimed', 'claim_completed', 'successful', 'settled'].includes(c.status)).length;
              const cancelled = healedChildren.filter(c => ['cancelled', 'claim_canceled', 'claim_cancelled'].includes(c.status)).length;
              const failed = healedChildren.filter(c => ['failed', 'rejected', 'expired'].includes(c.status)).length;
              const claiming = healedChildren.filter(c => ['claim_processing', 'claim_started'].includes(c.trackingState)).length;
              const pending = healedChildren.filter(c => ['pending', 'processing', 'deploying', 'in_escrow', 'active', 'ready'].includes(c.status)).length;

              const totalTerminal = completed + cancelled + failed;
              
              // UX ENGINE: Attach rich container metrics for the dynamic badge renderer
              (enrichedTx as any).batchMetrics = {
                  completed, cancelled, failed, total, terminal: totalTerminal
              };

              if (pending > 0) {
                  enrichedTx.status = 'processing';
              } else if (cancelled === total) {
                  enrichedTx.status = 'cancelled'; 
              } else if (failed + cancelled === total) {
                  enrichedTx.status = 'failed'; 
              } else if (totalTerminal === total) {
                  enrichedTx.status = 'completed'; 
              } else if (claiming > 0 || completed > 0) {
                  enrichedTx.status = 'claiming'; 
              } else {
                  enrichedTx.status = 'in_escrow'; 
              }
          }
      } 
      // === 🌟 SINGLE ESCROW MAPPING ===
      else {
          const relatedEscrow = escrowsDb.find((e: any) => String(e.id) === cleanReference || String(e.claimId) === cleanReference); 
          if (relatedEscrow) {
              if (finalDescription.includes("Blink Escrow:")) {
                finalDescription = `Payment to ${relatedEscrow.recipientEmail}`;
              }

              let parsedTimeline: any[] = [];
              try { 
                  const raw = typeof relatedEscrow.timeline === 'string' ? JSON.parse(relatedEscrow.timeline) : (relatedEscrow.timeline || []); 
                  parsedTimeline = Array.isArray(raw) ? raw : []; 
              } catch(e) {}
              
              const hasFailedEvent = parsedTimeline.some((evt: any) => {
                  const s = String(evt?.state || '').toLowerCase();
                  return s.includes('fail') || s.includes('expire');
              });
              const hasCancelledEvent = parsedTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
              
              const rawStatus = String(relatedEscrow.status || '').toLowerCase();
              let healedStatus = rawStatus || 'pending';

              if (hasCancelledEvent && !['cancelled', 'claim_canceled'].includes(healedStatus)) {
                  healedStatus = 'cancelled';
              } else if (hasFailedEvent && healedStatus !== 'failed') {
                  healedStatus = 'failed';
              }

              enrichedTx = {
                ...enrichedTx,
                recipientEmail: relatedEscrow.recipientEmail || enrichedTx.recipientEmail,
                recipientName: relatedEscrow.recipientEmail?.split("@")[0] || enrichedTx.recipientName,
                description: finalDescription,
                trackingState: String(relatedEscrow.trackingState || '').toLowerCase() || healedStatus,
                status: healedStatus, 
                timeline: parsedTimeline,
                claimDate: relatedEscrow.claimDate,
                expiryDate: relatedEscrow.expiryDate
              };
          }
      }

      let inferredEmail = enrichedTx.recipientEmail || enrichedTx.recipient_email || "";
      if (!inferredEmail && (finalDescription.includes("@") || tx.note?.includes("@"))) {
        const match = (finalDescription + " " + (tx.note || "")).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (match) inferredEmail = match[0];
      }

      if (!enrichedTx.recipientEmail) {
        enrichedTx.recipientEmail = inferredEmail;
        enrichedTx.recipientName = inferredEmail ? inferredEmail.split("@")[0] : undefined;
        enrichedTx.description = finalDescription;
      }

      const descLower = enrichedTx.description?.toLowerCase() || "";
      
      return {
        ...enrichedTx,
        id: String(enrichedTx.id),
        accountId: String(enrichedTx.userId || activeAccount?.id || "1"),
        type: (currentType === "request" || descLower.includes("request")) ? "request" : currentType,
        amount: parseFloat(enrichedTx.amount || "0"),
        date: enrichedTx.createdAt || enrichedTx.date,
        status: mapDbStatusToUi(enrichedTx.status, enrichedTx.trackingState, currentType),
        memo: enrichedTx.note || "",
        reference: enrichedTx.reference || enrichedTx.claimId || String(enrichedTx.id),
        batchId: (enrichedTx as any).batchId || enrichedTx.reference, 
        fiatCurrency: enrichedTx.fiatCurrency || "USDC",
      } as TransactionData;

    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [globalTransactions, escrowsDb, activeAccount?.id, activeAccount?.muxedId]);

  // 🌟 THE FINAL MILE: AGENTIC ESCROW EXECUTION INTERCEPTOR
  useEffect(() => {
    const handleAgenticEscrow = (e: any) => {
      // FIX: Removed the unused 'action' variable to keep the linter happy
      const { targetId } = e.detail; 
      
      // Look through our fully normalized list to find the matching transaction
      const targetTx = normalizedTransactions.find((tx: any) => 
        tx.id === targetId || tx.reference === targetId || tx.claimId === targetId || tx.batchId === targetId
      );

      if (targetTx) {
        // Pop the specific modal
        setSelectedTxId(targetTx.id);
      } else {
        console.warn(`[Radar Copilot] Teleport successful, but transaction ${targetId} not found in local state.`);
      }
    };

    window.addEventListener('agentic_escrow_action', handleAgenticEscrow);
    return () => window.removeEventListener('agentic_escrow_action', handleAgenticEscrow);
  }, [normalizedTransactions]);

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  
  const selectedTx = useMemo(() => {
    if (!selectedTxId) return null;
    return normalizedTransactions.find(tx => tx.id === selectedTxId) || null;
  }, [normalizedTransactions, selectedTxId]);

  // 🌟 PERFECTED: Safely lock the history table until Zustand is fully hydrated
  const loadingState = isFetching || isContextFetching || !isInitialSyncComplete;

  const uniqueCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    currencies.add("USDC"); 
    normalizedTransactions.forEach(tx => {
      const { fiatCurrency, isFiat } = parseTransactionData(tx);
      if (isFiat) currencies.add(fiatCurrency);
    });
    return Array.from(currencies);
  }, [normalizedTransactions]);

  const baseFiltered = useMemo(() => {
    let filtered = normalizedTransactions;
    if (accountId) {
      filtered = filtered.filter(tx => tx.accountId === accountId);
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.description?.toLowerCase().includes(lowerQuery) ||
        tx.amount?.toString().includes(lowerQuery) ||
        tx.id?.toLowerCase().includes(lowerQuery) ||
        tx.recipientEmail?.toLowerCase().includes(lowerQuery) ||
        tx.recipients?.some((r: any) => r.toLowerCase().includes(lowerQuery)) ||
        tx.reference?.toLowerCase().includes(lowerQuery) ||
        tx.network?.toLowerCase().includes(lowerQuery) ||
        tx.fiatCurrency?.toLowerCase().includes(lowerQuery) ||
        tx.status?.toLowerCase().includes(lowerQuery)
      );
    }
    return filtered;
  }, [normalizedTransactions, accountId, searchQuery]);

  // =========================================================================
  // 🌟 FIX: UNIVERSAL WEB COUNTERS (Synced to Dashboard Macro States)
  // =========================================================================
  const webCounts = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let paused = 0;
    let cancelled = 0;

    baseFiltered.forEach(tx => {
      const macro = getMacroState(tx.status);
      if (macro === 'COMPLETED') completed++;
      else if (macro === 'IN_PROGRESS') inProgress++;
      else if (macro === 'FAILED') cancelled++;
    });

    return { completed, inProgress, paused, cancelled };
  }, [baseFiltered]);

  const displayedTransactions = useMemo(() => {
    let result = baseFiltered;

    if (mobileFilterType !== "all") {
      result = result.filter(tx => tx.type === mobileFilterType);
    }

    // 🌟 FIX: UNIVERSAL FILTERING (Synced to Dashboard Macro States)
    if (webTabFilter !== "All") {
      if (webTabFilter === "Completed") result = result.filter(tx => getMacroState(tx.status) === 'COMPLETED');
      if (webTabFilter === "In Progress") result = result.filter(tx => getMacroState(tx.status) === 'IN_PROGRESS');
      if (webTabFilter === "Paused") result = []; 
      if (webTabFilter === "Cancelled") result = result.filter(tx => getMacroState(tx.status) === 'FAILED');
    }

    if (dateRange !== "all") {
      const now = new Date().getTime();
      const days = dateRange === "today" ? 1 : dateRange === "7days" ? 7 : 30;
      const cutoff = now - (days * 24 * 60 * 60 * 1000);
      result = result.filter(tx => new Date(tx.date).getTime() >= cutoff);
    }

    if (currencyFilter !== "All") {
      result = result.filter(tx => parseTransactionData(tx).fiatCurrency === currencyFilter);
    }

    return result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [baseFiltered, mobileFilterType, webTabFilter, dateRange, currencyFilter, sortOrder]);


  const isEmpty = displayedTransactions.length === 0;
  const paginatedTransactions = displayedTransactions.slice(0, visibleCount);

  // PDF Export Engine
  const handleExportStatement = async () => {
    if (displayedTransactions.length === 0) return;
    setIsExporting(true);

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(26, 26, 26);
      doc.text("BINGTELLAR", 105, 25, { align: "center" });
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(117, 117, 117);
      doc.text("Transaction Statement", 105, 33, { align: "center" });

      doc.setDrawColor(234, 234, 234);
      doc.line(20, 45, 190, 45);

      doc.setFontSize(10);
      doc.setTextColor(26, 26, 26);
      doc.text(`Account: ${activeAccount?.name || 'Main Wallet'}`, 20, 55);
      doc.text(`Total Records: ${displayedTransactions.length}`, 20, 61);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 190, 55, { align: "right" });

      let y = 75;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(117, 117, 117);
      doc.text("Date", 20, y);
      doc.text("Type", 55, y);
      doc.text("Details", 85, y);
      doc.text("Amount", 160, y, { align: "right" });
      doc.text("Status", 190, y, { align: "right" });

      doc.line(20, y + 3, 190, y + 3);
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(26, 26, 26);

      displayedTransactions.forEach((tx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(117, 117, 117);
          doc.text("Date", 20, y);
          doc.text("Type", 55, y);
          doc.text("Details", 85, y);
          doc.text("Amount", 160, y, { align: "right" });
          doc.text("Status", 190, y, { align: "right" });
          doc.line(20, y + 3, 190, y + 3);
          y += 12;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(26, 26, 26);
        }

        const { usdcAmount, fiatAmount, fiatCurrency, isFiat } = parseTransactionData(tx);
        const dateStr = new Date(tx.date).toLocaleDateString('en-GB');
        const typeStr = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
        const amountStr = isFiat ? `${fiatAmount!.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}` : `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
        
        const safeDesc = tx.description ? tx.description.replace(/[\n\r]+/g, ' ') : 'N/A';
        const detailsStr = safeDesc.length > 25 ? safeDesc.substring(0, 22) + '...' : safeDesc;

        doc.text(dateStr, 20, y);
        doc.text(typeStr, 55, y);
        doc.text(detailsStr, 85, y);
        doc.text(amountStr, 160, y, { align: "right" });
        doc.text(tx.status, 190, y, { align: "right" });

        y += 10;
      });

      doc.save(`Bingtellar_Statement_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error("Failed to generate statement PDF", err);
    } finally {
      setIsExporting(false);
    }
  };

// PERFECTED COLOR GENERATOR
  const getStatusColor = (tx: any, isReq?: boolean) => {
    const status = tx.status;
    
    if (tx.type === 'bulk_payment') {
        const metrics = tx.batchMetrics;
        if (metrics && metrics.total > 0) {
            // 🌟 100% Terminal Failure Guards
            if (metrics.cancelled === metrics.total) return 'text-[#757575]';
            if (metrics.failed + metrics.cancelled === metrics.total) return 'text-red-500';

            const isFinished = metrics.terminal === metrics.total;
            const isPerfect = metrics.completed === metrics.total;
            
            // "Partial Success" Rule
            if (isFinished) return isPerfect ? 'text-[#3BA66A]' : 'text-[#2775CA]';
            return 'text-[#D97706]';
        }
    }

    if (status === 'completed') return 'text-[#3BA66A]';
    if (status === 'in_escrow' || status === 'processing') return 'text-[#2775CA]'; 
    if (status === 'claiming') return 'text-[#D97706]';
    if (['pending', 'partially_paid', 'partially_completed'].includes(status)) return isReq ? 'text-[#1A1A1A]' : 'text-[#D97706]';
    if (['failed', 'cancelled', 'rejected'].includes(status)) return 'text-red-500';
    return 'text-[#757575]';
  };

  // 🌟 THE INTELLIGENT BATCH BADGE GENERATOR
  const getStatusBadge = (tx: any, isReq?: boolean) => {
    const status = tx.status;

    if (tx.type === 'bulk_payment') {
        const metrics = tx.batchMetrics;
        if (metrics && metrics.total > 0) {
            // 🌟 100% Terminal Failure Guards
            if (metrics.cancelled === metrics.total) {
                return <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap">Cancelled</span>;
            }
            if (metrics.failed + metrics.cancelled === metrics.total) {
                return <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap">Batch Failed</span>;
            }

            const isFinished = metrics.terminal === metrics.total;
            const isPerfect = metrics.completed === metrics.total;

            if (isFinished) {
                if (isPerfect) {
                    return <span className="bg-[#E5F7ED] text-[#3BA66A] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap">Completed {metrics.completed}/{metrics.total}</span>;
                } else {
                    return <span className="bg-[#E8F0FE] text-[#2775CA] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap" title={`${metrics.cancelled} Cancelled, ${metrics.failed} Failed`}>Processed {metrics.terminal}/{metrics.total}</span>;
                }
            } else {
                return (
                    <span className="bg-[#FFF9F2] text-[#D97706] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <Loader2 size={10} className="animate-spin shrink-0" /> {metrics.terminal}/{metrics.total}
                    </span>
                );
            }
        }
        return <span className="bg-[#E8F0FE] text-[#2775CA] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Processing</span>;
    }

    // Standard Escrow Badges
    if (status === 'completed') return <span className="bg-[#E5F7ED] text-[#3BA66A] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">{isReq ? 'Paid' : 'Completed'}</span>;
    if (status === 'in_escrow') return <span className="bg-[#E8F0FE] text-[#2775CA] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">In Escrow</span>;
    if (status === 'claiming') return <span className="bg-[#FFF9F2] text-[#D97706] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Claiming</span>;
    if (status === 'processing') return <span className="bg-[#E8F0FE] text-[#2775CA] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Processing</span>;
    if (status === 'partially_paid') return <span className="bg-[#EBF5FF] text-[#2775CA] px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Partially Paid</span>;
    if (status === 'partially_completed') return <span className="bg-[#FFF9F2] text-[#D97706] px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide">Partial</span>;
    if (status === 'pending') return <span className={`${isReq ? 'bg-gray-100 text-gray-600' : 'bg-[#FFF9F2] text-[#D97706]'} px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide`}>{isReq ? 'Unpaid' : 'Pending'}</span>;
    if (status === 'rejected') return <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Rejected</span>;
    if (status === 'cancelled') return <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Cancelled</span>;
    if (status === 'failed') return <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">Failed</span>;
    return <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md text-[11px] font-bold capitalize tracking-wide">{status}</span>;
  };

  const getActiveFilterName = () => mobileFilterType !== "all" ? mobileFilterType : "transaction";

  const formatRecipientDisplay = (tx: TransactionData) => {
    let result = tx.description || "";
    
    if (tx.type === "withdrawal" && result.includes(" - ")) {
      return result.split(" - ").slice(1).join(" - ").trim();
    }

    if (['payment', 'transfer', 'request'].includes(tx.type as string)) {
      if (Array.isArray(tx.recipients) && tx.recipients.length > 0) {
        return tx.recipients.length > 1 ? `${tx.recipients[0]} + ${tx.recipients.length - 1}` : tx.recipients[0];
      }
      
      if (tx.recipientEmail && tx.recipientEmail.trim() !== "") {
        const emails = tx.recipientEmail.split(",").map(e => e.trim()).filter(Boolean);
        return emails.length > 1 ? `${emails[0]} + ${emails.length - 1}` : emails[0];
      }

      let cleaned = result
        .replace(/^(Blink Escrow:|Blink Bulk Escrow:|Requested from|Request to|Request from|Payment to|Transfer to|Sent to|Paid to)\s+/i, "")
        .trim();

      if (cleaned && cleaned.toLowerCase() !== "transfer" && cleaned.toLowerCase() !== "multiple recipients") {
        const parts = cleaned.replace(/ and /gi, ",").split(",").map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          const othersMatch = parts[parts.length - 1].match(/(\d+)\s+others?/i);
          return othersMatch ? `${parts[0]} + ${parts.length - 2 + parseInt(othersMatch[1], 10)}` : `${parts[0]} + ${parts.length - 1}`;
        }
        return cleaned;
      }

      if (cleaned.toLowerCase() === "multiple recipients") return "Bulk Payment";
    }

    return result || "Email Recipient";
  };

  return (
    <div className="animate-in fade-in duration-500 pb-24 md:pb-4">
      {/* MOBILE VIEW */}
      <div className="block md:hidden">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-bold text-[#1A1A1A]">Transaction History</h1>
            <button 
              onClick={handleExportStatement}
              disabled={isExporting || isEmpty}
              className="flex items-center gap-1 bg-[#1A1A1A] text-white px-3.5 py-1 rounded-[8px] text-[11px] font-bold hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
            >
              {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} strokeWidth={2.5} />}
              {isExporting ? "Generating..." : ""}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
              <input 
                type="text" placeholder="Search..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E8E8E8] rounded-full text-[13px] outline-none focus:border-[#1A1A1A] transition-colors"
              />
            </div>
            <div className="relative shrink-0">
              <select 
                value={mobileFilterType} 
                onChange={(e) => setMobileFilterType(e.target.value as any)}
                className="appearance-none bg-white border border-[#E8E8E8] rounded-full px-4 py-2.5 pr-10 text-[13px] font-bold text-[#1A1A1A] outline-none cursor-pointer"
              >
                  <option value="all">All</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdrawal">Withdrawals</option>
                  <option value="payment">Payments</option>
                  <option value="request">Requests</option>
              </select>
              <Filter size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3] pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#F0F0EF] rounded-[24px] p-6 sm:p-8 shadow-sm min-h-[50vh]">
          {loadingState && displayedTransactions.length === 0 ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <MobileSkeleton key={i} />)}</div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-70">
              <h4 className="text-[15px] font-bold text-[#1A1A1A] mb-2">No transactions found</h4>
              <p className="text-[13px] text-[#757575] mb-6">You don't have any {getActiveFilterName().toLowerCase()} records yet.</p>
              
              {mobileFilterType === "all" && !searchQuery && (
                <button onClick={onOpenDeposit} className="px-5 py-2.5 bg-[#F5F5F5] text-[#1A1A1A] rounded-full text-[13px] font-semibold hover:bg-[#EAEAEA] transition-colors">
                    Deposit now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedTransactions.map((tx) => {
                const isWithdraw = tx.type === "withdrawal";
                const isRequest = (tx.type as string) === "request";
                const isIncomingEscrow = (tx.type as string) === "incoming_escrow"; 
                const isPayer = tx.role === "payer"; 
                
                let mobileDisplayLabel = formatRecipientDisplay(tx);
                if (isWithdraw) mobileDisplayLabel = `${tx.description?.includes("MoMo") ? "Mobile Money" : "Bank"} - ${mobileDisplayLabel}`;
                else if (isRequest) mobileDisplayLabel = tx.description?.includes("Payment Received") ? "Account Deposit" : (isPayer ? `Request from ${mobileDisplayLabel}` : `Request to ${mobileDisplayLabel}`);
                else if (isIncomingEscrow) mobileDisplayLabel = tx.description || "Incoming Payment"; 
                
                const { usdcAmount, fiatAmount, fiatCurrency, isFiat } = parseTransactionData(tx);
                
                const isGreenIcon = tx.type === 'deposit' || isIncomingEscrow || (isRequest && tx.status === 'completed' && !isPayer);
                const TheIcon = isGreenIcon || (isRequest && !isPayer) || isIncomingEscrow ? ArrowDownLeft : ArrowUpRight;

                return (
                  <div key={tx.id} onClick={() => setSelectedTxId(tx.id)} className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] transition-all cursor-pointer hover:shadow-sm hover:border-[#D1D1D1]">
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border shrink-0 ${isGreenIcon ? 'bg-[#F2FDF5] border-[#C6F6D5] text-[#34A853]' : 'bg-[#FAFAFA] border-[#E8E8E8] text-[#1A1A1A]'}`}>
                        <TheIcon size={18} strokeWidth={2.5} />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="truncate">
                          {isContextFetching && !tx.recipientEmail && (tx.type === 'payment' || tx.type === 'transfer') ? (
                          <div className="h-4 bg-gray-200 animate-pulse rounded w-36 my-0.5" />
                            ) : (
                            <p className="text-[13px] sm:text-[14px] font-bold text-[#1A1A1A] truncate">
                            {mobileDisplayLabel}
                          </p>
                        )}
                      </div>
                        <p className="text-[11px] sm:text-[12px] text-[#757575] mt-0.5 truncate">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <p className={`text-[14px] sm:text-[15px] font-bold tracking-tight ${isGreenIcon ? 'text-[#34A853]' : 'text-[#1A1A1A]'}`}>
                        {isGreenIcon ? '+' : isRequest && !isPayer ? '' : '-'}{isFiat && fiatAmount !== null ? `${fiatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${fiatCurrency}` : `${usdcAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`}
                      </p>
                      <p className={`text-[11px] sm:text-[12px] mt-0.5 font-medium ${getStatusColor(tx, isRequest)}`}>
                        {tx.type === 'bulk_payment' 
                          ? (tx as any).batchMetrics 
                            ? ((tx as any).batchMetrics.cancelled === (tx as any).batchMetrics.total ? 'Batch Cancelled' 
                              : ((tx as any).batchMetrics.failed + (tx as any).batchMetrics.cancelled === (tx as any).batchMetrics.total) ? 'Batch Failed'
                              : ((tx as any).batchMetrics.terminal === (tx as any).batchMetrics.total 
                                ? ((tx as any).batchMetrics.completed === (tx as any).batchMetrics.total ? `Completed ${(tx as any).batchMetrics.completed}/${(tx as any).batchMetrics.total}` : `Processed ${(tx as any).batchMetrics.terminal}/${(tx as any).batchMetrics.total}`) 
                                : `Processing ${(tx as any).batchMetrics.terminal}/${(tx as any).batchMetrics.total}`)) 
                            : 'Processing'
                          : isRequest && ['pending', 'partially_paid'].includes(tx.status) ? 'Unpaid' 
                          : tx.status === 'partially_completed' ? 'Partial' 
                          : (tx.status === 'processing' || tx.status === 'pending') && (tx.type === 'payment' || (tx.type as string) === 'incoming_escrow' || (tx.type as string) === 'transfer') ? 'In Escrow'
                          : tx.status === 'processing' ? 'Processing' 
                          : tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* WEB VIEW */}
      <div className="hidden md:block w-full max-w-[1200px] mx-auto">
        <h1 className="text-[24px] font-medium text-[#1A1A1A] mb-8">Transactions</h1>
        
        {/* 🌟 FIX: Updated Tab Names & Linked Universal Counters */}
        <div className="flex items-center gap-8 text-[14px] border-b border-[#EAEAEA] mb-6">
          <button onClick={() => setWebTabFilter("All")} className={`pb-3 -mb-[1px] transition-colors ${webTabFilter === "All" ? 'border-b-2 border-[#1A1A1A] text-[#1A1A1A] font-semibold' : 'text-[#757575] hover:text-[#1A1A1A]'}`}>All</button>
          
          {["Completed", "In Progress", "Paused", "Cancelled"].map(tab => {
            const count = tab === "In Progress" ? webCounts.inProgress : webCounts[tab.toLowerCase() as keyof typeof webCounts] || 0;
            return (
              <button key={tab} onClick={() => setWebTabFilter(tab as any)} className={`flex items-center gap-2 pb-3 -mb-[1px] transition-colors ${webTabFilter === tab ? 'border-b-2 border-[#1A1A1A] text-[#1A1A1A] font-semibold' : 'text-[#757575] hover:text-[#1A1A1A]'}`}>
                {tab} <span className="bg-[#F5F5F5] text-[#757575] text-[11px] px-2 py-[2px] rounded-full font-bold">{count}</span>
              </button>
            )
          })}
        </div>

        {(!isEmpty || searchQuery !== "" || loadingState) && (
          <div className="flex flex-row items-center gap-2 sm:gap-3 mb-8 w-full overflow-hidden pb-1">
            
            <div className="relative w-full max-w-[280px] min-w-[80px] shrink transition-all">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
              <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-[#F9F9F9] rounded-[10px] text-[13px] outline-none hover:bg-[#F0F0F0] transition-colors focus-within:bg-[#F0F0F0]" />
            </div>
            
            <div className="relative shrink-0">
              <button className="flex items-center gap-1.5 sm:gap-2 bg-[#F9F9F9] px-3 sm:px-4 py-2.5 rounded-[10px] text-[13px] text-[#1A1A1A] font-medium hover:bg-[#F0F0F0] transition-colors focus-within:bg-[#F0F0F0] whitespace-nowrap">
                {sortOrder === 'newest' ? 'Newest' : 'Oldest'} <span className="hidden xl:inline">first</span> <ChevronDown size={14} className="text-[#A3A3A3] shrink-0" />
              </button>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            <div className="relative shrink-0">
              <button className="flex items-center gap-1.5 sm:gap-2 bg-[#F9F9F9] px-3 sm:px-4 py-2.5 rounded-[10px] text-[13px] text-[#1A1A1A] font-medium hover:bg-[#F0F0F0] transition-colors focus-within:bg-[#F0F0F0] whitespace-nowrap">
                {dateRange === 'all' ? 'All' : dateRange === 'today' ? 'Today' : dateRange === '7days' ? 'Last 7' : 'Last 30'} 
                {dateRange !== 'today' && <span className="hidden xl:inline">{dateRange === 'all' ? 'time' : 'days'}</span>} 
                <ChevronDown size={14} className="text-[#A3A3A3] shrink-0" />
              </button>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none">
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
              </select>
            </div>

            <div className="relative shrink-0">
              <button className="flex items-center gap-1.5 sm:gap-2 bg-[#F9F9F9] px-3 sm:px-4 py-2.5 rounded-[10px] text-[13px] text-[#1A1A1A] font-medium hover:bg-[#F0F0F0] transition-colors focus-within:bg-[#F0F0F0] whitespace-nowrap">
                {currencyFilter === 'All' ? 'Currency' : currencyFilter} <ChevronDown size={14} className="text-[#A3A3A3] shrink-0" />
              </button>
              <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none">
                <option value="All">All Currencies</option>
                {uniqueCurrencies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="ml-auto relative shrink-0">
              <button 
                onClick={handleExportStatement}
                disabled={isExporting || isEmpty}
                className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 sm:px-4 py-1.5 rounded-[8px] text-[11px] font-bold hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm whitespace-nowrap"
              >
                {isExporting ? <Loader2 size={12} className="animate-spin shrink-0" /> : <Download size={12} strokeWidth={2.5} className="shrink-0" />}
                {isExporting ? "Generating..." : <>Export <span className="hidden xl:inline">Statement</span></>}
              </button>
            </div>
            
          </div>
        )}

        {loadingState && displayedTransactions.length === 0 ? (
          <div className="w-full text-left mt-2">
            {/* 🌟 FIX 2: Replaced whitespace-nowrap with 'truncate min-w-0' to force aggressive CSS Grid clamping */}
            <div className="grid grid-cols-[0.8fr_1fr_0.9fr_1.8fr_1.5fr_1.4fr_110px] gap-4 pb-4 border-b border-[#EAEAEA] text-[12px] text-[#878787] font-medium px-4 items-center">
              <div className="truncate min-w-0">Type</div>
              <div className="truncate min-w-0">Created at</div>
              <div className="truncate min-w-0">To/From</div>
              <div className="truncate min-w-0">Recipients</div>
              <div className="text-right truncate min-w-0 pr-4">Amount Disbursed</div>
              <div className="text-right truncate min-w-0">Total Amount</div>
              <div className="text-right pr-2 truncate min-w-0">Status</div>
            </div>
            <div className="flex flex-col">{[...Array(6)].map((_, i) => <WebSkeletonRow key={i} />)}</div>
          </div>
        ) : !isEmpty ? (
          <div className="w-full text-left mt-2">
            {/* 🌟 FIX 2: Replaced whitespace-nowrap with 'truncate min-w-0' to force aggressive CSS Grid clamping */}
            <div className="grid grid-cols-[0.8fr_1fr_0.9fr_1.8fr_1.5fr_1.4fr_110px] gap-4 pb-4 border-b border-[#EAEAEA] text-[12px] text-[#878787] font-medium px-4 items-center">
              <div className="truncate min-w-0">Type</div>
              <div className="truncate min-w-0">Created at</div>
              <div className="truncate min-w-0">To/From</div>
              <div className="truncate min-w-0">Recipients</div>
              <div className="text-right truncate min-w-0 pr-4">Amount Disbursed</div>
              <div className="text-right truncate min-w-0">Total Amount</div>
              <div className="text-right pr-2 truncate min-w-0">Status</div>
            </div>

            <div className="flex flex-col">
              {displayedTransactions.slice(0, visibleCount).map((tx) => {
                const isDep = tx.type === "deposit";
                const isWithdraw = tx.type === "withdrawal";
                const isReq = (tx.type as string) === "request";
                const isPayer = isReq && tx.role === "payer"; 
                
                let toCategory = "Account";
                if (isWithdraw) toCategory = tx.description?.includes("MoMo") ? "Mobile Money" : "Bank";
                else if (tx.type === "payment" || (tx.type as string) === "transfer" || tx.type === "bulk_payment") toCategory = "Email";
                else if (isReq) toCategory = tx.description?.includes("Payment Received") ? "Account" : (isPayer ? "From" : "To");

                const { usdcAmount, fiatAmount, fiatCurrency, isFiat, cleanDescription } = parseTransactionData(tx);
                const linkedReq = isReq ? reqsDb.find((r: any) => r.reference === tx.reference || r.id === tx.reference) : null;
                
                let displayDisbursedStr = '-';
                let displayTotalStr = `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;

                if (isReq && linkedReq) {
                  const displayDisbursed = isFiat ? (linkedReq.fiatAmountPaid || 0) : linkedReq.amountPaid;
                  displayDisbursedStr = `${displayDisbursed.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${isFiat ? fiatCurrency : 'USDC'}`;
                } else if (isWithdraw) {
                   displayTotalStr = `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
                   displayDisbursedStr = isFiat && fiatAmount !== null ? `${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}` : '-';
                } else if (isDep) {
                   displayTotalStr = isFiat && fiatAmount !== null ? `${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}` : '-';
                   displayDisbursedStr = `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
                } else {
                   displayTotalStr = `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
                   if (isFiat && fiatAmount !== null) {
                     displayDisbursedStr = `${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}`;
                   } else if ((tx as any).amountDisbursed > 0) {
                     displayDisbursedStr = `${(tx as any).amountDisbursed.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
                   }
                }

                return (
                  <div key={tx.id} onClick={() => setSelectedTxId(tx.id)} className="grid grid-cols-[0.8fr_1fr_0.9fr_1.8fr_1.5fr_1.4fr_110px] gap-4 py-4 border-b border-[#F5F5F5] hover:bg-[#FAFAFA] transition-colors items-center text-[13px] font-medium text-[#1A1A1A] px-4 cursor-pointer">
                    {/* 🌟 FIX 3: Replaced whitespace-nowrap with 'truncate min-w-0' to let the grid intelligently absorb laptop squeezing */}
                    <div className="capitalize truncate min-w-0">{isDep ? "Deposit" : isWithdraw ? "Withdraw" : isReq ? "Request" : "Transfer"}</div>
                    <div className="text-[#757575] truncate min-w-0">{new Date(tx.date).toLocaleDateString('en-GB').replace(/\//g, '.')}</div>
                    <div className="truncate min-w-0">{toCategory}</div>
                    <div className="truncate min-w-0 pr-4" title={cleanDescription}>
                      {isContextFetching && !tx.recipientEmail && (tx.type === 'payment' || tx.type === 'transfer') ? (
                       <div className="h-3.5 bg-gray-200 animate-pulse rounded w-full max-w-[112px] my-1" />
                    ) : (
                      formatRecipientDisplay({ ...tx, description: cleanDescription })
                    )}
                  </div>
                    <div className="text-right pr-4 text-[#757575] font-medium truncate min-w-0" title={displayDisbursedStr}>{displayDisbursedStr}</div>
                    <div className="text-right font-semibold truncate min-w-0" title={displayTotalStr}>{displayTotalStr}</div>
                    <div className="flex items-center justify-end gap-3 truncate min-w-0">
                      {/* 🌟 UX ENGINE: Passes the whole transaction object so the renderer can unpack metrics */}
                      {getStatusBadge(tx, isReq)}
                      <MoreHorizontal size={16} className="text-[#A3A3A3] shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
            
            {displayedTransactions.length > visibleCount && (
              <div className="flex justify-start mt-6 pl-4">
                <button onClick={() => setVisibleCount(v => v + 15)} className="py-2 text-[13px] font-bold text-[#1A1A1A] hover:text-[#757575] transition-all underline flex items-center gap-1.5 hover:-translate-y-1">
                  View more <ChevronDown size={14} className="animate-bounce mt-0.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
            <div className="relative w-full h-[400px] flex flex-col items-center justify-center">
                <div className="absolute inset-0 z-0 flex flex-col gap-3 pointer-events-none pt-4 px-2">
                    {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex w-full gap-3 opacity-50">
                        <div className="h-9 bg-[#F3F3F3] rounded-md w-[25%]"></div>
                        <div className="h-9 bg-[#F3F3F3] rounded-md w-[35%]"></div>
                        <div className="h-9 bg-[#F3F3F3] rounded-md w-[25%]"></div>
                        <div className="h-9 bg-[#F3F3F3] rounded-md w-[15%]"></div>
                    </div>
                    ))}
                </div>
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-white to-transparent pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-center">
                    <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-2">No transactions yet</h3>
                    <p className="text-[13px] text-[#757575] mb-6 text-center leading-relaxed">
                        Start by making a deposit or payment to keep<br/>this account busy
                    </p>
                    <div className="flex items-center gap-3">
                        {webTabFilter === "All" && !searchQuery && (
                          <button onClick={onOpenDeposit} className="px-5 py-2.5 bg-[#F5F5F5] text-[#1A1A1A] rounded-full text-[13px] font-semibold hover:bg-[#EAEAEA] transition-colors shadow-sm">
                              Deposit now
                          </button>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>

     <DepositTransactionModal isOpen={!!selectedTx && selectedTx.type === "deposit"} onClose={() => setSelectedTxId(null)} transaction={selectedTx} />
      
      <WithdrawalTransactionModal 
        isOpen={!!selectedTx && selectedTx.type === "withdrawal"} 
        onClose={() => setSelectedTxId(null)} 
        transaction={selectedTx} 
        onRepeatTransaction={onRepeatTransaction}
      />
      
      <PaymentTransactionModal 
        isOpen={!!selectedTx && (selectedTx.type === "payment" || selectedTx.type === "bulk_payment" || (selectedTx.type as string) === "transfer") && !selectedTx.description?.includes("Incoming Payment")} 
        onClose={() => setSelectedTxId(null)} 
        transaction={selectedTx} 
      />
      
      <ReceiveClaimModal 
        isOpen={!!selectedTx && (selectedTx.type === "payment" || (selectedTx.type as string) === "incoming_escrow" || (selectedTx.type as string) === "transfer") && !!selectedTx.description?.includes("Incoming Payment")} 
        onClose={() => setSelectedTxId(null)} 
        transaction={selectedTx} 
      />

      <RequestTransactionModal isOpen={!!selectedTx && (selectedTx.type as string) === "request" && selectedTx.role !== "payer"} onClose={() => setSelectedTxId(null)} transaction={selectedTx} activeAccount={activeAccount as any} />

      {selectedTx && (selectedTx.type as string) === "request" && selectedTx.role === "payer" && (
        <PayRequestFlow isOpen={true} onClose={() => setSelectedTxId(null)} requestId={selectedTx.reference || selectedTx.id} />
      )}
    </div>
  );
};
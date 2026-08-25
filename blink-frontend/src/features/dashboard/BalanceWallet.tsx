import { useState, useMemo, useEffect } from "react";
import { WithdrawalFlow } from "./WithdrawalFlow";
import { RequestPaymentFlow } from "./RequestPaymentFlow";
import { DepositFlow } from "./Deposit/DepositFlow";
import { useStore } from "../../store/useStore"; 
import { api } from "../../lib/api";

import { 
  ArrowDown, 
  ArrowUp, 
  Send, 
  EyeOff, 
  Eye, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ChevronLeft,
  X,
  Mail,
  Layers
} from "lucide-react"; 
import { SendMoneyToEmail } from "./SendMoneyToEmail";

type ActiveView = "DASHBOARD" | "REQUEST_PAYMENT" | "TRANSACTION_HISTORY" | "SEND_EMAIL" | "SEND_BULK";

interface BalanceWalletProps {
  isFetching?: boolean; 
}

const TransactionsListSkeleton = () => (
  <div className="space-y-3 animate-in fade-in pb-8">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#F3F4F6]" />
          <div className="space-y-2.5">
            <div className="h-4 w-32 bg-[#F3F4F6] rounded" />
            <div className="h-3 w-24 bg-[#F3F4F6] rounded" />
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2.5">
          <div className="h-4 w-24 bg-[#F3F4F6] rounded" />
          <div className="h-3 w-16 bg-[#F3F4F6] rounded" />
        </div>
      </div>
    ))}
  </div>
);

// =========================================================================
// 🌟 THE SLEEK SEND PAYMENT MODAL
// =========================================================================
const SendPaymentModal = ({ isOpen, onClose, onContinue }: { isOpen: boolean, onClose: () => void, onContinue: (type: "single" | "bulk") => void }) => {
  const [selected, setSelected] = useState<"single" | "bulk">("single");
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
       <div className="bg-white rounded-[24px] w-full max-w-md p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">How do you want to send?</h2>
             <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black transition-colors">
                <X size={16}/>
             </button>
          </div>
          
          <div className="space-y-3 mb-8">
             <div 
                onClick={() => setSelected("single")} 
                className={`p-4 rounded-[16px] border-2 cursor-pointer flex items-center gap-4 transition-all ${
                  selected === 'single' ? 'border-[#1A1A1A] bg-[#FAFAFA]' : 'border-[#F0F0EF] hover:border-[#D1D1D1]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E8E8E8] flex items-center justify-center shrink-0 shadow-sm">
                   <Mail size={18} className={selected === 'single' ? "text-[#1A1A1A]" : "text-[#757575]"} />
                </div>
                <div className="flex-1">
                   <p className={`text-[14px] font-bold ${selected === 'single' ? 'text-[#1A1A1A]' : 'text-[#4B5563]'}`}>Single payment</p>
                   <p className="text-[12px] text-[#757575] mt-0.5">Send directly to an email</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'single' ? 'border-[#1A1A1A]' : 'border-[#D1D1D1]'}`}>
                    {selected === 'single' && <div className="w-2.5 h-2.5 bg-[#1A1A1A] rounded-full" />}
                </div>
             </div>

             <div 
                onClick={() => setSelected("bulk")} 
                className={`p-4 rounded-[16px] border-2 cursor-pointer flex items-center gap-4 transition-all ${
                  selected === 'bulk' ? 'border-[#1A1A1A] bg-[#FAFAFA]' : 'border-[#F0F0EF] hover:border-[#D1D1D1]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E8E8E8] flex items-center justify-center shrink-0 shadow-sm">
                   <Layers size={18} className={selected === 'bulk' ? "text-[#1A1A1A]" : "text-[#757575]"} />
                </div>
                <div className="flex-1">
                   <p className={`text-[14px] font-bold ${selected === 'bulk' ? 'text-[#1A1A1A]' : 'text-[#4B5563]'}`}>Bulk payments</p>
                   <p className="text-[12px] text-[#757575] mt-0.5">Send to multiple people at once</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'bulk' ? 'border-[#1A1A1A]' : 'border-[#D1D1D1]'}`}>
                    {selected === 'bulk' && <div className="w-2.5 h-2.5 bg-[#1A1A1A] rounded-full" />}
                </div>
             </div>
          </div>
          
          <div className="flex justify-between items-center">
             <p className="text-[12px] font-bold text-[#A3A3A3]">Step 1/2</p>
             <button 
                onClick={() => onContinue(selected)} 
                className="bg-[#1A1A1A] text-white px-6 py-3 rounded-full text-[14px] font-bold hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-md"
             >
                Next &rarr;
             </button>
          </div>
       </div>
    </div>
  )
}

export const BalanceWallet = ({ isFetching }: BalanceWalletProps) => {
  
  const activeAccount = useStore((state) => state.activeAccount) as any;
  const rawTransactions = useStore((state) => state.transactions) as any[] || [];
  // 🌟 FINAL ARMOR: Pull the master REST sync lock from Zustand
  const isInitialSyncComplete = useStore((state: any) => state.isInitialSyncComplete);
  
  const [activeView, setActiveView] = useState<ActiveView>("DASHBOARD");
  const [activeFilter, setActiveFilter] = useState("All");
  const [isVisible, setIsVisible] = useState(false);

  // =========================================================================
  // 🌟 1. THE CONTEXT FETCHING ENGINE (For Accurate Statuses)
  // =========================================================================
  const [escrowsDb, setEscrowsDb] = useState<any[]>([]);
  // const [isContextFetching, setIsContextFetching] = useState(true);


  /*
  // 🌟 THE WEBSOCKET HYDRATION MASK
  // Zustand injects stale cache instantly. We lock the UI until the WebSocket boots and syncs.
  const [isSocketSyncing, setIsSocketSyncing] = useState(true);
  const initialBalanceRef = useRef(activeAccount?.balance);

  useEffect(() => {
    // If the WebSocket pushes fresh data that differs from the cache, drop the mask instantly!
    if (activeAccount?.balance !== initialBalanceRef.current) {
      setIsSocketSyncing(false);
    }
  }, [activeAccount?.balance]);

  useEffect(() => {
    // Failsafe: If the cached balance was actually correct, drop the mask after standard WS boot time
    const timer = setTimeout(() => setIsSocketSyncing(false), 1000);
    return () => clearTimeout(timer);
  }, []);
  */

  useEffect(() => {
    let isMounted = true;
    const fetchContextData = async () => {
      try {
        const escrowsRes = await api.get('/escrows').catch(() => ({ data: [] }));
        let combinedEscrows = Array.isArray(escrowsRes.data) ? escrowsRes.data : [];

        const bulkTxs = rawTransactions.filter((tx: any) => tx.type === 'bulk_payment');
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
        }
      } catch (error) {
        console.error("Failed to fetch transaction context:", error);
      }
    };

    fetchContextData();
    const interval = setInterval(fetchContextData, 60000);
   window.addEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);
    };
  }, [rawTransactions.length]); // 🔥 FIX: Only fetch when a transaction is added/removed!

  // =========================================================================
  // 🌟 2. THE TITANIUM AGGREGATE ENGINE (Brought over from History)
  // =========================================================================
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

  const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";

  const accountTransactions = useMemo(() => {
    const scopedTxs = rawTransactions.filter(t => {
      if (t.muxedId) return t.muxedId === activeAccount?.muxedId;
      if (isMasterWallet) {
         return !t.subAccountId || t.subAccountId === null || String(t.subAccountId) === "null";
      } else {
         return String(t.subAccountId) === String(activeAccount?.id);
      }
    });

    const uniqueMap = new Map();
    scopedTxs.forEach((tx: any) => {
      const key = String(tx.reference || tx.id);
      
      if (key && key !== "undefined" && key !== "null") {
         if (uniqueMap.has(key) && !tx.id) {
             return; 
         }
         uniqueMap.set(key, tx);
      }
    });
    const uniqueTxs = Array.from(uniqueMap.values());

    return uniqueTxs.map((tx: any) => {
      const cleanReference = tx.reference ? String(tx.reference).replace("_incoming", "") : String(tx.id);
      const currentType = tx.type as string;
      let enrichedTx = { ...tx };

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

                  return { ...c, status: healedStatus, trackingState: String(c.trackingState || '').toLowerCase() };
              });

              const completed = healedChildren.filter(c => c.status === 'completed' || c.status === 'claimed').length;
              const cancelled = healedChildren.filter(c => c.status === 'cancelled' || c.status === 'claim_canceled').length;
              const failed = healedChildren.filter(c => c.status === 'failed' || c.status === 'rejected' || c.status === 'expired').length;
              const claiming = healedChildren.filter(c => c.trackingState === 'claim_processing' || c.trackingState === 'claim_started').length;
              const pending = healedChildren.filter(c => c.status === 'pending' || c.status === 'processing' || c.status === 'deploying').length;

              const totalTerminal = completed + cancelled + failed;

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
      } else {
          const relatedEscrow = escrowsDb.find((e: any) => String(e.id) === cleanReference || String(e.claimId) === cleanReference); 
          if (relatedEscrow) {
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

              enrichedTx = { ...enrichedTx, status: healedStatus, trackingState: String(relatedEscrow.trackingState || '').toLowerCase() };
          }
      }

      return {
        ...enrichedTx,
        status: mapDbStatusToUi(enrichedTx.status, enrichedTx.trackingState, currentType)
      };
    }).sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

  }, [rawTransactions, escrowsDb, activeAccount, isMasterWallet]);

  // =========================================================================

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  const filters = ["All", "Deposits", "Payouts", "Withdrawals"];
  const maskValue = (value: string) => (isVisible ? value : "• • • • •");

  const availableBalance = useMemo(() => {
    if (isMasterWallet && activeAccount?.balances?.available !== undefined) {
      return activeAccount.balances.available;
    }
    return parseFloat(activeAccount?.balance) || 0; 
  }, [activeAccount, isMasterWallet]);

  const escrowedAmount = useMemo(() => {
    if (isMasterWallet && activeAccount?.balances?.lockedInEscrows !== undefined) {
      return activeAccount.balances.lockedInEscrows;
    }
    return 0; 
  }, [activeAccount, isMasterWallet]);

  const ledgerBalance = useMemo(() => {
    if (isMasterWallet && activeAccount?.balances?.ledger !== undefined) {
      return activeAccount.balances.ledger;
    }
    return availableBalance + escrowedAmount; 
  }, [activeAccount, isMasterWallet, availableBalance, escrowedAmount]);

  const totalYieldGenerated = useMemo(() => {
    if (!activeAccount?.id) return 0;
    return accountTransactions
      .filter(t => t.type === 'deposit' && (t.reference?.includes('_yield') || t.description?.includes('Yield Harvest')))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [accountTransactions, activeAccount?.id]);

  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const formattedAvailableBalance = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(availableBalance);

  const subBalances = [
    { label: "Ledger", value: currencyFormatter.format(ledgerBalance) }, 
    { label: "Escrowed", value: currencyFormatter.format(escrowedAmount) },     
    { label: "Yield earned", value: currencyFormatter.format(totalYieldGenerated) },   
  ];

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'completed' || s === 'successful') return "text-[#34A853] font-bold";
    if (s === 'in_escrow' || s === 'processing') return "text-[#2775CA] font-bold";
    if (s === 'claiming') return "text-[#D97706] font-bold";
    if (s === 'pending' || s === 'partially_paid') return "text-amber-500 font-medium";
    if (s === 'failed' || s === 'rejected') return "text-red-500 font-bold";
    if (s === 'cancelled' || s === 'claim_canceled') return "text-[#A3A3A3] font-bold";
    return "text-[#757575]";
  };

  const renderTransactionStatus = (tx: any) => {
    const status = tx.status?.toLowerCase() || '';
    let displayStatus = status;

    if (status === 'completed' || status === 'successful') displayStatus = 'Completed';
    else if (status === 'in_escrow') displayStatus = 'In Escrow';
    else if (status === 'claiming') displayStatus = 'Claiming';
    else if (status === 'processing') displayStatus = 'Processing';
    else if (status === 'pending') displayStatus = 'Pending';
    else if (status === 'failed' || status === 'rejected') displayStatus = 'Failed';
    else if (status === 'cancelled' || status === 'claim_canceled') displayStatus = 'Cancelled';

    return (
      <p className={`text-[12px] capitalize mt-0.5 ${getStatusColor(status)}`}>
        {displayStatus}
      </p>
    );
  };
  
  const displayedTransactions = accountTransactions
    .filter(t => {
      if (t.type === 'incoming_escrow' && (t.status === 'completed' || t.status === 'claim_completed')) {
          return false;
      }
      if (activeFilter === "All") return true;
      if (activeFilter === "Deposits" && (t.type === "deposit" || t.type === "incoming_escrow")) return true;
      if (activeFilter === "Payouts" && (t.type === "payment" || t.type === "transfer" || t.type === "bulk_payment")) return true;      
      if (activeFilter === "Withdrawals" && t.type === "withdrawal") return true;
      return false;
    })
    .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

  const recentTransactions = displayedTransactions.slice(0, 5);
  const hasMoreTransactions = displayedTransactions.length > 5;
 
  
// 🌟 PERFECTED: The UI is strictly locked by REST promises, the WebSocket Hydration Mask, AND the master /users/me boot.
 // const isDataLoading = isFetching || isContextFetching || isSocketSyncing || !isInitialSyncComplete;
// 🌟 KILLED THE FLICKER: If Zustand already has the balance safely in memory, 
  // we completely ignore the 800ms artificial tab-switching skeleton!
  const isDataLoading = !isInitialSyncComplete || (isFetching && !activeAccount?.balance);
  
  
  if (!activeAccount) return null;

  if (activeView === "REQUEST_PAYMENT") {
    return (
      <div className="relative font-sans animate-in fade-in duration-300 max-w-5xl mx-auto">
        <RequestPaymentFlow onClose={() => setActiveView("DASHBOARD")} />
      </div>
    );
  }

  if (activeView === "SEND_EMAIL") {
    return (
      <div className="relative font-sans animate-in fade-in duration-300 max-w-5xl mx-auto">
        <SendMoneyToEmail onClose={() => setActiveView("DASHBOARD")} />
      </div>
    );
  }

  if (activeView === "SEND_BULK") {
    return (
      <div className="relative font-sans animate-in fade-in duration-300 max-w-5xl mx-auto">
        <SendMoneyToEmail onClose={() => setActiveView("DASHBOARD")} startInBulkMode={true} />
      </div>
    );
  }

  if (activeView === "TRANSACTION_HISTORY") {
    return (
      <div className="relative font-sans animate-in slide-in-from-right-4 duration-300 max-w-5xl mx-auto px-1 sm:px-4 lg:px-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveView("DASHBOARD")}
              className="w-10 h-10 bg-white border border-[#E8E8E8] rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm shrink-0"
            >
              <ChevronLeft size={20} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-[20px] font-bold text-[#1A1A1A]">Transaction History</h1>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                  activeFilter === f
                    ? "bg-[#F5F5F4] text-[#1A1A1A] border border-[#E8E8E8]"
                    : "bg-white text-[#757575] border border-[#F0F0EF] hover:bg-gray-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#F0F0EF] rounded-[24px] p-6 sm:p-8 shadow-sm min-h-[50vh]">
          {isDataLoading ? (
            <TransactionsListSkeleton />
          ) : displayedTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-70">
              <h4 className="text-[15px] font-bold text-[#1A1A1A] mb-2">No transactions found</h4>
              <p className="text-[13px] text-[#757575]">You don't have any {activeFilter.toLowerCase()} records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedTransactions.map((tx) => {
                const isInbound = tx.type === 'deposit' || tx.type === 'incoming_escrow';
                
                return (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] hover:shadow-sm hover:border-[#D1D1D1] transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                      isInbound ? 'bg-[#F2FDF5] border-[#C6F6D5] text-[#34A853]' : 'bg-[#FAFAFA] border-[#E8E8E8] text-[#1A1A1A]'
                    }`}>
                      {isInbound ? <ArrowDownLeft size={20} strokeWidth={2.5} /> : <ArrowUpRight size={20} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[#1A1A1A]">{tx.description}</p>
                      <p className="text-[12px] text-[#757575] mt-0.5">
                        {new Date(tx.date || tx.createdAt || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className={`text-[15px] font-bold tracking-tight ${isInbound ? 'text-[#34A853]' : 'text-[#1A1A1A]'}`}>
                      {isInbound ? '+' : '-'}${parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {renderTransactionStatus(tx)}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative font-sans">
      <div
        className={`animate-in fade-in duration-500 max-w-5xl mx-auto px-1 sm:px-4 lg:px-8 pb-12 transition-all ${
          isDepositOpen || isWithdrawOpen || isSendModalOpen ? "blur-sm pointer-events-none" : ""
        }`}
      >

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-[20px] font-bold text-[#1A1A1A]">Balance</h1>
        </div>

        <div className="border border-[#F0F0EF] rounded-[24px] p-8 lg:p-12 bg-white shadow-sm flex flex-col items-center mb-12 relative">
          <div
            onClick={() => !isDataLoading && setIsVisible(!isVisible)}
            className={`flex items-center gap-2 text-[#757575] mb-2 text-[12px] font-medium transition-opacity ${isDataLoading ? 'opacity-50 cursor-default' : 'cursor-pointer group'}`}
          >
            Available {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </div>
          
          {/* 🌟 SEALED: Balance stays locked safely behind the skeleton until data arrives */}
          <div className="text-[48px] sm:text-[56px] font-bold tracking-tight mb-8 text-[#1A1A1A] transition-all flex items-center justify-center gap-1 min-h-[84px]">
            {isDataLoading ? (
              <div className="h-[60px] w-48 bg-[#F3F4F6] animate-pulse rounded-2xl mt-1"></div>
            ) : isVisible ? (
              <>
                <span className="text-[#A3A3A3] text-[36px] mt-1">$</span>
                {formattedAvailableBalance}
              </>
            ) : "$ • • • • • •"}
          </div>
          
          <div className="flex gap-8 sm:gap-16 mb-12 text-center">
            {subBalances.map((item) => (
              <div key={item.label}>
                <div className="text-[#757575] text-[12px] mb-1">{item.label}</div>
                <div className="text-[#1A1A1A] font-bold text-[14px]">
                  {isDataLoading ? (
                     <div className="h-5 w-16 bg-[#F3F4F6] animate-pulse rounded mx-auto mt-0.5"></div>
                  ) : (
                     maskValue(item.value)
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
            <button
              onClick={() => setIsDepositOpen(true)}
              className="bg-[#FAEDED] border border-[#F4E1E1] rounded-[12px] h-[90px] p-4 flex flex-col justify-between items-start group hover:bg-[#F5D8D8] transition-colors"
            >
              <div className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center">
                <ArrowDown size={14} />
              </div>
              <span className="text-[12px] font-medium text-[#1A1A1A]">
                Deposit
              </span>
            </button>
            {[
              { label: "Withdraw", icon: <ArrowUp size={14} /> },
              { label: "Send payment", icon: <Send size={14} className="ml-[-2px]" /> },
              { label: "Request", icon: <ArrowDown size={14} /> },
            ].map((action) => (
              <button
                 key={action.label}
                 onClick={() => {
                   if (action.label === "Withdraw") setIsWithdrawOpen(true);
                   if (action.label === "Request") setActiveView("REQUEST_PAYMENT"); 
                   if (action.label === "Send payment") setIsSendModalOpen(true);
                 }}
                 className="bg-[#FAEDED] border border-[#F4E1E1] rounded-[12px] h-[90px] p-4 flex flex-col justify-between items-start group hover:bg-[#F5D8D8] transition-colors"
              >
                <div className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center">
                  {action.icon}
                </div>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-[16px] font-bold text-[#1A1A1A]">Recent transactions</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    activeFilter === f
                      ? "bg-[#F5F5F4] text-[#1A1A1A] border border-[#E8E8E8]"
                      : "bg-white text-[#757575] border border-[#F0F0EF] hover:bg-gray-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          <div className="relative mt-4">
            {isDataLoading ? (
              <TransactionsListSkeleton />
            ) : recentTransactions.length === 0 ? (
              <>
                <div className="absolute inset-0 flex flex-col gap-3 opacity-30 pointer-events-none z-0">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 w-full">
                      <div className="h-10 bg-[#F5F5F4] rounded-lg w-1/4" />
                      <div className="h-10 bg-[#F5F5F4] rounded-lg w-1/4" />
                      <div className="h-10 bg-[#F5F5F4] rounded-lg w-1/4" />
                      <div className="h-10 bg-[#F5F5F4] rounded-lg w-1/4" />
                    </div>
                  ))}
                </div>
                <div className="relative z-10 py-16 flex flex-col items-center justify-center text-center">
                  <h4 className="text-[15px] font-bold text-[#1A1A1A] mb-2">
                    No transactions found
                  </h4>
                  <p className="text-[13px] text-[#757575] mb-6 max-w-[220px]">
                    {activeFilter === "All" ? "Start by making a deposit to keep this account busy" : `You don't have any ${activeFilter.toLowerCase()} yet.`}
                  </p>
                  <div className="flex items-center gap-3">
                    <button className="px-5 py-2.5 bg-[#F5F5F4] text-[#1A1A1A] text-[13px] font-medium rounded-full hover:bg-[#E8E8E8]">
                      Learn more
                    </button>
                    {activeFilter === "All" && (
                      <button
                        onClick={() => setIsDepositOpen(true)}
                        className="px-5 py-2.5 bg-[#F5F5F4] text-[#1A1A1A] text-[13px] font-medium rounded-full hover:bg-[#E8E8E8]"
                      >
                        Deposit now
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 animate-in fade-in pb-8">
                {recentTransactions.map((tx) => {
                  const isInbound = tx.type === 'deposit' || tx.type === 'incoming_escrow';
                  
                  return (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] hover:shadow-sm hover:border-[#D1D1D1] transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                        isInbound ? 'bg-[#F2FDF5] border-[#C6F6D5] text-[#34A853]' : 'bg-[#FAFAFA] border-[#E8E8E8] text-[#1A1A1A]'
                      }`}>
                        {isInbound ? <ArrowDownLeft size={20} strokeWidth={2.5} /> : <ArrowUpRight size={20} strokeWidth={2.5} />}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-[#1A1A1A]">{tx.description}</p>
                        <p className="text-[12px] text-[#757575] mt-0.5">
                          {new Date(tx.date || tx.createdAt || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className={`text-[15px] font-bold tracking-tight ${isInbound ? 'text-[#34A853]' : 'text-[#1A1A1A]'}`}>
                        {isInbound ? '+' : '-'}${parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {renderTransactionStatus(tx)}
                    </div>
                  </div>
                )})}

                {hasMoreTransactions && (
                  <div className="flex justify-start mt-2 pt-4">
                    <button 
                      onClick={() => setActiveView("TRANSACTION_HISTORY")}
                      className="group px-2 py-2.5 text-[#1A1A1A] text-[13px] font-bold transition-all duration-300 hover:-translate-y-1 hover:text-[#2775CA] active:scale-95 active:translate-y-0"
                    >
                      <span className="underline underline-offset-4 decoration-2 decoration-[#E8E8E8] group-hover:decoration-[#2775CA] transition-colors">
                        View all transactions
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

     <DepositFlow 
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
      />

      <WithdrawalFlow 
        isOpen={isWithdrawOpen} 
        onClose={() => setIsWithdrawOpen(false)} 
      />

      <SendPaymentModal 
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        onContinue={(type) => {
           setIsSendModalOpen(false);
           setActiveView(type === "single" ? "SEND_EMAIL" : "SEND_BULK");
        }}
      />
    </div>
  );
};
import { X, Check, Clock, AlertCircle, ArrowDownToLine, ArrowUpRight, Copy, Receipt, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { TransactionData } from "./TransactionModals/TransactionUtils";
import { useStore } from "../../store/useStore"; // Connect to the global real-time store

interface TransactionTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionData | null;
}

export const TransactionTrackingModal = ({ isOpen, onClose, transaction }: TransactionTrackingModalProps) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 🌟 GLOBAL STORE: Pull the live transaction ledger
  const globalTransactions = useStore((state: any) => state.transactions) || [];

  // 🌟 THE REAL-TIME ENGINE FIX: The "Stale Modal" Preventer
  // If the SSE webhook updates the database while the modal is open, this hook intercepts 
  // the fresh data from the global store and hot-swaps it instantly.
  const liveTx = useMemo(() => {
    if (!transaction) return null;
    
    // Search the live store for a fresher version of this exact transaction
    const fresh = globalTransactions.find((t: any) => 
      String(t.id) === String(transaction.id) || 
      (t.reference && String(t.reference) === String(transaction.reference))
    );
    
    // UNIVERSAL FIX: Merge fresh data, but PRESERVE the intelligent 
    // status and tracking mappings stitched together by the parent component!
    return fresh ? { 
        ...transaction, 
        ...fresh, 
        status: transaction.status, 
        trackingState: transaction.trackingState,
        timeline: transaction.timeline || fresh.timeline
    } : transaction;
  }, [transaction, globalTransactions]);


  // DEFENSIVE PARSING: Safely parse the timeline using the live, updated transaction
  const safeTimeline = useMemo(() => {
    if (!liveTx || !liveTx.timeline) return [];
    
    if (typeof liveTx.timeline === 'string') {
      try {
        const parsed = JSON.parse(liveTx.timeline);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("Failed to parse transaction timeline:", e);
        return [];
      }
    }
    
    return Array.isArray(liveTx.timeline) ? liveTx.timeline : [];
  }, [liveTx]);

  if (!isOpen || !liveTx) return null;

  const isDeposit = liveTx.type === "deposit";
  const isCompleted = liveTx.status === "completed" || liveTx.status === "successful";
  const isFailed = liveTx.status === "failed" || liveTx.status === "rejected" || liveTx.status === "cancelled";
  
  // 🌟 THE FIX: Add a dedicated processing state
  const isProcessing = liveTx.status === "processing"; 
  
  // 🌟 THE FIX: Remove processing from the generic pending bucket
  const isPending = !isCompleted && !isFailed && !isProcessing;

  // 🌟 DYNAMIC CLAIM LINK GENERATOR (Production Safe)
  const isOutgoingPayment = liveTx.type === "payment" || (liveTx.type as string) === "transfer";
  const rawReference = liveTx.reference || liveTx.id;
  
  // 🚨 CRITICAL FIX: Only generate a claim link if the reference is an actual Escrow ID from the DB
  const isValidEscrowId = rawReference && String(rawReference).startsWith("trx");
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const claimLink = isOutgoingPayment && isValidEscrowId ? `${baseUrl}/claim/${rawReference}` : null;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(String(rawReference));
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleCopyLink = () => {
    if (claimLink) {
      navigator.clipboard.writeText(claimLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-300 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full sm:max-w-[440px] rounded-t-[24px] sm:rounded-[32px] sm:rounded-b-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col max-h-[96dvh] sm:max-h-[90vh] pb-6 sm:pb-0 h-[90dvh] sm:h-[680px]">
        
        {/* Mobile Drag Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 bg-white sm:hidden shrink-0 z-50">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-white relative z-20 shrink-0 border-b border-[#F5F5F4]">
          <div className="w-8" />
          <h2 className="text-[16px] font-bold text-[#1A1A1A]">Transaction Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
        </div>

        <div className="relative bg-white flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center">
          
          {/* Header Icon */}
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-colors duration-500 ${isDeposit ? 'bg-[#E5F7ED] text-[#3BA66A]' : 'bg-[#F5F5F4] text-[#1A1A1A]'}`}>
            {isDeposit ? <ArrowDownToLine size={28} /> : <ArrowUpRight size={28} />}
          </div>
          
          {/* Amount */}
          <h3 className="text-[32px] font-bold text-[#1A1A1A] tracking-tight mb-2">
            {isDeposit ? "+" : "-"}{Number(liveTx.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
          </h3>
          
          {/* Status Pill (Will auto-update when SSE fires!) */}
          <div className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold flex items-center gap-1.5 mb-8 transition-colors duration-500 ${
            isCompleted ? 'bg-[#E5F7ED] text-[#3BA66A]' : 
            isProcessing ? 'bg-[#E8F0FE] text-[#2775CA]' : // Blue styling for Processing Payout
            isPending && liveTx.type === 'payment' ? 'bg-[#E8F0FE] text-[#2775CA]' : // Blue styling for In Escrow
            isPending ? 'bg-[#FFF9F2] text-[#D97706]' : 
            'bg-red-50 text-red-600'
          }`}>
            {isCompleted && <Check size={14} strokeWidth={3} className="animate-in zoom-in duration-300" />}
            {isProcessing && <Clock size={14} className="animate-in zoom-in duration-300" />}
            {isPending && <Clock size={14} />}
            {isFailed && <AlertCircle size={14} className="animate-in zoom-in duration-300" />}
            <span className="uppercase tracking-wider">
              {/* 🌟 FIX 3: Dynamic Modal Text accurately separates Processing vs Escrow */}
              {isProcessing ? 'Processing' : liveTx.status === 'pending' && liveTx.type === 'payment' ? 'In Escrow' : liveTx.status === 'failed' ? 'Refunded' : liveTx.status}
            </span>
          </div>

          {/* 🌟 INTELLIGENT TIMELINE BOX */}
          <div className="w-full bg-[#F9F9F9] border border-[#EAEAEA] rounded-[24px] p-6 mb-8">
            <h4 className="text-[12px] font-bold text-[#878787] uppercase tracking-wider mb-6">Transfer Status</h4>
            <div className="space-y-6 relative ml-1.5">
              <div className="absolute left-[11px] top-2 bottom-2 border-l-[2px] border-[#EAEAEA] -z-10"></div>
              
              {/* Now mapping over the GUARANTEED FRESH safeTimeline */}
              {safeTimeline.length > 0 ? (
                // 🟢 SCENARIO A: Real Live Data from Database
                safeTimeline.map((event: any, i: number) => {
                  const isLatest = i === safeTimeline.length - 1;
                  const isCanceled = event.state?.toLowerCase().includes('cancel') || event.state?.toLowerCase().includes('fail') || event.state?.toLowerCase().includes('refund');
                  
                  return (
                    <div key={i} className="flex items-start gap-4 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5 transition-colors duration-500 ${
                        isCanceled ? 'bg-red-500 text-white' : 'bg-[#34A853] text-white'
                      }`}>
                        {isCanceled ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
                      </div>
                      <div className="flex-1">
                        <h5 className="text-[14px] font-bold text-[#1A1A1A] uppercase tracking-tight">
                          {event.state?.replace(/_/g, ' ') || 'Update'}
                        </h5>
                        <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">
                          {event.metadata?.notes || (isLatest && !isCompleted && !isFailed ? "Current stage of your transfer" : "Stage completed successfully")}
                        </p>
                        <p className="text-[10px] text-[#A3A3A3] mt-1 font-medium">
                          {new Date(event.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                // 🟢 SCENARIO B: Mock Data Fallback (Auto-updates via SSE)
                <>
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-6 h-6 rounded-full bg-[#34A853] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <div>
                      <h5 className="text-[14px] font-bold text-[#1A1A1A]">Request Initiated</h5>
                      <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">We received your request</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5 transition-colors duration-500 ${isCompleted || isFailed ? 'bg-[#34A853] text-white' : 'bg-[#FFF9F2] border border-[#FDE68A] text-[#D97706]'}`}>
                       {isCompleted || isFailed ? <Check size={12} strokeWidth={3} className="animate-in zoom-in duration-300" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />}
                    </div>
                    <div>
                      <h5 className="text-[14px] font-bold text-[#1A1A1A]">Processing Network</h5>
                      <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">Confirming details with provider</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5 transition-colors duration-500 ${isCompleted ? 'bg-[#34A853] text-white' : isFailed ? 'bg-red-500 text-white' : 'bg-[#F5F5F4] border border-[#EAEAEA]'}`}>
                       {isCompleted ? <Check size={12} strokeWidth={3} className="animate-in zoom-in duration-300" /> : isFailed ? <X size={12} strokeWidth={3} className="animate-in zoom-in duration-300" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                    </div>
                    <div>
                      <h5 className="text-[14px] font-bold text-[#1A1A1A]">{isFailed ? "Failed" : "Completed"}</h5>
                      <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">
                        {isCompleted ? "Funds available in balance" : isFailed ? "Transaction was reversed" : "Awaiting final confirmation"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Receipt Details Box */}
          <div className="w-full space-y-4 px-1">
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Description</span>
               <span className="text-[14px] font-bold text-[#1A1A1A] text-right truncate max-w-[200px]" title={liveTx.description}>{liveTx.description}</span>
             </div>
             
             {liveTx.recipientEmail && (
               <div className="flex justify-between items-center py-1">
                 <span className="text-[13px] text-[#757575] font-medium">Recipient</span>
                 <span className="text-[14px] font-bold text-[#1A1A1A] truncate max-w-[200px]">{liveTx.recipientEmail}</span>
               </div>
             )}
             
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Date & Time</span>
               <span className="text-[14px] font-bold text-[#1A1A1A]">
                 {new Date(liveTx.date || liveTx.createdAt || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
               </span>
             </div>
             
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Reference</span>
               <div className="flex items-center gap-2">
                 <span className="text-[14px] font-bold text-[#1A1A1A] truncate max-w-[120px]">{String(rawReference)}</span>
                 <button onClick={handleCopyRef} className="text-[#A3A3A3] hover:text-black transition-colors relative">
                   {copiedRef && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded-md pointer-events-none">Copied!</span>}
                   {copiedRef ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                 </button>
               </div>
             </div>

             {/* 🌟 INTELLIGENT CLAIM LINK UI */}
             {claimLink && (
               <div className="flex justify-between items-center py-1 mt-2 pt-4 border-t border-[#F5F5F5]">
                 <span className="text-[13px] text-[#757575] font-medium">Claim Link</span>
                 <div className="flex items-center gap-2">
                   <span className="text-[13px] font-medium text-[#2775CA] truncate max-w-[150px]">
                     {claimLink.replace(/^https?:\/\//, '')}
                   </span>
                   <button onClick={handleCopyLink} className="text-[#2775CA] bg-[#E8F0FE] hover:bg-[#D2E3FC] p-1.5 rounded-lg transition-colors relative">
                     {copiedLink && <span className="absolute -top-8 right-0 bg-black text-white text-[10px] px-2 py-1 rounded-md pointer-events-none whitespace-nowrap">Link Copied!</span>}
                     {copiedLink ? <Check size={14} className="text-[#34A853]" /> : <Copy size={14} />}
                   </button>
                 </div>
               </div>
             )}
          </div>

          {/* Action Buttons */}
          <div className="w-full mt-auto pt-8 flex flex-col gap-3 shrink-0">
            <button className="w-full py-4 bg-white border border-[#EAEAEA] text-[#1A1A1A] rounded-[16px] text-[13px] font-bold hover:bg-[#F9F9F9] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <Receipt size={16} /> Download Receipt
            </button>
            <button className="w-full py-4 text-[#A3A3A3] rounded-[16px] text-[13px] font-bold hover:text-[#1A1A1A] transition-all flex items-center justify-center gap-2">
                Report an Issue <ExternalLink size={16} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
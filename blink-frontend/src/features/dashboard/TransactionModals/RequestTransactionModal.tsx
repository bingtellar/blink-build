import { useState, useEffect, useMemo } from "react";
import { X, Check, Share, Loader2, AlertTriangle } from "lucide-react";
import { api } from "../../../lib/api";
import { ModalProps, parseTransactionData } from "./TransactionUtils";
import { useStore } from "../../../store/useStore"; 

export const RequestTransactionModal = ({ isOpen, onClose, transaction, activeAccount }: ModalProps) => {
  const transactions = useStore((state) => state.transactions) as any[];
  
  const [copiedLink, setCopiedLink] = useState(false);
  const [note, setNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  
  // 🌟 NEW STATE: Slick Confirmation Overlay
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  const [requestData, setRequestData] = useState<any>(null);

  const liveTx = useMemo(() => {
    if (!transaction) return null;
    const fresh = transactions.find((t: any) => String(t.id) === String(transaction.id));
    return fresh ? { ...transaction, ...fresh } : transaction;
  }, [transaction, transactions]);

  useEffect(() => {
    let isMounted = true;
    if (isOpen && liveTx) {
      setNote(liveTx.note || liveTx.memo || "");
      setIsEditingNote(false);
      setShowCancelConfirm(false); // Reset overlay on open
      
      const fetchRequestData = async () => {
        try {
          const targetId = liveTx.reference || liveTx.id;
          const res = await api.get(`/requests/${targetId}`);
          if (isMounted) setRequestData(res.data);
        } catch (e) {
          console.warn("Failed to fetch live request container data.");
        }
      };
      fetchRequestData();
    }
    return () => { isMounted = false; };
  }, [isOpen, liveTx]);

  if (!isOpen || !liveTx || (liveTx.type as string) !== "request" || liveTx.role === "payer") return null;

  const isCompleted = liveTx.status === "completed" || liveTx.status === "successful";
  const isPending = liveTx.status === "pending" || liveTx.status === "partially_paid";
  const isCancelled = liveTx.status === "cancelled" || liveTx.status === "request_canceled" || requestData?.status === "request_canceled";
  const isRejected = liveTx.status === "rejected";
  const isPartiallyPaid = liveTx.status === "partially_paid" || (requestData && requestData.status === "request_partially_paid");

  const rejectionNote = requestData?.timeline?.slice().reverse().find((t: any) => t.state === "request_rejected")?.metadata?.notes;

  const handleCopyLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const link = `${window.location.origin}/pay?pay_req=${liveTx.reference || liveTx.id}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // 🌟 STEP 1: Trigger the Custom UI Overlay
  const handleInitiateCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowCancelConfirm(true);
  };

  // 🌟 STEP 2: Execute the real API call from the Custom Overlay
  const executeCancelRequest = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const targetId = liveTx.reference || liveTx.id;
    setIsCancelling(true);
    try {
      await api.patch(`/requests/${targetId}/status`, {
          status: "request_canceled",
          note: "Creator manually canceled the request link"
      });
      
      if (requestData) {
        setRequestData({ ...requestData, status: "request_canceled" });
      }
      
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      setShowCancelConfirm(false); // Close overlay on success
      
    } catch (e: any) {
      console.error("Failed to cancel request on the server.", e);
      alert(e.response?.data?.error || "Failed to cancel request. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const formatCustomDate = (dateString: string) => {
    const d = new Date(dateString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth()+1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
    return `${day} - ${month} - ${year}, ${time}`;
  };
  
  const formattedDateStr = formatCustomDate(liveTx.date || liveTx.createdAt || new Date().toISOString());
  const completedDateStr = isCompleted || isRejected || isCancelled ? formatCustomDate(new Date().toISOString()) : "";

  const { usdcAmount, fiatAmount, fiatCurrency, isFiat } = parseTransactionData(liveTx);

  let targetName = "Anyone (Open Link)";
  
  if (liveTx.recipientEmail && liveTx.recipientEmail.trim() !== "") {
    targetName = liveTx.recipientEmail;
  } else if (Array.isArray(liveTx.recipients) && liveTx.recipients.length > 0) {
    if (liveTx.recipients.length > 1) {
      targetName = `${liveTx.recipients[0]} & ${liveTx.recipients.length - 1} other(s)`;
    } else {
      targetName = liveTx.recipients[0];
    }
  } else if (liveTx.description && liveTx.description.toLowerCase().includes("request to")) {
    targetName = liveTx.description.replace(/^Request to\s+/i, "").trim();
  } else if (liveTx.description && liveTx.description.toLowerCase().includes("requested from")) {
    targetName = liveTx.description.replace(/^Requested from\s+/i, "").trim();
  } else if (liveTx.description && liveTx.description.toLowerCase().includes("request")) {
    targetName = liveTx.description.replace(/^Request\s+/i, "").trim() || targetName;
  }

  const displayTxId = liveTx.reference ? liveTx.reference : liveTx.id.toUpperCase();
  const creatorName = activeAccount?.name || "You";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <div 
        className="relative bg-white w-full md:w-[420px] h-[95vh] md:h-[98vh] mt-auto md:mt-[1vh] md:mr-[1vw] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col p-4 md:p-5 animate-in slide-in-from-bottom-full md:slide-in-from-right-full duration-300 z-[101]"
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-[#E5E7EB] transition-colors z-50 text-[#111827] cursor-pointer">
          <X size={16} strokeWidth={2.5} />
        </button>

        <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden pr-1 pb-1">

          <div className="flex flex-col items-center mb-3 text-center mt-1 shrink-0">
            <h2 className="text-[18px] font-bold text-[#111827] mb-0.5">Request money</h2>
            
            <h3 className="text-[26px] font-bold text-[#111827] tracking-tight mb-0.5 mt-1">
              {isFiat && fiatAmount !== null ? `${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}` : `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`}
            </h3>
            <p className="text-[11px] text-[#6B7280] font-medium mb-2.5">Requested by {creatorName}</p>

            <div className="inline-flex items-center gap-1.5 border border-[#E5E7EB] px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-[#4B5563] transition-colors duration-500">
              <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-[#34A853]' : isRejected || isCancelled ? 'bg-red-500' : 'bg-[#FBBF24]'}`} />
              {isCompleted ? 'Completed Payment' : isRejected ? 'Rejected' : isCancelled ? 'Cancelled' : 'Pending payment'}
            </div>
          </div>

          <div className="w-full flex-1 flex flex-col justify-start overflow-y-auto custom-scrollbar min-h-0 pt-2">
            
            <div className="bg-[#F9FAFB] rounded-[16px] p-5 mb-4 relative w-full border border-[#F0F0F0]">
              <div className="absolute left-[27px] top-[30px] bottom-[30px] w-[1.5px] bg-[#E5E7EB] z-0" />
              
              <div className="flex gap-4 relative z-10 mb-5">
                <div className="w-[16px] h-[16px] rounded-full bg-[#111827] flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={10} strokeWidth={4} className="text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#111827] leading-none">Request created</p>
                  <p className="text-[11px] text-[#6B7280] mt-1">{formattedDateStr}</p>
                </div>
              </div>

              {isRejected || isCancelled ? (
                 <div className="flex gap-4 relative z-10">
                  <div className="w-[16px] h-[16px] rounded-full bg-white border-[2px] border-red-500 flex items-center justify-center shrink-0 mt-0.5">
                    <X size={10} strokeWidth={4} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold leading-none text-[#111827]">
                      {isCancelled ? `Request cancelled by you` : `Request rejected by ${targetName}`}
                    </p>
                    {isRejected && rejectionNote && (
                       <p className="text-[11px] text-[#111827] mt-1 font-medium italic">"{rejectionNote}"</p>
                    )}
                    <p className="text-[11px] text-[#6B7280] mt-1 block">{completedDateStr}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-4 relative z-10 mb-5">
                    <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-500 ${isCompleted || isPartiallyPaid ? 'bg-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#111827]'}`}>
                      {isCompleted || isPartiallyPaid ? <Check size={10} strokeWidth={4} className="text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />}
                    </div>
                    <div>
                      <p className={`text-[13px] font-bold leading-none text-[#111827]`}>
                        {isCompleted || isPartiallyPaid ? `Approved by ${targetName}` : `Waiting approval from ${targetName}`}
                      </p>
                      {isCompleted || isPartiallyPaid ? <p className="text-[11px] text-[#6B7280] mt-1">Payment initiated</p> : <p className="text-[11px] text-[#9CA3AF] mt-1">Waiting payment from {targetName}</p>}
                    </div>
                  </div>

                  <div className="flex gap-4 relative z-10 mb-5">
                    <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-500 ${isCompleted ? 'bg-[#111827]' : isPartiallyPaid ? 'bg-[#F9FAFB] border-[2px] border-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#D1D5DB]'}`}>
                      {isCompleted ? <Check size={10} strokeWidth={4} className="text-white animate-in zoom-in" /> : isPartiallyPaid ? <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" /> : null}
                    </div>
                    <div>
                      <p className={`text-[13px] font-medium leading-none ${isCompleted || isPartiallyPaid ? 'text-[#111827] font-bold' : 'text-[#9CA3AF]'}`}>
                        {isCompleted ? `Transaction Paid by ${targetName}` : isPartiallyPaid ? `Waiting remaining payment from ${targetName}` : `Waiting payment from ${targetName}`}
                      </p>
                      {isCompleted && <p className="text-[11px] text-[#6B7280] mt-1">{completedDateStr}</p>}
                    </div>
                  </div>

                  <div className="flex gap-4 relative z-10">
                    <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-500 ${isCompleted ? 'bg-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#D1D5DB]'}`}>
                      {isCompleted && <Check size={10} strokeWidth={4} className="text-white animate-in zoom-in" />}
                    </div>
                    <div>
                      <p className={`text-[13px] font-medium leading-none ${isCompleted ? 'text-[#111827] font-bold' : 'text-[#9CA3AF]'}`}>
                        {isCompleted ? 'Money sent to you' : 'Sending money to your balance'}
                      </p>
                      {isCompleted && <p className="text-[11px] text-[#6B7280] mt-1">{completedDateStr}</p>}
                    </div>
                  </div>
                </>
              )}
            </div>

            {isPending && !isCancelled && !isRejected && (
              <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-4 w-full">
                <div className="flex justify-between items-center text-[12px] font-bold text-[#111827] mb-2">
                  {(() => {
                    const targetFiat = requestData?.fiatAmount || fiatAmount || 0;
                    const targetCrypto = requestData?.amount || usdcAmount || 0;
                    
                    const collectedFiat = requestData?.fiatAmountPaid || 0;
                    const collectedCrypto = requestData?.amountPaid || 0;
                    
                    const remainingFiat = Math.max(0, targetFiat - collectedFiat);
                    const remainingCrypto = Math.max(0, targetCrypto - collectedCrypto);
                      
                    const symbol = isFiat ? (fiatCurrency === "NGN" ? "₦" : fiatCurrency === "GHS" ? "₵" : fiatCurrency === "KES" ? "KSh" : "$") : "$";
                    
                    return (
                      <>
                        <span>
                          {symbol}
                          {isFiat 
                            ? collectedFiat.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) 
                            : collectedCrypto.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} collected
                        </span>
                        <span>
                          {symbol}
                          {isFiat 
                            ? remainingFiat.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) 
                            : remainingCrypto.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} remaining
                        </span>
                      </>
                    );
                  })()}
                </div>
                
                <div className="w-full bg-[#F3F4F6] h-[6px] rounded-full overflow-hidden relative">
                  {(() => {
                    const targetFiat = requestData?.fiatAmount || fiatAmount || 0;
                    const targetCrypto = requestData?.amount || usdcAmount || 0;
                    const collectedFiat = requestData?.fiatAmountPaid || 0;
                    const collectedCrypto = requestData?.amountPaid || 0;
                    const progressPercentage = targetFiat > 0 
                      ? Math.min((collectedFiat / targetFiat) * 100, 100)
                      : targetCrypto > 0 ? Math.min((collectedCrypto / targetCrypto) * 100, 100) : 0;
                      
                    return (
                       <div 
                         className="bg-[#34A853] h-full rounded-full transition-all duration-1000 ease-out" 
                         style={{ width: `${progressPercentage}%` }} 
                       />
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-4 space-y-2.5 w-full">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#6B7280]">Transaction ID</span>
                <span className="text-[12px] font-bold text-[#111827]">{displayTxId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#6B7280]">Date created</span>
                <span className="text-[12px] font-bold text-[#111827]">{formattedDateStr}</span>
              </div>
              {isCompleted && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#6B7280]">Date completed</span>
                  <span className="text-[12px] font-bold text-[#111827]">{completedDateStr}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col mb-2 w-full">
              <span className="text-[12px] font-bold text-[#111827] mb-1">Note</span>
              {isEditingNote ? (
                <div className="flex items-center gap-2 mt-1 animate-in fade-in">
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter a note..."
                    autoFocus
                    className="flex-1 border border-[#EAEAEA] rounded-[12px] px-4 py-2 text-[12px] outline-none focus:border-[#111827] transition-colors bg-[#FAFAFA] focus:bg-white"
                  />
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      setIsEditingNote(false);
                      try {
                        await api.patch(`/transactions/${liveTx.id}`, { note });
                        window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
                      } catch(e) {}
                    }} 
                    className="bg-[#1A1A1A] text-white text-[11px] font-bold px-4 py-2 rounded-[12px] hover:bg-black transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button type="button" onClick={(e) => { e.preventDefault(); setIsEditingNote(true); }} className="text-[11px] text-[#9CA3AF] hover:text-[#111827] text-left transition-colors mt-0.5 cursor-pointer">
                  {note ? <span className="text-[#111827] font-medium">{note}</span> : "Click edit to add a note"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-auto shrink-0 w-full pt-3">
            {isPending && !isCancelled && !isRejected ? (
              <div className="flex gap-3">
                <button type="button" onClick={handleCopyLink} className="flex-1 py-3 bg-white border-[1.5px] border-[#EAEAEA] text-[#111827] rounded-[12px] text-[13px] font-bold hover:bg-[#F9FAFB] transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 relative overflow-hidden cursor-pointer">
                    {copiedLink ? <span className="text-[#059669] flex items-center gap-1 animate-in fade-in"><Check size={16} strokeWidth={3} /> Copied</span> : <><Share size={16} strokeWidth={2.5} /> Share link</>}
                </button>
                <button type="button" disabled={isCancelling} onClick={handleInitiateCancel} className="flex-1 py-3 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    <X size={16} strokeWidth={2.5} /> Cancel request
                </button>
              </div>
            ) : (
              <button type="button" onClick={onClose} className="w-full py-3.5 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all active:scale-[0.98] flex items-center justify-center cursor-pointer">
                  Close
              </button>
            )}
          </div>
        </div>

        {/* 🌟 SLICK CUSTOM CONFIRMATION OVERLAY */}
        {showCancelConfirm && (
          <div className="absolute inset-0 z-[110] bg-white/90 backdrop-blur-sm flex flex-col justify-end md:justify-center p-5 animate-in fade-in duration-200 rounded-t-[24px] md:rounded-[24px]">
            <div className="bg-white border border-[#EAEAEA] shadow-2xl rounded-[20px] p-6 animate-in zoom-in-95 duration-300">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h3 className="text-[18px] font-bold text-[#111827] mb-2">Cancel request?</h3>
              <p className="text-[13px] text-[#6B7280] leading-relaxed mb-6">
                Are you sure you want to cancel this payment request? The link will instantly become invalid and the recipient will not be able to pay.
              </p>
              
              <div className="flex gap-3">
                <button 
                  type="button" 
                  disabled={isCancelling}
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 bg-[#F3F4F6] text-[#111827] rounded-[12px] text-[13px] font-bold hover:bg-[#E5E7EB] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Keep it
                </button>
                <button 
                  type="button" 
                  disabled={isCancelling}
                  onClick={executeCancelRequest}
                  className="flex-1 py-3 bg-red-600 text-white rounded-[12px] text-[13px] font-bold hover:bg-red-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? <Loader2 size={16} className="animate-spin" /> : "Yes, cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
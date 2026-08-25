import { useState, useEffect, ReactElement, useMemo, useRef } from "react";
import { 
  X, Loader2, ArrowUpRight, Check, AlertCircle, Ban, ChevronLeft, ChevronRight, Wallet
} from "lucide-react";
import { FIAT_CURRENCIES } from "../../utils/constants";
import { useStore } from "../../store/useStore"; 

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface PayRequestFlowProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string; 
}

type Step = "VIEW_REQUEST" | "PAY_AMOUNT" | "PAY_METHOD" | "REJECT_CONFIRM" | "REJECTED" | "PROCESSING" | "SUCCESS";

export const PayRequestFlow = ({
  isOpen, onClose, requestId
}: PayRequestFlowProps): ReactElement | null => {
  
  // 🛡️ TS FIX: Cast as 'any' to bypass interface mismatches
  const storeActive = useStore((state) => state.activeAccount) as any;
  const storeAccounts = useStore((state) => state.accounts) as any[];
  // const updateBalance = useStore((state) => state.updateBalance);
  
  const activeAccount = useMemo(() => {
    if (storeActive) return storeActive;
    if (storeAccounts && storeAccounts.length > 0) return storeAccounts[0];
    return null; // 🧹 CLEANUP: Removed legacy mock fallback
  }, [storeActive, storeAccounts]);

  const [step, setStep] = useState<Step>("VIEW_REQUEST");
  const [requestData, setRequestData] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [payAmountStr, setPayAmountStr] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isMounted = useRef(true);

  // 🌟 SECURE FETCHING: Load request from live Postgres DB
  useEffect(() => {
    isMounted.current = true;

    const fetchRequest = async () => {
      if (!isOpen || !requestId) return;
      setIsLoading(true);
      
      try {
        // We do not strictly need auth to VIEW a public request, but we pass it if available
        const authToken = localStorage.getItem("bingtellar_auth_token");
        const headers: any = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

        const res = await fetch(`${API_BASE}/requests/${requestId}`, { headers });
        
        if (!res.ok) {
           setNotFound(true);
           setIsLoading(false);
           return;
        }

        const req = await res.json();
        
        if (isMounted.current) {
          setRequestData(req);
          const remaining = req.fiatAmount ? (parseFloat(req.fiatAmount) - parseFloat(req.fiatAmountPaid || "0")) : (parseFloat(req.amount) - parseFloat(req.amountPaid || "0"));
          setPayAmountStr(remaining.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
          
          if (req.status === "request_rejected") setStep("REJECTED");
          else if (req.status === "request_paid" || req.status === "completed") setStep("SUCCESS");
          else setStep("VIEW_REQUEST");
          
          setErrorMsg("");
          setNotFound(false);
        }
      } catch (e) {
        console.error("Failed to fetch request", e);
        if (isMounted.current) setNotFound(true);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };

    fetchRequest();

    return () => { isMounted.current = false; };
  }, [isOpen, requestId]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
         <Loader2 size={40} className="text-white animate-spin" />
      </div>
    );
  }

  if (notFound || requestData?.status === "request_canceled") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
         <div className="bg-white p-6 rounded-[24px] shadow-2xl text-center max-w-[340px] animate-in zoom-in-95">
            <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ban size={24} />
            </div>
            <h2 className="text-[18px] font-bold text-[#111827] mb-2">{requestData?.status === "request_canceled" ? "Request Cancelled" : "Link Invalid"}</h2>
            <p className="text-[13px] text-[#6B7280] mb-6">
               {requestData?.status === "request_canceled" 
                  ? "This payment request has been cancelled by the creator and is no longer active." 
                  : "We couldn't find this payment request. It may have been canceled or the link is incorrect."}
            </p>
            <button onClick={onClose} className="w-full py-3 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black">Close</button>
         </div>
      </div>
    );
  }

  if (!requestData) return null;

  const currentCurrency = FIAT_CURRENCIES.find((c: any) => c.code === requestData.fiatCurrency) || FIAT_CURRENCIES.find((c: any) => c.code === "USD");
  const symbol = currentCurrency?.symbol || "$";
  const depositRate = currentCurrency?.depositRate || 1;

  const targetAmount = parseFloat(requestData.fiatAmount || requestData.amount || "0");
  const collectedAmount = requestData.fiatAmount ? parseFloat(requestData.fiatAmountPaid || "0") : parseFloat(requestData.amountPaid || "0");
  const remainingAmount = targetAmount - collectedAmount;
  
  const inputFiat = parseFloat(payAmountStr.replace(/,/g, "")) || 0;

  const simulatedCollected = (step === "PAY_AMOUNT" || step === "PAY_METHOD") 
    ? (collectedAmount + inputFiat) 
    : collectedAmount;
    
  const simulatedRemaining = Math.max(0, targetAmount - simulatedCollected);
  const progressPercentage = Math.min((simulatedCollected / targetAmount) * 100, 100);

  const formatNum = (val: string) => {
    let rawValue = val.replace(/,/g, "");
    const validChars = rawValue.replace(/[^0-9.]/g, "");
    const parts = validChars.split(".");
    let formatted = parts[0];
    if (parts.length > 1) formatted += "." + parts.slice(1).join("");
    return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handlePercentageClick = (percentage: number | "Max") => {
    if (percentage === "Max") {
      setPayAmountStr(remainingAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    } else {
      const calc = (remainingAmount * (percentage / 100)).toFixed(2);
      setPayAmountStr(parseFloat(calc).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    }
  };

  // 🌟 SECURE PATCH: Hitting backend to reject
  const handleReject = async () => {
    setIsProcessing(true);
    try {
      const authToken = localStorage.getItem("bingtellar_auth_token");
      const res = await fetch(`${API_BASE}/requests/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({
          status: "request_rejected",
          note: rejectNote || "Payer rejected the request."
        })
      });

      if (res.ok) {
        setRequestData({ ...requestData, status: "request_rejected" });
        setStep("REJECTED");
      } else {
        throw new Error("Failed to reject");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Network error trying to reject.");
    } finally {
      setIsProcessing(false);
    }
  };

  const fiatFee = depositRate * 0.1; 
  const amountAfterFee = Math.max(0, inputFiat - fiatFee);
  
  const grossUsdcRequired = inputFiat > 0 ? inputFiat / depositRate : 0; 
  const netUsdcToCreator = amountAfterFee > 0 ? amountAfterFee / depositRate : 0;

  // 🌟 SECURE PATCH: Hitting backend to fulfill the payment
  const handlePayWithBlink = async () => {
    if (!inputFiat || inputFiat <= 0) return;

    if (inputFiat > remainingAmount) {
       setErrorMsg(`You cannot pay more than the remaining limit of ${symbol}${remainingAmount.toLocaleString()}`);
       return;
    }

    if (!activeAccount || activeAccount.balance < grossUsdcRequired) {
      setErrorMsg(`Insufficient blink balance. You need ${grossUsdcRequired.toLocaleString("en-US", {minimumFractionDigits: 2})} USDC.`);
      return;
    }

    setStep("PROCESSING");

    try {
      const newFiatPaid = (parseFloat(requestData.fiatAmountPaid || "0")) + inputFiat;
      const isFullyPaid = newFiatPaid >= targetAmount;
      const targetStatus = isFullyPaid ? "request_paid" : "request_partially_paid";

      const authToken = localStorage.getItem("bingtellar_auth_token");
      
      const res = await fetch(`${API_BASE}/requests/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({
          status: targetStatus,
          note: `Paid ${inputFiat} via Blink Balance`,
          paymentPayload: {
            grossUsdc: grossUsdcRequired,
            netUsdcToCreator: netUsdcToCreator,
            fiatPaid: inputFiat
          }
        })
      });

      if (!res.ok) throw new Error("Backend failed to process payment.");

      // 🌟 ZUSTAND: Optimistic UI Balance Update
      // updateBalance(activeAccount.balance - grossUsdcRequired);
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

      setRequestData({
        ...requestData,
        fiatAmountPaid: newFiatPaid,
        amountPaid: parseFloat(requestData.amountPaid || "0") + grossUsdcRequired,
        status: targetStatus
      });

      // 🌟 AGENTIC FEEDBACK LOOP
      window.dispatchEvent(new CustomEvent('agentic_transaction_success', {
        detail: {
          type: 'pay_request',
          data: {
            amount: inputFiat,
            currency: requestData.fiatCurrency || 'USDC',
            recipient: requestData.creatorName
          }
        }
      }));

      setStep("SUCCESS");

    } catch (e) {
      console.error(e);
      setStep("PAY_METHOD");
      setErrorMsg("Transaction failed. Please try again.");
    }
  };


  // 🌟 ADD THIS: Handles Bank/Crypto payments without deducting Blink Balance
  const handleExternalPayment = async (methodName: string) => {
    if (!inputFiat || inputFiat <= 0) return;

    if (inputFiat > remainingAmount) {
       setErrorMsg(`You cannot pay more than the remaining limit of ${symbol}${remainingAmount.toLocaleString()}`);
       return;
    }

    setStep("PROCESSING");

    try {
      // Hits the public webhook endpoint to safely mark as processing
      const res = await fetch(`${API_BASE}/requests/public/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: "processing",
          note: `Paid securely via ${methodName}`
        })
      });

      if (!res.ok) throw new Error("Backend failed to process payment.");

      setRequestData({ ...requestData, status: "processing" });
      setStep("SUCCESS"); 
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
    } catch (e) {
      console.error(e);
      setStep("PAY_METHOD");
      setErrorMsg("Transaction failed. Please try again.");
    }
  };

  const isCompleted = step === "SUCCESS" || progressPercentage === 100;
  const isRejected = step === "REJECTED";
  const isPartiallyPaid = progressPercentage > 0 && progressPercentage < 100;
  const payerName = activeAccount?.name || "Payer";

  const renderTimeline = () => {
    const timelineData = Array.isArray(requestData.timeline) ? requestData.timeline : [];
    
    return (
      <div className="bg-[#F9FAFB] rounded-[16px] p-4 mb-4 relative w-full text-left">
        <div className="absolute left-[23px] top-[26px] bottom-[26px] w-[1.5px] bg-[#E5E7EB] z-0" />
        
        <div className="flex gap-4 relative z-10 mb-4">
          <div className="w-[16px] h-[16px] rounded-full bg-[#111827] flex items-center justify-center shrink-0 mt-0.5">
            <Check size={10} strokeWidth={4} className="text-white" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#111827] leading-none">Request created</p>
            <p className="text-[11px] text-[#6B7280] mt-1">{new Date(requestData.createdAt || requestData.dateCreated || Date.now()).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}</p>
          </div>
        </div>

        {isRejected ? (
          <div className="flex gap-4 relative z-10">
            <div className="w-[16px] h-[16px] rounded-full bg-white border-[2px] border-red-500 flex items-center justify-center shrink-0 mt-0.5">
              <X size={10} strokeWidth={4} className="text-red-500" />
            </div>
            <div>
              <p className="text-[13px] font-bold leading-none text-[#111827]">
                Rejected by {activeAccount?.name || "Payer"}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-1 block">Reason:<br/>{timelineData[timelineData.length-1]?.metadata?.notes || rejectNote}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-4 relative z-10 mb-4">
              <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCompleted || isPartiallyPaid ? 'bg-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#111827]'}`}>
                {isCompleted || isPartiallyPaid ? <Check size={10} strokeWidth={4} className="text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />}
              </div>
              <div>
                <p className={`text-[13px] font-bold leading-none text-[#111827]`}>
                  {isCompleted || isPartiallyPaid ? `Request Approved by ${payerName}` : `Waiting approval from ${payerName}`}
                </p>
                {isCompleted || isPartiallyPaid ? <p className="text-[11px] text-[#6B7280] mt-1">Payment initiated</p> : null}
              </div>
            </div>

            <div className="flex gap-4 relative z-10 mb-4">
              <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCompleted ? 'bg-[#111827]' : isPartiallyPaid ? 'bg-[#F9FAFB] border-[2px] border-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#D1D5DB]'}`}>
                {isCompleted ? <Check size={10} strokeWidth={4} className="text-white" /> : isPartiallyPaid ? <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" /> : null}
              </div>
              <div>
                <p className={`text-[13px] font-medium leading-none ${isCompleted || isPartiallyPaid ? 'text-[#111827] font-bold' : 'text-[#9CA3AF]'}`}>
                  {isCompleted ? `Transaction Paid` : isPartiallyPaid ? `Waiting remaining payment` : `Waiting payment`}
                </p>
              </div>
            </div>

            <div className="flex gap-4 relative z-10">
              <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCompleted ? 'bg-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#D1D5DB]'}`}>
                {isCompleted && <Check size={10} strokeWidth={4} className="text-white" />}
              </div>
              <div>
                <p className={`text-[13px] font-medium leading-none ${isCompleted ? 'text-[#111827] font-bold' : 'text-[#9CA3AF]'}`}>
                  {isCompleted ? `Money sent to ${requestData.creatorName}` : `Sending money to ${requestData.creatorName}`}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const RequestHeaderCard = ({ isActionable = false, showTransactionId = true }) => (
    <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm bg-white">
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-3 items-center">
          <div className="w-10 h-10 rounded-full border border-red-200 bg-red-50 text-red-500 flex items-center justify-center shrink-0">
            <ArrowUpRight size={18} strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-bold text-[#111827]">Money request</p>
            <p className="text-[12px] text-[#6B7280]">From {requestData.creatorName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-bold text-[#111827]">{targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}</p>
        </div>
      </div>

      {isActionable && (
        <>
          <div className="flex justify-between items-center text-[12px] font-bold text-[#111827] mb-3 mt-4 pt-4 border-t border-[#EAEAEA] transition-all">
            <span>{symbol}{simulatedCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })} collected</span>
            <span className="text-[#111827]">{symbol}{simulatedRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining</span>
          </div>
          <div className="w-full bg-[#E5E7EB] h-[6px] rounded-full overflow-hidden mb-2 relative">
            <div className="bg-[#34A853] h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPercentage}%` }} />
          </div>
          
          {showTransactionId && (
            <div className="flex justify-between items-center text-[12px] pt-4 mt-3 border-t border-[#EAEAEA]">
              <span className="text-[#6B7280] font-medium">Transaction ID</span>
              <span className="text-[#111827] font-bold truncate max-w-[150px]">{requestData.reference || requestData.id}</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" 
        onClick={onClose} 
      />
      
      <div 
        className="relative bg-white w-full md:w-[420px] h-[95vh] md:h-[98vh] mt-auto md:mt-[1vh] md:mr-[1vw] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col p-4 md:p-5 animate-drawer-bottom md:animate-drawer-right z-[101]"
      >
        
        {step !== "PROCESSING" && (
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-[#E5E7EB] transition-colors z-50 text-[#111827]">
            <X size={16} strokeWidth={2.5} />
          </button>
        )}

        <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden pr-1 pb-1">
          
          {/* STEP 1: INITIAL OVERVIEW */}
          {(step === "VIEW_REQUEST" || step === "SUCCESS" || step === "REJECTED") && (
            <div className="flex-1 flex flex-col animate-in fade-in h-full">
              <div className="flex flex-col items-center mb-6 text-center mt-2 shrink-0">
                <h2 className="text-[18px] font-bold text-[#111827] mb-1">
                  {step === "REJECTED" ? "Request has been rejected" : "Request money"}
                </h2>
                {step !== "REJECTED" && (
                  <>
                    <p className="text-[12px] text-[#4B5563] font-medium mb-2">Request to {activeAccount?.email || requestData.payerEmail || "you"}</p>
                    <h3 className="text-[24px] font-bold text-[#111827] tracking-tight mb-0.5">
                      {targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}
                    </h3>
                    <p className="text-[11px] text-[#6B7280] font-medium mb-3">Requested by {requestData.creatorName}</p>
                    <div className="inline-flex items-center gap-2 border border-[#E5E7EB] px-3.5 py-1 rounded-full text-[11px] font-semibold text-[#4B5563]">
                      <div className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-[#34A853]' : 'bg-[#FBBF24]'}`} />
                      {isCompleted ? 'Request paid' : 'Pending payment'}
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-start w-full overflow-y-auto custom-scrollbar">
                 {renderTimeline()}

                 {step !== "REJECTED" && (
                   <>
                     {requestData.note && (
                       <div className="bg-[#F9FAFB] border border-[#EAEAEA] rounded-[16px] p-5 mb-5 shadow-sm text-left w-full">
                         <span className="text-[11px] text-[#6B7280] font-bold uppercase tracking-wider mb-2 block">Note from creator</span>
                         <p className="text-[13px] text-[#111827] leading-relaxed">"{requestData.note}"</p>
                       </div>
                     )}

                     <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-5 w-full">
                       <div className="flex justify-between items-center text-[12px] font-bold text-[#111827] mb-3">
                         <span>{symbol}{collectedAmount.toLocaleString()} collected</span>
                         <span className="text-[#6B7280]">{symbol}{remainingAmount.toLocaleString()} remaining</span>
                       </div>
                       <div className="w-full bg-[#F3F4F6] h-[6px] rounded-full overflow-hidden mb-4">
                         <div className="bg-[#34A853] h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercentage}%` }} />
                       </div>
                       
                       <div className="flex justify-between items-center text-[12px] pt-4 border-t border-[#EAEAEA]">
                         <span className="text-[#6B7280] font-medium">Transaction ID</span>
                         <span className="text-[#111827] font-bold truncate max-w-[150px]">{requestData.reference || requestData.id}</span>
                       </div>
                     </div>
                   </>
                 )}
              </div>

              <div className="mt-auto shrink-0 w-full pt-4">
                 {step === "VIEW_REQUEST" && (
                   <div className="flex gap-3">
                     <button onClick={() => setStep("REJECT_CONFIRM")} className="flex-1 py-3.5 bg-white border border-red-200 text-red-500 rounded-full text-[14px] font-bold hover:bg-red-50 transition-all flex justify-center items-center gap-2">
                        <Ban size={16} /> Reject request
                     </button>
                     <button onClick={() => setStep("PAY_AMOUNT")} className="flex-1 py-3.5 bg-[#111827] text-white rounded-full text-[14px] font-bold hover:bg-black transition-all flex justify-center items-center gap-2">
                        <Check size={16} /> Approve & Pay
                     </button>
                   </div>
                 )}
                 {step === "REJECTED" && (
                   <button onClick={onClose} className="w-full py-3.5 bg-[#111827] text-white rounded-full text-[14px] font-bold hover:bg-black transition-all">
                     Close
                   </button>
                 )}
                 {step === "SUCCESS" && (
                   <button onClick={onClose} className="w-full py-3.5 bg-[#111827] text-white rounded-full text-[14px] font-bold hover:bg-black transition-all">
                     Back to Dashboard
                   </button>
                 )}
              </div>
            </div>
          )}

          {/* STEP 2: AMOUNT SELECTION */}
          {step === "PAY_AMOUNT" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full">
              <h2 className="text-[18px] font-bold text-[#111827] mb-6 shrink-0 pt-1 text-left w-[85%]">Pay this money request</h2>
              
              <RequestHeaderCard isActionable showTransactionId={false} />

              <div className="flex-1 flex flex-col justify-start mb-6 mt-4 w-full overflow-y-auto custom-scrollbar">
                <label className="text-[13px] font-bold text-[#111827] mb-3 block text-left">How much do you want to pay?</label>
                
                <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-5 w-full">
                  <div className="flex items-center gap-2 border-b border-dashed border-gray-300 pb-5 mb-5">
                    <span className="text-[20px] font-medium text-[#6B7280]">{symbol}</span>
                    <input 
                      type="text" 
                      value={payAmountStr} 
                      onChange={(e) => { setPayAmountStr(formatNum(e.target.value)); setErrorMsg(""); }}
                      className="w-full text-[32px] font-bold text-[#111827] outline-none bg-transparent"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    {[10, 20, 30, 40, 50, "Max"].map((pct) => (
                      <button 
                        key={pct}
                        onClick={() => { handlePercentageClick(pct as any); setErrorMsg(""); }}
                        className="flex-1 py-2 bg-[#F3F4F6] text-[#4B5563] text-[12px] font-bold rounded-full hover:bg-[#E5E7EB] transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 text-red-600 p-3.5 rounded-[12px] text-[12px] font-medium flex items-center gap-2 mb-4 animate-in fade-in w-full text-left">
                    <AlertCircle size={16} className="shrink-0" /> {errorMsg}
                  </div>
                )}
              </div>

              <div className="mt-auto shrink-0 w-full pt-4">
                 <button 
                   disabled={!payAmountStr || parseFloat(payAmountStr.replace(/,/g, "")) <= 0}
                   onClick={() => {
                      const inputFiat = parseFloat(payAmountStr.replace(/,/g, ""));
                      if (inputFiat > remainingAmount) {
                          setErrorMsg(`You cannot pay more than the remaining limit of ${symbol}${remainingAmount.toLocaleString()}`);
                          return;
                      }
                      setStep("PAY_METHOD");
                   }} 
                   className="w-full py-4 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Choose Payment Method
                 </button>
                 
                 <div className="text-center mt-6 mb-2">
                   <a href="#" className="text-[13px] text-[#111827] underline decoration-[#111827]/30 hover:decoration-[#111827] transition-colors underline-offset-4">
                     Need help with this transaction?
                   </a>
                 </div>
              </div>
            </div>
          )}

          {/* STEP 3: PAYMENT METHOD */}
          {step === "PAY_METHOD" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full">
               <div className="flex items-center gap-3 mb-5 shrink-0 pt-1">
                 <button onClick={() => { setStep("PAY_AMOUNT"); setErrorMsg(""); }} className="p-1.5 bg-[#F3F4F6] rounded-full hover:bg-[#E5E7EB]"><ChevronLeft size={16}/></button>
                 <h2 className="text-[18px] font-bold text-[#111827]">Payment method</h2>
               </div>
               
               <RequestHeaderCard isActionable={false} />

               <div className="flex-1 flex flex-col justify-start w-full overflow-y-auto custom-scrollbar">
                 <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-5 pointer-events-none bg-white">
                   <div className="flex items-center gap-2 border-b border-dashed border-gray-300 pb-5 mb-5">
                     <span className="text-[20px] font-medium text-[#6B7280]">{symbol}</span>
                     <span className="text-[32px] font-bold text-[#111827]">{payAmountStr}</span>
                   </div>
                   <div className="flex items-center justify-between gap-2">
                     {[10, 20, 30, 40, 50, "Max"].map((pct) => (
                       <div key={pct} className="flex-1 py-1.5 bg-[#F3F4F6] text-[#4B5563] text-[12px] font-bold rounded-full text-center">{pct}%</div>
                     ))}
                   </div>
                 </div>

                 {errorMsg && (
                  <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-[12px] text-[13px] font-medium flex flex-col gap-3 mb-5 animate-in fade-in text-left">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" /> 
                      <span>{errorMsg}</span>
                    </div>
                    <button onClick={() => { setStep("PAY_AMOUNT"); setErrorMsg(""); }} className="text-red-700 underline font-bold self-end hover:text-red-800 transition-colors">
                      Change Amount
                    </button>
                  </div>
                 )}

                 <button onClick={handlePayWithBlink} className="w-full py-4 bg-[#111827] text-white rounded-[12px] text-[14px] font-bold flex justify-center items-center gap-2 hover:bg-black transition-all shadow-sm">
                   Pay with Blink Balance <Wallet size={16} />
                 </button>

                 <div className="flex items-center gap-4 my-6">
                   <div className="flex-1 h-px bg-[#EAEAEA]"></div>
                   <span className="text-[13px] text-[#9CA3AF] font-medium uppercase tracking-wider">OR</span>
                   <div className="flex-1 h-px bg-[#EAEAEA]"></div>
                 </div>

                 <div className="space-y-3 w-full pb-4">
                   <button onClick={() => handleExternalPayment("External Crypto Wallet")} className="border border-[#EAEAEA] rounded-[12px] p-4 flex justify-between items-center w-full hover:border-gray-300 transition-colors bg-white text-left">
                    <div className="flex-1 pr-2">
                      <h4 className="text-[13px] font-bold text-[#111827]">Pay Using External Wallet or Exchange</h4>
                       <p className="text-[11px] text-[#6B7280] mt-0.5">Metamask, Trustwallet, Binance & more</p>
                     </div>
                     <div className="flex items-center -space-x-1.5 shrink-0">
                       <div className="w-[26px] h-[26px] rounded-full bg-[#F3BA2F] flex items-center justify-center border-2 border-white relative z-30 shadow-sm">
                         <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M12 2l2.6 2.6L12 7.2 9.4 4.6 12 2zm0 15.6l-2.6-2.6L12 12.4l2.6 2.6-2.6 2.6zm5.8-5.8l2.6-2.6L22 12l-1.6 1.6-2.6-2.6zm-11.6 0L3.6 9.4 2 12l1.6 1.6 2.6-2.6zm5.8-2.2l-2.6-2.6 2.6-2.6 2.6 2.6-2.6 2.6z"/></svg>
                       </div>
                       <div className="w-[26px] h-[26px] rounded-full bg-[#3375BB] flex items-center justify-center border-2 border-white relative z-20 shadow-sm">
                         <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-white"><path d="M12 2C12 2 5 4.5 5 9.5C5 14.5 12 22 12 22C12 22 19 14.5 19 9.5C19 4.5 12 2 12 2Z"/></svg>
                       </div>
                       <div className="w-[26px] h-[26px] rounded-full bg-white flex items-center justify-center border-2 border-white relative z-10 shadow-sm overflow-hidden">
                         <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-4 h-4 object-contain" />
                       </div>
                     </div>
                   </button>
                   
                   <button onClick={() => handleExternalPayment("Bank Transfer")} className="border border-[#EAEAEA] rounded-[12px] p-4 flex justify-between items-center w-full hover:border-gray-300 transition-colors bg-white text-left">
  <div className="flex-1 pr-2">
    <h4 className="text-[13px] font-bold text-[#111827]">Bank Transfers</h4>
                       <p className="text-[11px] text-[#6B7280] mt-0.5">USD, EUR, MXN, ARS, NGN & more</p>
                     </div>
                     <ChevronRight size={16} className="text-[#9CA3AF] shrink-0" />
                   </button>
                   
                   <button onClick={() => handleExternalPayment("Mobile Money")} className="border border-[#EAEAEA] rounded-[12px] p-4 flex justify-between items-center w-full hover:border-gray-300 transition-colors bg-white text-left">
  <div className="flex-1 pr-2">
    <h4 className="text-[13px] font-bold text-[#111827]">Mobile Payments</h4>
                       <p className="text-[11px] text-[#6B7280] mt-0.5">Mpesa, Pix, MoMo & more</p>
                     </div>
                     <ChevronRight size={16} className="text-[#9CA3AF] shrink-0" />
                   </button>
                 </div>
               </div>
            </div>
          )}

          {/* STEP 4: REJECT CONFIRMATION */}
          {step === "REJECT_CONFIRM" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full">
              <h2 className="text-[18px] font-bold text-[#111827] mb-6 shrink-0 pt-1 text-left w-[85%]">Reject this money request?</h2>
              
              <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-8 bg-white w-full">
                <div className="flex gap-3 items-center mb-5 text-left">
                  <div className="w-8 h-8 rounded-full border border-blue-200 bg-blue-50 text-blue-500 flex items-center justify-center">
                    <ArrowUpRight size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#111827]">Money request</p>
                    <p className="text-[12px] text-[#6B7280]">From {requestData.creatorName}</p>
                  </div>
                </div>
                <div className="border-t border-[#EAEAEA] pt-4 flex justify-between items-center">
                  <span className="text-[12px] text-[#6B7280]">Total Amount</span>
                  <span className="text-[15px] font-bold text-[#111827]">{targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}</span>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col justify-start w-full text-left">
                <label className="text-[13px] font-bold text-[#111827] mb-2 block">Reason of Rejection <span className="text-red-500">*</span></label>
                <textarea 
                  value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="E.g., this request is coming at the wrong time..."
                  className="w-full flex-1 min-h-[140px] resize-none border border-[#D1D4D7] rounded-[16px] p-4 bg-white outline-none focus:border-black transition-colors text-[14px]"
                />
              </div>
              
              <div className="mt-auto shrink-0 w-full pt-6 flex gap-3">
                <button onClick={() => setStep("VIEW_REQUEST")} className="flex-1 py-4 bg-white border border-[#111827] text-[#111827] rounded-full text-[14px] font-bold hover:bg-gray-50 transition-all">
                  Back
                </button>
                <button onClick={handleReject} disabled={isProcessing || !rejectNote} className="flex-1 py-4 bg-[#EAEAEA] text-[#A3A3A3] rounded-full text-[14px] font-bold hover:bg-gray-200 transition-all flex items-center justify-center">
                   {isProcessing ? <Loader2 size={18} className="animate-spin text-gray-500" /> : "Reject Request"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PROCESSING */}
          {step === "PROCESSING" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-300 py-10 h-full">
              <Loader2 size={40} className="text-[#111827] animate-spin mb-6" />
              <h2 className="text-[18px] font-bold text-[#111827]">Processing Payment...</h2>
            </div>
          )}

        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      ` }} />
    </div>
  );
};
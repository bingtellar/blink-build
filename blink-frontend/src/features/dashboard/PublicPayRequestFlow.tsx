import { useState, useEffect, ReactElement } from "react";
import { 
  X, Loader2, ArrowUpRight, Check, AlertCircle, Ban, ChevronLeft, Landmark, Smartphone, Wallet, Copy, ChevronRight
} from "lucide-react"; 
import { FIAT_CURRENCIES } from "../../utils/constants";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface PublicPayRequestFlowProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string; 
}

type Step = "VIEW_REQUEST" | "PAY_AMOUNT" | "PAY_METHOD" | "AUTH_PROMPT" | "REJECT_CONFIRM" | "REJECTED" | "PROCESSING" | "SUCCESS";

export const PublicPayRequestFlow = ({
  isOpen, onClose, requestId
}: PublicPayRequestFlowProps): ReactElement | null => {
  
  const [step, setStep] = useState<Step>("VIEW_REQUEST");
  const [requestData, setRequestData] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  
  const [payAmountStr, setPayAmountStr] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 🌟 REAL AUTHENTICATION STATE
  const [localActiveAccount, setLocalActiveAccount] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"prompt" | "login" | "signup">("prompt");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authNotification, setAuthNotification] = useState("");

  // Automatically sync account on mount if already logged in globally
  useEffect(() => {
    const token = localStorage.getItem("bingtellar_auth_token");
    if (token) {
      fetch(`${API_BASE}/users/me`, { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => { if (data.user) setLocalActiveAccount(data.user); })
        .catch(() => {});
    }
  }, []);

  // 🌟 FETCH REAL DATA FROM POSTGRES
  useEffect(() => {
    if (isOpen && requestId) {
      fetch(`${API_BASE}/requests/public/${requestId}`)
        .then(res => {
           if (!res.ok) throw new Error("Not Found");
           return res.json();
        })
        .then(req => {
           setRequestData(req);
           const remaining = req.fiatAmount ? (parseFloat(req.fiatAmount) - parseFloat(req.fiatAmountPaid || "0")) : (parseFloat(req.amount) - parseFloat(req.amountPaid || "0"));
           setPayAmountStr(remaining.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
           
           if (req.status === "request_rejected") setStep("REJECTED");
           else if (req.status === "request_paid" || req.status === "completed") setStep("SUCCESS");
           else setStep("VIEW_REQUEST");
           
           setErrorMsg("");
           setNotFound(false);
        })
        .catch(() => {
           setNotFound(true);
        });
    }
  }, [isOpen, requestId]);

  if (!isOpen) return null;

  if (notFound || requestData?.status === "request_canceled") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F5F5F5] backdrop-blur-sm">
         <div className="bg-white p-5 rounded-[20px] shadow-xl text-center max-w-[320px] animate-in zoom-in-95 border border-[#EAEAEA]">
            <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <Ban size={20} />
            </div>
            <h2 className="text-[16px] font-bold text-[#111827] mb-1.5">{requestData?.status === "request_canceled" ? "Request Cancelled" : "Link Invalid"}</h2>
            <p className="text-[12px] text-[#6B7280] mb-5 leading-relaxed">
               {requestData?.status === "request_canceled" 
                  ? "This payment request has been cancelled by the creator and is no longer active." 
                  : "We couldn't find this payment request. It may have been canceled."}
            </p>
            <button onClick={onClose} className="w-full py-2.5 bg-[#111827] text-white rounded-[10px] text-[12px] font-bold hover:bg-black">Close</button>
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

  const simulatedCollected = (step === "PAY_AMOUNT" || step === "PAY_METHOD" || step === "AUTH_PROMPT") 
    ? (collectedAmount + inputFiat) : collectedAmount;
    
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

  // 🌟 REAL API REJECT
  const handleReject = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/requests/public/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: "request_rejected",
          note: rejectNote || "Guest Payer rejected the request."
        })
      });
      if (res.ok) {
         setRequestData({ ...requestData, status: "request_rejected" });
         setStep("REJECTED");
      } else throw new Error("Failed to reject");
    } catch (e) {
      setErrorMsg("Network error trying to reject.");
    } finally {
      setIsProcessing(false);
    }
  };

  const fiatFee = depositRate * 0.1; 
  const amountAfterFee = Math.max(0, inputFiat - fiatFee);
  
  const grossUsdcRequired = inputFiat > 0 ? inputFiat / depositRate : 0; 
  const netUsdcToCreator = amountAfterFee > 0 ? amountAfterFee / depositRate : 0;

  // 🌟 REAL API LOGIN INTEGRATION
  const handleQuickAuth = async () => {
    if (!authEmail || !authPass) return;
    setIsProcessing(true);
    setErrorMsg("");
    
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/users";
      const payload = authMode === "login" 
        ? { email: authEmail, password: authPass }
        : { email: authEmail, password: authPass, walletAddress: "" };
        
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Authentication failed");
      }
      const data = await res.json();
      
      const token = data.token || data.accessToken;
      if (token) localStorage.setItem("bingtellar_auth_token", token);
      
      const userRes = await fetch(`${API_BASE}/users/me`, { headers: { "Authorization": `Bearer ${token}` }});
      if (userRes.ok) {
          const userData = await userRes.json();
          setLocalActiveAccount(userData.user);
          setAuthNotification(`Successfully logged in. Your balance is $${parseFloat(userData.user.balance).toLocaleString()}`);
          setStep("PAY_METHOD");
          setTimeout(() => setAuthNotification(""), 5000); 
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🌟 REAL API BLINK PAYMENT
  const handlePayWithBlink = async () => {
    if (!inputFiat || inputFiat <= 0) return;
    if (inputFiat > remainingAmount) {
       setErrorMsg(`You cannot pay more than the remaining limit of ${symbol}${remainingAmount.toLocaleString()}`);
       return;
    }

    if (!localActiveAccount) {
       setAuthMode("prompt");
       setStep("AUTH_PROMPT");
       return;
    }

    if (parseFloat(localActiveAccount.balance) < grossUsdcRequired) {
      setErrorMsg(`Insufficient blink balance. You need ${grossUsdcRequired.toLocaleString("en-US", {minimumFractionDigits: 2})} USDC.`);
      return;
    }

    setStep("PROCESSING");

    try {
      const newFiatPaid = (parseFloat(requestData.fiatAmountPaid || "0")) + inputFiat;
      const isFullyPaid = newFiatPaid >= targetAmount;
      const targetStatus = isFullyPaid ? "request_paid" : "request_partially_paid";

      const token = localStorage.getItem("bingtellar_auth_token");
      const res = await fetch(`${API_BASE}/requests/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          status: targetStatus,
          note: `Paid ${inputFiat} via Blink Balance`,
          paymentPayload: { grossUsdc: grossUsdcRequired, netUsdcToCreator: netUsdcToCreator, fiatPaid: inputFiat }
        })
      });

      if (!res.ok) throw new Error("Backend failed to process payment.");

      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      setRequestData({ ...requestData, fiatAmountPaid: newFiatPaid, amountPaid: parseFloat(requestData.amountPaid || "0") + grossUsdcRequired, status: targetStatus });
      setStep("SUCCESS");
    } catch (e) {
      console.error(e);
      setStep("PAY_METHOD");
      setErrorMsg("Transaction failed. Please try again.");
    }
  };

  // 🌟 REAL API PUBLIC PAYMENT
  const handlePublicPayment = async (methodName: string) => {
    if (!inputFiat || inputFiat <= 0) return;
    if (inputFiat > remainingAmount) {
       setErrorMsg(`You cannot pay more than the remaining limit of ${symbol}${remainingAmount.toLocaleString()}`);
       return;
    }

    setStep("PROCESSING");

    try {
      const newFiatPaid = (parseFloat(requestData.fiatAmountPaid || "0")) + inputFiat;
      const isFullyPaid = newFiatPaid >= targetAmount;
      const targetStatus = isFullyPaid ? "request_paid" : "request_partially_paid";

      const res = await fetch(`${API_BASE}/requests/public/${requestData.reference}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          note: `Paid securely via ${methodName}`,
          paymentPayload: { grossUsdc: grossUsdcRequired, netUsdcToCreator: netUsdcToCreator, fiatPaid: inputFiat }
        })
      });

      if (!res.ok) throw new Error("Failed to process payment");

      setRequestData({ ...requestData, fiatAmountPaid: newFiatPaid, amountPaid: parseFloat(requestData.amountPaid || "0") + grossUsdcRequired, status: targetStatus });
      setStep("SUCCESS");
    } catch (e: any) {
      console.error(e);
      setStep("PAY_METHOD");
      setErrorMsg("Transaction failed. Please try again.");
    }
  };

  const isCompleted = step === "SUCCESS" || progressPercentage === 100;
  const isRejected = step === "REJECTED";
  const isPartiallyPaid = progressPercentage > 0 && progressPercentage < 100;

  const renderTimeline = () => {
    return (
      <div className="bg-[#F9FAFB] rounded-[16px] p-4 mb-4 relative w-full block">
        <div className="absolute left-[23px] top-[24px] bottom-[24px] w-[1px] bg-[#E5E7EB] z-0" />
        
        <div className="flex gap-3 relative z-10 mb-4">
          <div className="w-[14px] h-[14px] rounded-full bg-[#111827] flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[2px] border-[#F9FAFB]">
            <Check size={8} strokeWidth={4} className="text-white" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-[#111827] leading-none">Request created</p>
            <p className="text-[10px] text-[#6B7280] mt-1">{new Date(requestData.createdAt || requestData.dateCreated || Date.now()).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}</p>
          </div>
        </div>

        {isRejected ? (
          <div className="flex gap-3 relative z-10">
            <div className="w-[14px] h-[14px] rounded-full bg-white border-[2px] border-red-500 flex items-center justify-center shrink-0 mt-0.5">
              <X size={8} strokeWidth={4} className="text-red-500" />
            </div>
            <div>
              <p className="text-[12px] font-bold leading-none text-[#111827]">
                Rejected by you
              </p>
              <p className="text-[10px] text-[#6B7280] mt-1 block">Reason:<br/>{rejectNote || "Rejected by Payer"}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-3 relative z-10 mb-4">
              <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[2px] border-[#F9FAFB] ${isCompleted || isPartiallyPaid ? 'bg-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#111827]'}`}>
                {isCompleted || isPartiallyPaid ? <Check size={8} strokeWidth={4} className="text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />}
              </div>
              <div>
                <p className={`text-[12px] font-bold leading-none ${isCompleted || isPartiallyPaid ? 'text-[#111827]' : 'text-[#111827]'}`}>
                  {isCompleted || isPartiallyPaid ? `Request Approved by you` : `Waiting approval from you`}
                </p>
                {isCompleted || isPartiallyPaid ? <p className="text-[10px] text-[#6B7280] mt-1">Payment initiated</p> : null}
              </div>
            </div>

            <div className="flex gap-3 relative z-10 mb-4">
              <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[2px] border-[#F9FAFB] ${isCompleted ? 'bg-[#111827]' : isPartiallyPaid ? 'bg-[#F9FAFB] border-[2px] border-[#111827]' : 'bg-[#F9FAFB] border-[2px] border-[#D1D5DB]'}`}>
                {isCompleted ? <Check size={8} strokeWidth={4} className="text-white" /> : isPartiallyPaid ? <div className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" /> : null}
              </div>
              <div>
                <p className={`text-[12px] font-medium leading-none ${isCompleted || isPartiallyPaid ? 'text-[#111827] font-bold' : 'text-[#9CA3AF]'}`}>
                  {isCompleted ? `Transaction Paid` : isPartiallyPaid ? `Waiting remaining payment` : `Waiting payment`}
                </p>
              </div>
            </div>
            
            {isCompleted && (
              <div className="flex gap-3 relative z-10">
                <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[2px] border-[#F9FAFB] bg-[#111827]`}>
                  <Check size={8} strokeWidth={4} className="text-white" />
                </div>
                <div>
                  <p className={`text-[12px] font-medium leading-none text-[#111827] font-bold`}>
                    Money sent to {requestData.creatorName}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const RequestHeaderCard = ({ isActionable = false }) => (
    <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm bg-white w-full">
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-3 items-center">
          <div className="w-9 h-9 rounded-full border border-[#EAEAEA] bg-white text-[#111827] flex items-center justify-center shrink-0 shadow-sm">
            <ArrowUpRight size={16} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#111827]">Money request</p>
            <p className="text-[11px] text-[#6B7280]">From {requestData.creatorName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[14px] font-bold text-[#111827]">{targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}</p>
        </div>
      </div>
      
      {requestData.note && (
         <div className="bg-[#F9FAFB] rounded-[8px] p-2.5 mb-3 border border-[#F3F4F6]">
            <p className="text-[11px] text-[#4B5563] italic leading-relaxed">"{requestData.note}"</p>
         </div>
      )}

      {isActionable && (
        <div className="pt-2.5 border-t border-[#F5F5F5] mt-3">
          <div className="flex justify-between items-center text-[11px] font-bold text-[#111827] mb-1.5 mt-1">
            <span>{symbol}{simulatedCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })} collected</span>
            <span className="text-[#111827]">{symbol}{simulatedRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining</span>
          </div>
          <div className="w-full bg-[#F3F4F6] h-[5px] rounded-full overflow-hidden">
            <div className="bg-[#34A853] h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPercentage}%` }} />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex justify-end items-end md:items-center md:pr-3 overflow-hidden bg-[#F5F5F5] md:bg-black/40 md:backdrop-blur-sm">
      
      <div className="relative bg-white w-full md:w-[420px] h-[98dvh] md:h-[92vh] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col p-5 md:p-6 animate-in slide-in-from-bottom-full md:slide-in-from-right duration-300 overflow-hidden mx-auto">
        
        {step !== "PROCESSING" && (
          <button onClick={onClose} className="absolute top-5 right-5 w-7 h-7 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-[#E5E7EB] transition-colors z-50 text-[#111827]">
            <X size={14} strokeWidth={2.5} />
          </button>
        )}

        <div className="flex-1 flex flex-col relative z-10 overflow-y-auto custom-scrollbar pr-1">
          
          {/* STEP 1: INITIAL OVERVIEW */}
          {(step === "VIEW_REQUEST" || step === "SUCCESS" || step === "REJECTED") && (
            <div className="flex-1 flex flex-col animate-in fade-in h-full justify-start">
              
              <div className="flex flex-col items-center mb-5 text-center mt-1 shrink-0">
                <h2 className="text-[18px] font-bold text-[#111827] mb-1.5">
                  {step === "REJECTED" ? "Request has been rejected" : "Payment Request"}
                </h2>
                {step !== "REJECTED" && (
                  <>
                    <p className="text-[12px] text-[#4B5563] font-medium mb-2.5">Request to {requestData.payerEmail || "you"}</p>
                    <h3 className="text-[24px] font-bold text-[#111827] tracking-tight mb-1">
                      {targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}
                    </h3>
                    <p className="text-[11px] text-[#6B7280] font-medium mb-4">Requested by {requestData.creatorName}</p>
                    <div className="inline-flex items-center gap-1.5 border border-[#E5EAEF] px-3.5 py-1 rounded-full text-[11px] font-bold text-[#4B5563] shadow-sm bg-[#FAFBFC]">
                      <div className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-[#34A853]' : 'bg-[#FBBF24]'}`} />
                      {isCompleted ? 'Request paid' : 'Pending payment'}
                    </div>
                  </>
                )}
              </div>

              {renderTimeline()}

              {step !== "REJECTED" && (
                <>
                  {requestData.note && (
                    <div className="bg-[#F9FAFB] border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm text-left w-full">
                      <span className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider mb-1.5 block">Note from creator</span>
                      <p className="text-[12px] text-[#111827] leading-relaxed">"{requestData.note}"</p>
                    </div>
                  )}

                  <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-4 w-full">
                    <div className="flex justify-between items-center text-[12px] font-bold text-[#111827] mb-2.5">
                      <span>{symbol}{collectedAmount.toLocaleString()} collected</span>
                      <span className="text-[#111827]">{symbol}{remainingAmount.toLocaleString()} remaining</span>
                    </div>
                    <div className="w-full bg-[#F3F4F6] h-[6px] rounded-full overflow-hidden mb-3">
                      <div className="bg-[#34A853] h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercentage}%` }} />
                    </div>
                    
                    <div className="flex justify-between items-center pt-2.5 border-t border-[#F5F5F5]">
                      <span className="text-[11px] text-[#6B7280] font-medium">Transaction ID</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[#111827]">{requestData.reference}</span>
                        <button onClick={() => {
                          navigator.clipboard.writeText(requestData.reference);
                          setCopiedTx(true);
                          setTimeout(() => setCopiedTx(false), 2000);
                        }} className="text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors relative">
                          {copiedTx && <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1.5 py-0.5 rounded">Copied!</span>}
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="mt-auto shrink-0 w-full pt-3">
                 {step === "VIEW_REQUEST" && (
                   <>
                     <button onClick={() => setStep("PAY_AMOUNT")} className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all flex justify-center items-center gap-1.5 shadow-md">
                        Approve & Pay Securely
                     </button>
                     <div className="text-center mt-5">
                       <button onClick={() => setStep("REJECT_CONFIRM")} className="text-[12px] font-bold text-[#111827] underline underline-offset-4 hover:text-gray-600 transition-colors">
                         Reject Request
                       </button>
                     </div>
                   </>
                 )}
                 {step === "REJECTED" && (
                   <button onClick={onClose} className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all shadow-md">
                     Close Window
                   </button>
                 )}
                 {step === "SUCCESS" && (
                   <button onClick={onClose} className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all shadow-md">
                     Close Window
                   </button>
                 )}
              </div>
            </div>
          )}

          {/* STEP 2: AMOUNT SELECTION */}
          {step === "PAY_AMOUNT" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full justify-start">
              <h2 className="text-[18px] font-bold text-[#111827] mb-5 shrink-0">Pay this money request</h2>
              <RequestHeaderCard isActionable />

              <div className="mb-5 mt-1 w-full">
                <label className="text-[13px] font-bold text-[#111827] mb-3 block">How much do you want to pay?</label>
                
                <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-4">
                  <div className="flex items-center gap-2.5 border-b border-dashed border-[#D1D4D7] pb-5 mb-5">
                    <span className="text-[20px] font-medium text-[#A3A3A3]">{symbol}</span>
                    <input 
                      type="text" 
                      value={payAmountStr} 
                      onChange={(e) => { setPayAmountStr(formatNum(e.target.value)); setErrorMsg(""); }}
                      className="w-full text-[28px] font-bold text-[#111827] outline-none bg-transparent placeholder-gray-200"
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between gap-1.5">
                    {[10, 20, 30, 40, 50, "Max"].map((pct) => (
                      <button 
                        key={pct}
                        onClick={() => { handlePercentageClick(pct as any); setErrorMsg(""); }}
                        className="flex-1 py-1.5 bg-[#F3F4F6] text-[#4B5563] text-[11px] font-bold rounded-full hover:bg-[#EAEAEA] transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-100 text-red-600 p-3.5 rounded-[12px] text-[12px] font-medium flex items-center gap-2.5 mb-5 animate-in fade-in w-full text-left">
                    <AlertCircle size={15} className="shrink-0" /> {errorMsg}
                  </div>
                )}
              </div>

              <div className="mt-auto shrink-0 w-full pt-3">
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
                   className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                 >
                   Choose Payment Method
                 </button>
                 
                 <div className="text-center mt-5">
                  <a href="#" className="text-[12px] font-bold text-[#111827] underline underline-offset-4 hover:text-gray-600 transition-colors">Need help with this transaction?</a>
                 </div>
              </div>
            </div>
          )}

          {/* STEP 3: PAYMENT METHOD */}
          {step === "PAY_METHOD" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full justify-start">
               <div className="flex items-center gap-2.5 mb-5 shrink-0">
                 <button onClick={() => { setStep("PAY_AMOUNT"); setErrorMsg(""); }} className="p-1.5 bg-[#F3F4F6] rounded-full hover:bg-[#EAEAEA] transition-colors"><ChevronLeft size={16}/></button>
                 <h2 className="text-[18px] font-bold text-[#111827]">Payment Method</h2>
               </div>

               {authNotification && (
                 <div className="bg-[#E5F7ED] border border-[#C6F6D5] text-[#3BA66A] p-3.5 rounded-[12px] text-[12px] font-bold flex items-center gap-2 mb-5 animate-in fade-in slide-in-from-top-2">
                   <Check size={15} strokeWidth={3} className="shrink-0" /> 
                   {authNotification}
                 </div>
               )}
               
               <RequestHeaderCard isActionable={false} />

               <div className="mb-5 mt-1 w-full">
                 <label className="text-[13px] font-bold text-[#111827] mb-3 block">Amount to pay</label>
                 <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-5 bg-[#FAFAFA] opacity-60 pointer-events-none">
                   <div className="flex items-center gap-2.5 border-b border-dashed border-[#D1D4D7] pb-5 mb-5">
                     <span className="text-[20px] font-medium text-[#A3A3A3]">{symbol}</span>
                     <span className="text-[28px] font-bold text-[#111827]">{payAmountStr}</span>
                   </div>
                   <div className="flex items-center justify-between gap-1.5">
                     {[10, 20, 30, 40, 50, "Max"].map((pct) => (
                       <div key={pct} className="flex-1 py-1.5 bg-[#F3F4F6] text-[#A3A3A3] text-[11px] font-bold rounded-full text-center">{pct}%</div>
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

                 <button onClick={handlePayWithBlink} className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold flex justify-center items-center gap-1.5 hover:bg-black transition-all shadow-md mb-5">
                   {localActiveAccount ? (
                     <>
                       <span className="w-1.5 h-1.5 rounded-full bg-[#34A853] shadow-[0_0_4px_#34A853] mr-0.5 animate-pulse"></span>
                       Wallet connected, Pay now <ArrowUpRight size={16} />
                     </>
                   ) : (
                     <>
                       Pay with Blink Balance <ArrowUpRight size={16} />
                     </>
                   )}
                 </button>

                 <div className="flex items-center gap-3 mb-5">
                   <div className="h-[1px] bg-[#EAEAEA] flex-1"></div>
                   <span className="text-[10px] font-bold text-[#A3A3A3] tracking-widest uppercase">OR</span>
                   <div className="h-[1px] bg-[#EAEAEA] flex-1"></div>
                 </div>

                 <div className="space-y-3 w-full">
                   <div onClick={() => handlePublicPayment("External Crypto Wallet")} className="border border-[#EAEAEA] rounded-[14px] p-4 flex justify-between items-center cursor-pointer hover:bg-[#F9FAFB] hover:border-black transition-colors group">
                     <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-black group-hover:text-white transition-colors"><Wallet size={16} /></div>
                        <div>
                          <h4 className="text-[13px] font-bold text-[#111827]">External Wallet or Exchange</h4>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">Metamask, Trustwallet, Binance & more</p>
                        </div>
                     </div>
                     <div className="flex -space-x-2">
                       <div className="w-6 h-6 bg-yellow-100 border-2 border-white rounded-full flex items-center justify-center relative z-30"><span className="text-[8px] font-bold text-yellow-600">BNB</span></div>
                       <div className="w-6 h-6 bg-blue-100 border-2 border-white rounded-full flex items-center justify-center relative z-20"><span className="text-[8px] font-bold text-blue-600">CB</span></div>
                     </div>
                   </div>

                   <div onClick={() => handlePublicPayment("Bank Transfer")} className="border border-[#EAEAEA] rounded-[14px] p-4 flex justify-between items-center cursor-pointer hover:bg-[#F9FAFB] hover:border-black transition-colors group">
                     <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-black group-hover:text-white transition-colors"><Landmark size={16} /></div>
                        <div>
                          <h4 className="text-[13px] font-bold text-[#111827]">Bank Transfers</h4>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">USD, EUR, MXN, ARS, NGN & more</p>
                        </div>
                     </div>
                     <ChevronRight size={16} className="text-[#A3A3A3]" />
                   </div>

                   <div onClick={() => handlePublicPayment("Mobile Money")} className="border border-[#EAEAEA] rounded-[14px] p-4 flex justify-between items-center cursor-pointer hover:bg-[#F9FAFB] hover:border-black transition-colors group">
                     <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-black group-hover:text-white transition-colors"><Smartphone size={16} /></div>
                        <div>
                          <h4 className="text-[13px] font-bold text-[#111827]">Mobile Payments</h4>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">Mpesa, Pix, MoMo & more</p>
                        </div>
                     </div>
                     <ChevronRight size={16} className="text-[#A3A3A3]" />
                   </div>
                 </div>
               </div>
            </div>
          )}

          {/* STEP: DYNAMIC IN-FRAME AUTH PROMPT */}
          {step === "AUTH_PROMPT" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full justify-start">
              <div className="flex items-center gap-2.5 mb-5 shrink-0">
                <button 
                  onClick={() => authMode === "prompt" ? setStep("PAY_METHOD") : setAuthMode("prompt")} 
                  className="p-1.5 bg-[#F3F4F6] rounded-full hover:bg-[#EAEAEA] transition-colors"
                >
                  <ChevronLeft size={16}/>
                </button>
                <h2 className="text-[18px] font-bold text-[#111827]">
                  {authMode === "prompt" ? "Blink Account Required" : authMode === "login" ? "Welcome Back" : "Create Account"}
                </h2>
              </div>

              {authMode === "prompt" ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center pb-8 animate-in fade-in">
                  <div className="w-16 h-16 bg-[#F9FAFB] rounded-full flex items-center justify-center mb-5 shadow-sm border border-[#EAEAEA]">
                     <Wallet size={24} className="text-[#111827]" />
                  </div>
                  <h3 className="text-[18px] font-bold text-[#111827] mb-1.5">Log in to Pay Securely</h3>
                  <p className="text-[13px] text-[#6B7280] leading-relaxed max-w-[260px]">
                    To process this payment instantly using Blink Balance, log in or create a free account.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-start pt-3 animate-in slide-in-from-right-4">
                  {authMode === "signup" && (
                    <div className="mb-3.5">
                      <label className="text-[12px] font-bold text-[#111827] mb-1.5 block">Full Name</label>
                      <input 
                        type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Timi Fred"
                        className="w-full border border-[#EAEAEA] rounded-[12px] px-3.5 py-2.5 text-[13px] outline-none focus:border-black bg-[#FAFAFA] focus:bg-white transition-colors"
                      />
                    </div>
                  )}
                  <div className="mb-3.5">
                    <label className="text-[12px] font-bold text-[#111827] mb-1.5 block">Email Address</label>
                    <input 
                      type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="hello@example.com"
                      className="w-full border border-[#EAEAEA] rounded-[12px] px-3.5 py-2.5 text-[13px] outline-none focus:border-black bg-[#FAFAFA] focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="mb-5">
                    <label className="text-[12px] font-bold text-[#111827] mb-1.5 block">Password</label>
                    <input 
                      type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••"
                      className="w-full border border-[#EAEAEA] rounded-[12px] px-3.5 py-2.5 text-[13px] outline-none focus:border-black bg-[#FAFAFA] focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              )}

              <div className="mt-auto shrink-0 w-full pt-3 space-y-2.5 border-t border-transparent bg-white">
                {authMode === "prompt" ? (
                  <>
                    <button onClick={() => setAuthMode("login")} className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold hover:bg-black transition-all shadow-md">
                      Log in to Blink
                    </button>
                    <button onClick={() => setAuthMode("signup")} className="w-full py-3.5 bg-white border-[1.5px] border-[#EAEAEA] text-[#111827] rounded-[12px] text-[13px] font-bold hover:bg-[#F9FAFB] transition-all shadow-sm">
                      Create an account
                    </button>
                  </>
                ) : (
                  <button 
                    disabled={!authEmail || !authPass || (authMode === 'signup' && !authName)}
                    onClick={handleQuickAuth} 
                    className="w-full py-3.5 bg-[#111827] text-white rounded-[12px] text-[13px] font-bold flex justify-center items-center gap-1.5 hover:bg-black transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin text-gray-500" /> : authMode === 'login' ? "Secure Log in" : "Create Account"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: REJECT CONFIRMATION */}
          {step === "REJECT_CONFIRM" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full justify-start">
              <h2 className="text-[18px] font-bold text-[#111827] mb-5">Reject this money request?</h2>
              
              <div className="border border-[#EAEAEA] rounded-[16px] p-4 mb-6 bg-white w-full shadow-sm">
                <div className="flex gap-3 items-center mb-4">
                  <div className="w-9 h-9 rounded-full border border-blue-100 bg-blue-50 text-blue-500 flex items-center justify-center">
                    <ArrowUpRight size={16} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#111827]">Money request</p>
                    <p className="text-[11px] text-[#6B7280]">From {requestData.creatorName}</p>
                  </div>
                </div>
                <div className="border-t border-[#EAEAEA] pt-3 flex justify-between items-center">
                  <span className="text-[12px] text-[#6B7280]">Total Amount</span>
                  <span className="text-[14px] font-bold text-[#111827]">{targetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {requestData.fiatCurrency}</span>
                </div>
              </div>
              
              <div className="w-full mb-6">
                <label className="text-[13px] font-bold text-[#111827] mb-2.5 block">Reason of Rejection <span className="text-red-500">*</span></label>
                <textarea 
                  value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="E.g., this request is coming at the wrong time, no money on ground buddy"
                  className="w-full min-h-[120px] resize-none border border-[#D1D4D7] rounded-[14px] p-4 bg-white outline-none focus:border-black transition-colors text-[13px] shadow-inner"
                />
              </div>
              
              <div className="mt-auto shrink-0 w-full pt-4 flex gap-3">
                <button onClick={() => setStep("VIEW_REQUEST")} className="flex-1 py-3.5 bg-white border border-[#111827] text-[#111827] rounded-[12px] text-[13px] font-bold hover:bg-gray-50 transition-all active:scale-[0.98]">
                  Back
                </button>
                <button onClick={handleReject} disabled={isProcessing || !rejectNote} className={`flex-1 py-3.5 rounded-[12px] text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${rejectNote ? 'bg-[#111827] text-white hover:bg-black shadow-md' : 'bg-[#EAEAEA] text-[#A3A3A3]'}`}>
                   {isProcessing ? <Loader2 size={16} className="animate-spin text-gray-500" /> : "Reject Request"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PROCESSING */}
          {step === "PROCESSING" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-300 py-16 h-full">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#2775CA] rounded-full animate-ping opacity-20"></div>
                <div className="w-16 h-16 bg-[#E8F0FE] rounded-full flex items-center justify-center relative z-10 border-[3px] border-white shadow-sm">
                  <Loader2 size={28} className="text-[#2775CA] animate-spin" />
                </div>
              </div>
              <h2 className="text-[16px] font-bold text-[#111827] mb-1.5">Processing Payment...</h2>
              <p className="text-[12px] text-[#6B7280]">Please wait while we secure your transaction.</p>
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
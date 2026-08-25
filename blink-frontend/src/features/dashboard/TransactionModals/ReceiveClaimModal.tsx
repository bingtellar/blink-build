import { useState, useEffect, ReactElement, useMemo } from "react";
import { 
  X, Loader2, ArrowDownLeft, Check, AlertCircle, Clock, ShieldCheck, Wallet, Landmark, ChevronLeft, Lock
} from "lucide-react"; 
import { TransactionData, parseTransactionData } from "./TransactionUtils";
import { useStore } from "../../../store/useStore";

// SECURITY IMPORTS
// import { Keypair } from "@stellar/stellar-sdk";
// import { LocalCryptoUtil } from "../../../utils/LocalCryptoUtil";
import { api } from "../../../lib/api";
import { EscrowPayment, getPlatformFees } from "../../../utils/mockDatabase";

interface ReceiveClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionData | null;
}

type Step = "VIEW" | "DESTINATION" | "AUTH" | "PROCESSING" | "SUCCESS";

export const ReceiveClaimModal = ({
  isOpen, onClose, transaction
}: ReceiveClaimModalProps): ReactElement | null => {
  
  // 🌟 THE REAL-TIME ENGINE: Tap into the global store
  const transactions = useStore((state) => state.transactions) as any[];
  
  const [step, setStep] = useState<Step>("VIEW");
  const [paymentData, setPaymentData] = useState<EscrowPayment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [txHash, setTxHash] = useState("");

  // 🌟 THE REAL-TIME INTERCEPTOR: The "Stale Modal" Preventer
  const liveTx = useMemo(() => {
    if (!transaction) return null;
    const fresh = transactions.find((t: any) => 
      String(t.id) === String(transaction.id) || 
      (t.reference && String(t.reference) === String(transaction.reference))
    );
    return fresh ? { ...transaction, ...fresh } : transaction;
  }, [transaction, transactions]);

  // 🌟 FIX 1: THE TRUE DATA SYNC
  // Bypasses the raw transaction string and fetches the cryptographic truth from the Escrow API
  useEffect(() => {
    if (isOpen && liveTx) {
      const rawRef = liveTx.reference || String(liveTx.id);
      const claimId = rawRef.replace("_incoming", "").replace("_deposit_settlement", "");

      // 1. Fetch exact truth from the database (Joins user tables for exact Sender Name)
      api.get(`/escrows/${claimId}`)
        .then((res) => {
           const realEscrow = res.data;
           setPaymentData({
              id: liveTx.id,
              claimId: realEscrow.claimId,
              senderName: realEscrow.senderName || "Sender",
              recipientEmail: realEscrow.recipientEmail || liveTx.recipientEmail || "N/A",
              // Enforce float conversion to strip trailing zeros
              amount: parseFloat(realEscrow.amountLocked || liveTx.amount) || 0,
              feeAmount: parseFloat(realEscrow.feeAmount || (liveTx as any).feeAmount) || 0,
              status: realEscrow.status === 'claim_completed' || realEscrow.status === 'completed' ? 'claim_completed' : realEscrow.status,
              dateCreated: realEscrow.createdAt || liveTx.createdAt || new Date().toISOString(),
              note: realEscrow.note || liveTx.note || "",
              claimableAfter: realEscrow.claimableAfter || null,
              dueDate: realEscrow.dueDate || realEscrow.expiryDate || null,
              yieldRecipient: realEscrow.yieldRecipient || "split",
              estimatedYield: parseFloat(realEscrow.estimatedYield || "0") || 0,
           } as any);
        })
        .catch(() => {
           // 2. Fallback to local parsing if network fails
           let parsedMeta = liveTx.metadata || {};
           if (typeof liveTx.note === 'string' && liveTx.note.trim().startsWith('{')) {
               try { parsedMeta = { ...parsedMeta, ...JSON.parse(liveTx.note) }; } catch(e){}
           }
           const senderNameRaw = parsedMeta.senderName || liveTx.description?.replace(/^(Incoming Payment from|Payment from)\s+/i, "").trim() || "Sender";

           setPaymentData({
               id: liveTx.id,
               claimId: claimId,
               senderName: senderNameRaw,
               recipientEmail: liveTx.recipientEmail || "N/A",
               amount: parseFloat(liveTx.amount) || 0,
               feeAmount: parseFloat((liveTx as any).feeAmount || parsedMeta.feeAmount) || 0,
               status: liveTx.status === 'completed' || liveTx.trackingState === 'claim_completed' ? 'claim_completed' : liveTx.status,
               dateCreated: liveTx.date || liveTx.createdAt || new Date().toISOString(),
               note: typeof liveTx.note === 'string' && !liveTx.note.startsWith('{') ? liveTx.note : (liveTx.memo || ""),
               claimableAfter: parsedMeta.claimableAfter || null,
               dueDate: parsedMeta.dueDate || null,
               yieldRecipient: parsedMeta.yieldRecipient || "none",
               estimatedYield: parseFloat(parsedMeta.estimatedYield) || 0,
           } as any);
        });
    }
  }, [isOpen, liveTx]);

  // 🌟 FIX 2: UI INITIALIZATION ONLY
  // This ensures the modal ONLY resets to step 1 when it is FIRST opened!
  useEffect(() => {
    if (isOpen) {
      setStep("VIEW");
      setErrorMsg("");
      setSelectedDestination(null);
      setOtpInput("");
      setTxHash("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, transaction?.id]);

  if (!isOpen || !liveTx || !paymentData) return null;

  const { isFiat } = parseTransactionData(liveTx);
  const symbol = isFiat ? (liveTx.fiatCurrency === "NGN" ? "₦" : "$") : "$";
  
  // Force parsing to float to prevent Postgres String display bugs ($13.0000000 -> $13.00)
  const displayAmount = isFiat ? parseFloat(liveTx.fiatAmount || "0") : parseFloat(liveTx.amount || "0");
  const currencyStr = isFiat ? liveTx.fiatCurrency : "USDC";

  const isCompleted = paymentData.status === "claim_completed";
  const isCancelled = paymentData.status === "claim_canceled" || paymentData.status === "claim_expired";

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "None";
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59`);
    if (isNaN(d.getTime())) return "None";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  let isLocked = false;
  let unlockDateStr = "";
  let claimableDisplay = "Claimable Now";

  if (paymentData.claimableAfter && !isCompleted && !isCancelled) {
    const unlockTime = new Date(paymentData.claimableAfter).getTime();
    if (Date.now() < unlockTime) {
      isLocked = true;
      unlockDateStr = formatDateTime(paymentData.claimableAfter);
      claimableDisplay = unlockDateStr;
    }
  }

  const expiryDisplay = paymentData.dueDate ? formatDateTime(paymentData.dueDate) : "None";

  // Map actual earned yield if completed, otherwise fall back to the pre-claim estimation
  let recipientYield = 0;
  const parsedMeta = typeof liveTx.metadata === 'string' ? JSON.parse(liveTx.metadata) : (liveTx.metadata || {});
  
  if (isCompleted && parsedMeta.yieldDistributed !== undefined) {
      recipientYield = parseFloat(parsedMeta.yieldDistributed);
  } else {
      if (paymentData.yieldRecipient === "split") recipientYield = paymentData.estimatedYield / 2;
      else if (paymentData.yieldRecipient === "recipient") recipientYield = paymentData.estimatedYield;
  }
  
  const daysInEscrow = Math.max(0, Math.floor((Date.now() - new Date(paymentData.dateCreated).getTime()) / (1000 * 60 * 60 * 24)));

  // 🌟 FIX: Dynamically waive the fee if they choose the internal Blink Balance!
  // If they haven't selected anything yet, default to 0 so the initial view looks appealing.
  const isInternalClaim = !selectedDestination || selectedDestination === "Blink Balance";
  const processingFeeRate = isInternalClaim ? 0 : getPlatformFees().processing;
  
  const claimFeeAmount = Math.min(processingFeeRate, paymentData.amount);
  const netPrincipal = paymentData.amount - claimFeeAmount;
  const finalTotalToReceive = netPrincipal + recipientYield;

  const exchangeRate = (isFiat && liveTx.fiatAmount) ? (liveTx.fiatAmount / paymentData.amount) : 1;
  const displayPrincipal = paymentData.amount * exchangeRate;
  const displayFee = claimFeeAmount * exchangeRate;
  const displayYield = recipientYield * exchangeRate;
  const displayFinalTotal = finalTotalToReceive * exchangeRate;

  // =======================================================================
  // 🚀 PRODUCTION API INTEGRATION: Cryptographic Internal Settlement
  // =======================================================================
  const handleClaim = async () => {
    if (otpInput.length < 6) return;
    setErrorMsg("");
    setIsProcessing(true);
    setStep("PROCESSING");

    try {
        const rawRef = liveTx.reference || String(liveTx.id);
        const claimId = rawRef.replace("_incoming", "");

        // 🌟 FIX: Send the Claim Code directly to the backend
        const res = await api.post(`/escrows/${claimId}/claim-internal`, {
            claimCode: otpInput
        });

        // 4. Success! Update UI
        setTxHash(res.data.transaction_hash);
        
        // 🌟 TS FIX: Removed manual updateBalance. 
        // This single event triggers the whole dashboard to sync the exact correct balance from the DB!
        window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
        
        setStep("SUCCESS");
    } catch (error: any) {
        setErrorMsg(error.response?.data?.error || error.message || "Failed to process claim.");
        setStep("AUTH"); 
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="relative bg-white w-full md:w-[420px] h-[95vh] md:h-[98vh] mt-auto md:mt-[1vh] md:mr-[1vw] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col p-4 md:p-5 animate-drawer-bottom md:animate-drawer-right z-[101]">
        
        {step !== "PROCESSING" && (
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-[#E5E7EB] transition-colors z-50 text-[#111827]">
            <X size={16} strokeWidth={2.5} />
          </button>
        )}

        <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden pr-1 pb-1">
          
          {/* STEP 1: VIEW DETAILS */}
          {(step === "VIEW" || step === "SUCCESS") && (
            <div className="flex-1 flex flex-col animate-in fade-in h-full">
              <div className="flex flex-col items-center mb-6 text-center mt-2 shrink-0">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors duration-500 ${isCompleted ? 'bg-[#F2FDF5] text-[#34A853]' : isCancelled ? 'bg-red-50 text-red-500' : 'bg-[#F9FAFB] text-[#111827] border border-[#EAEAEA]'}`}>
                  {isCompleted ? <Check size={24} strokeWidth={3} className="animate-in zoom-in" /> : isCancelled ? <X size={24} strokeWidth={3} className="animate-in zoom-in" /> : <ArrowDownLeft size={24} strokeWidth={2.5} />}
                </div>
                <h2 className="text-[18px] font-bold text-[#111827] mb-1">
                  {isCompleted ? "Payment Claimed" : isCancelled ? "Payment Cancelled" : "Incoming Payment"}
                </h2>
                
                {step !== "SUCCESS" && (
                  <>
                    <p className="text-[12px] text-[#4B5563] font-medium mb-2">From {paymentData.senderName}</p>
                    <h3 className="text-[28px] font-bold text-[#111827] tracking-tight mb-1">
                      {symbol}{displayAmount?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[16px] text-[#6B7280] font-medium">{currencyStr}</span>
                    </h3>
                  </>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-start w-full overflow-y-auto custom-scrollbar">

                 {/* 🌟 FIX: Dynamic Terminology UX Updates */}
                 <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-4 w-full bg-white shadow-sm">
                   <div className="flex items-center gap-2 mb-4">
                     <ShieldCheck size={16} className="text-[#34A853]" />
                     <span className="text-[13px] font-bold text-[#111827]">
                       {isCompleted ? "Settlement Details" : "Escrow Security"}
                     </span>
                   </div>
                   
                   <div className="space-y-4">
                     <div className="flex justify-between items-center">
                       <span className="text-[12px] text-[#6B7280]">
                         {isCompleted ? "Claim Status" : "Claimable"}
                       </span>
                       <span className={`text-[12px] font-bold ${isCompleted ? "text-[#34A853]" : (claimableDisplay === "Claimable Now" ? "text-[#34A853]" : "text-amber-600")}`}>
                         {isCompleted ? "Successfully Claimed" : claimableDisplay}
                       </span>
                     </div>

                     <div className="flex justify-between items-center">
                       <span className="text-[12px] text-[#6B7280]">
                         {isCompleted ? "Settled On" : "Expires On"}
                       </span>
                       <span className="text-[12px] font-bold text-[#111827]">
                         {isCompleted ? formatDateTime((liveTx as any).updatedAt || paymentData.dateCreated) : expiryDisplay}
                       </span>
                     </div>

                     <div className="flex justify-between items-center pt-3 border-t border-[#F5F5F5]">
                       <span className="text-[12px] text-[#6B7280]">
                         {isCompleted ? "Total Time in Escrow" : "Time in Escrow"}
                       </span>
                       <span className="text-[12px] font-bold text-[#111827]">{daysInEscrow} {daysInEscrow === 1 ? 'day' : 'days'}</span>
                     </div>
                     
                     <div className="flex justify-between items-center">
                       <span className="text-[12px] text-[#6B7280]">
                         {isCompleted ? "Total Yield Earned" : "Yield Generated for You"}
                       </span>
                       <span className={`text-[12px] font-bold ${recipientYield > 0 ? 'text-[#34A853]' : 'text-[#111827]'}`}>
                         +{recipientYield.toLocaleString("en-US", {minimumFractionDigits: 4, maximumFractionDigits: 4})} USDC
                       </span>
                     </div>
                   </div>
                 </div>

                 {isLocked && (
                   <div className="bg-amber-50 border border-amber-200 rounded-[12px] p-4 flex items-start gap-3 mb-4">
                     <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />
                     <div>
                       <h4 className="text-[13px] font-bold text-amber-800">Payment is Time-Locked</h4>
                       <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                         The sender has locked these funds in escrow. They will become available for you to claim on <strong>{unlockDateStr}</strong>.
                       </p>
                     </div>
                   </div>
                 )}

                 {/* 🌟 FIX: Note card moved down below the Escrow Security card */}
                 {/* 🌟 Hides system-generated placeholder notes */}
                 {paymentData.note && !paymentData.note.toLowerCase().includes("payment to") && !paymentData.note.toLowerCase().includes("bulk escrow") && (
                   <div className="bg-[#F9FAFB] border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm text-left w-full">
                     <span className="text-[11px] text-[#6B7280] font-bold uppercase tracking-wider mb-1.5 block">Note from Sender</span>
                     <p className="text-[13px] text-[#111827] leading-relaxed">"{paymentData.note}"</p>
                   </div>
                 )}
              </div>

              <div className="mt-auto shrink-0 w-full pt-4 flex flex-col gap-3">
                 {/* 1. Only show "Claim Payment" if it is strictly un-claimed */}
                 {step === "VIEW" && !isCompleted && !isCancelled && (
                   <button 
                     disabled={isLocked}
                     onClick={() => setStep("DESTINATION")} 
                     className="w-full py-4 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                   >
                     {isLocked ? `Unlocks on ${unlockDateStr}` : "Claim Payment"}
                   </button>
                 )}

                 {/* 🌟 2. THE UI FIX: Show the sleek green receipt if the ledger marks it as claimed */}
                 {(isCompleted || step === "SUCCESS") && (
                   <div className="w-full bg-[#E6F4EA] border border-[#CEEAD6] p-4 rounded-[16px] flex items-center justify-center gap-2 shadow-sm">
                       <ShieldCheck size={18} className="text-[#34A853]" />
                       <span className="text-[#111827] text-[14px] font-bold">
                           Payment Claimed on {
                               new Date((liveTx as any).updatedAt || paymentData.dateCreated).toLocaleDateString('en-US', {
                                   month: 'short', day: 'numeric', year: 'numeric'
                               })
                           }
                       </span>
                   </div>
                 )}

                 {/* 3. Always provide a way to close the modal */}
                 {(step === "SUCCESS" || isCompleted || isCancelled) && (
                   <button onClick={onClose} className="w-full py-4 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all">
                     Back to Dashboard
                   </button>
                 )}
              </div>
            </div>
          )}

          {/* STEP 2: WITHDRAWAL DESTINATION */}
          {step === "DESTINATION" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full">
               <div className="flex items-center gap-3 mb-6 shrink-0 pt-1">
                 <button onClick={() => { setStep("VIEW"); setErrorMsg(""); }} className="p-1.5 bg-[#F3F4F6] rounded-full hover:bg-[#E5E7EB]"><ChevronLeft size={16}/></button>
                 <h2 className="text-[18px] font-bold text-[#111827]">Where to receive?</h2>
               </div>

               <div className="flex-1 flex flex-col justify-start w-full overflow-y-auto custom-scrollbar">
                 <p className="text-[13px] text-[#6B7280] mb-4">Select where you want to deposit this payment.</p>

                 <div className="bg-[#F9FAFB] rounded-[16px] p-4 mb-5 border border-[#EAEAEA]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[12px] text-[#6B7280]">Principal Amount</span>
                      <span className="text-[12px] font-medium text-[#111827]">{symbol}{displayPrincipal.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[12px] text-[#6B7280]">Processing Fee</span>
                      {displayFee > 0 ? (
                        <span className="text-[12px] font-medium text-red-500">-{symbol}{displayFee.toFixed(2)}</span>
                      ) : (
                        <span className="text-[12px] font-medium text-red-500">-{symbol}0.00</span>
                      )}
                    </div>

                    {displayYield > 0 && (
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] text-[#6B7280]">Yield Earned</span>
                        <span className="text-[12px] font-medium text-[#34A853]">+{symbol}{displayYield.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-[#EAEAEA] mt-3">
                      <span className="text-[13px] font-bold text-[#111827]">Total to Receive</span>
                      <span className="text-[14px] font-bold text-[#111827]">{symbol}{displayFinalTotal.toFixed(2)}</span>
                    </div>
                 </div>
                 
                 <div className="space-y-3 w-full pb-4">
                   <div onClick={() => setSelectedDestination("Blink Balance")} className={`border rounded-[14px] p-4 flex justify-between items-center cursor-pointer transition-colors group ${selectedDestination === 'Blink Balance' ? 'border-black bg-[#FAFAFA]' : 'border-[#EAEAEA] hover:border-gray-400 bg-white'}`}>
                     <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${selectedDestination === 'Blink Balance' ? 'bg-[#111827] text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}><Wallet size={18} /></div>
                        <div>
                          <h4 className="text-[14px] font-bold text-[#111827]">Blink Balance</h4>
                          <p className="text-[11px] text-[#34A853] mt-0.5 font-medium">Instant & Zero Fees</p>
                        </div>
                     </div>
                     <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedDestination === 'Blink Balance' ? 'border-[#111827] bg-[#111827]' : 'border-[#D1D5DB]'}`}>
                        {selectedDestination === 'Blink Balance' && <Check size={12} strokeWidth={4} className="text-white" />}
                     </div>
                   </div>

                   <div onClick={() => setSelectedDestination("External Crypto Wallet")} className={`border rounded-[14px] p-4 flex justify-between items-center cursor-pointer transition-colors group opacity-60 pointer-events-none ${selectedDestination === 'External Crypto Wallet' ? 'border-black bg-[#FAFAFA]' : 'border-[#EAEAEA] bg-white'}`}>
                     <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500"><Wallet size={18} /></div>
                        <div>
                          <h4 className="text-[14px] font-bold text-[#111827]">External Wallet</h4>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">Binance, Metamask, etc.</p>
                        </div>
                     </div>
                   </div>
                   
                   <div onClick={() => setSelectedDestination("Bank Account")} className={`border rounded-[14px] p-4 flex justify-between items-center cursor-pointer transition-colors group opacity-60 pointer-events-none ${selectedDestination === 'Bank Account' ? 'border-black bg-[#FAFAFA]' : 'border-[#EAEAEA] bg-white'}`}>
                     <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500"><Landmark size={18} /></div>
                        <div>
                          <h4 className="text-[14px] font-bold text-[#111827]">Bank Account</h4>
                          <p className="text-[11px] text-[#6B7280] mt-0.5">Local fiat withdrawal</p>
                        </div>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="mt-auto shrink-0 w-full pt-4">
                 <button 
                   disabled={!selectedDestination}
                   onClick={() => setStep("AUTH")} 
                   className="w-full py-4 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Continue
                 </button>
               </div>
            </div>
          )}

          {/* STEP 3: AUTHENTICATION PROMPT */}
          {step === "AUTH" && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 h-full">
               <div className="flex items-center gap-3 mb-6 shrink-0 pt-1">
                 <button onClick={() => { setStep("DESTINATION"); setErrorMsg(""); }} className="p-1.5 bg-[#F3F4F6] rounded-full hover:bg-[#E5E7EB]"><ChevronLeft size={16}/></button>
                 <h2 className="text-[18px] font-bold text-[#111827]">Secure Claim</h2>
               </div>

               <div className="flex-1 flex flex-col justify-start w-full">
                 <div className="bg-[#F9FAFB] rounded-[16px] p-6 mb-6 text-center border border-[#EAEAEA]">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-[#EAEAEA] shadow-sm">
                      <Lock size={20} className="text-[#111827]" />
                    </div>
                    <h3 className="text-[15px] font-bold text-[#111827] mb-2">Authentication Required</h3>
                    <p className="text-[12px] text-[#6B7280] leading-relaxed">
                      To safely release these funds from escrow, please enter the secure claim code provided by the sender.
                    </p>
                 </div>

                 <label className="text-[13px] font-bold text-[#111827] mb-2 block">Secure Claim Code</label>
                 <input 
                   type="password" 
                   maxLength={6}
                   value={otpInput}
                   onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '')); setErrorMsg(""); }}
                   placeholder="••••••"
                   className="w-full border border-[#D1D5DB] rounded-[14px] px-4 py-3.5 text-[24px] text-center outline-none focus:border-black bg-white transition-colors tracking-[0.4em] font-mono font-bold"
                 />
                 
                 {errorMsg && (
                  <div className="bg-red-50 text-red-600 p-3.5 rounded-[12px] text-[12px] font-medium flex items-center gap-2 mt-4 animate-in fade-in">
                    <AlertCircle size={16} className="shrink-0" /> {errorMsg}
                  </div>
                 )}
               </div>

               <div className="mt-auto shrink-0 w-full pt-4">
                 <button 
                   disabled={!otpInput || isProcessing}
                   onClick={handleClaim} 
                   className="w-full py-4 bg-[#111827] text-white rounded-[16px] text-[14px] font-bold hover:bg-black transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Confirm Claim
                 </button>
               </div>
            </div>
          )}

          {/* STEP 4: PROCESSING */}
          {step === "PROCESSING" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-300 py-10 h-full">
              <Loader2 size={40} className="text-[#111827] animate-spin mb-6" />
              <h2 className="text-[18px] font-bold text-[#111827]">Verifying & Processing...</h2>
              <p className="text-[13px] text-[#6B7280] mt-2">Releasing funds from escrow securely.</p>
              
              {txHash && (
                <div className="mt-6 bg-[#F9FAFB] border border-[#EAEAEA] rounded-[12px] p-3 animate-in fade-in max-w-[90%]">
                  <p className="text-[10px] text-[#A3A3A3] font-bold uppercase tracking-wider mb-1">Blockchain Hash</p>
                  <p className="text-[12px] font-mono text-[#111827] truncate">{txHash}</p>
                </div>
              )}
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
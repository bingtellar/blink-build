import { useState } from "react";
import {
    X, Link, 
    List, Landmark, Check, Lock, AlertCircle, Clock, ChevronLeft, Loader2
} from "lucide-react";
import { EscrowPayment } from "./ClaimPage"; // 🌟 Cleaned up import

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface PaymentInviteProps {
  paymentData: EscrowPayment; 
  onAccept: () => void;
  onClose?: () => void;
}

export const PaymentInvite = ({ paymentData, onAccept, onClose }: PaymentInviteProps) => {
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "None";
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59`);
    if (isNaN(d.getTime())) return "None";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const isCompleted = paymentData.status === "claim_completed" || paymentData.status === "completed";
  const isCancelled = paymentData.status === "claim_canceled" || paymentData.status === "claim_expired";

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

  const handleRevealSecurity = () => {
    if (isLocked) {
      setErrorMsg(`This payment is locked in escrow until ${unlockDateStr}.`);
      return;
    }
    setShowOtp(true);
  };

  // 🌟 API-DRIVEN CLAIM CODE VERIFICATION
  const handleVerifyOtp = async () => {
    setIsVerifying(true);
    setErrorMsg("");
    
    try {
      // 🌟 THE FIX: Pointing to the dedicated Claim Code endpoint
      const res = await fetch(`${API_BASE}/escrows/${paymentData.id}/verify-claim-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }) 
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Incorrect security code. Please try again.");
      }

      // 🛡️ FIX: Advance the screen without calling setIsVerifying(false) to prevent React memory leak
      onAccept(); 
    } catch (e: any) {
      setErrorMsg(e.message);
      setIsVerifying(false); // Only release the loading spinner if validation failed
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F5F4F0] flex flex-col font-sans text-[#1A1A1A] animate-in fade-in duration-300">
      
      <header className="w-full px-6 sm:px-12 py-6 flex items-center justify-between">
        <h1 className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-[#1A1A1A]">
          Blink
        </h1>
        <button
          onClick={onClose}
          className="w-9 h-9 bg-black/5 hover:bg-black/10 rounded-full flex items-center justify-center transition-colors"
        >
          <X size={18} className="text-[#1A1A1A]" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start sm:justify-center pt-8 sm:pt-0 px-4 sm:px-6 w-full max-w-[560px] mx-auto pb-12">
        <div className="bg-white w-full rounded-[12px] border border-[#EAEAEA] py-12 px-6 sm:py-16 sm:px-10 shadow-[0px_4px_24px_rgba(0,0,0,0.02)] overflow-hidden relative">
          
          {!showOtp ? (
            <div className="animate-in slide-in-from-left-4 duration-300">
              <div className="w-10 h-10 bg-[#FEF3C7] rounded-full flex items-center justify-center mb-5">
                <Link size={16} strokeWidth={2} className="text-[#1A1A1A]" />
              </div>

              <h2 className="text-[18px] sm:text-[22px] font-bold text-[#1A1A1A] mb-2 tracking-tight">
                {paymentData.senderName} sent you ${paymentData.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className="text-[14px] text-[#6B7280] leading-relaxed mb-6">
                It's a secure money link. You can claim these funds directly to your bank, mobile money, or an external stablecoins wallet.
              </p>

              {(isLocked || expiryDisplay !== "None") ? (
                <div className="bg-[#F9FAFB] border border-[#EAEAEA] rounded-[12px] p-4 mb-8 animate-in fade-in">
                   <div className="flex items-center gap-2 mb-3 border-b border-[#EAEAEA] pb-3">
                     <Clock size={16} className="text-[#6B7280]" />
                     <span className="text-[13px] font-semibold text-[#111827]">Escrow Terms</span>
                   </div>
                   
                   <div className="space-y-3">
                     <div className="flex justify-between items-center">
                       <span className="text-[13px] text-[#6B7280]">Claimable</span>
                       <span className={`text-[13px] font-bold ${claimableDisplay === "Claimable Now" ? "text-[#34A853]" : "text-amber-600"}`}>
                         {claimableDisplay}
                       </span>
                     </div>

                     <div className="flex justify-between items-center">
                       <span className="text-[13px] text-[#6B7280]">Expires On</span>
                       <span className="text-[13px] font-bold text-[#111827]">{expiryDisplay}</span>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-4 mb-8 border-l-2 border-black/5 pl-4 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-[#6B7280]"><List size={14} /></div>
                    <p className="text-[13px] text-[#4B5563] leading-snug">Pick your preferred receiving currency.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-[#6B7280]"><Landmark size={14} /></div>
                    <p className="text-[13px] text-[#4B5563] leading-snug">Enter your bank or wallet details.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-[#1A1A1A]"><Check size={14} strokeWidth={2.5} /></div>
                    <p className="text-[13px] text-[#4B5563] leading-snug">Verify securely and get your money instantly.</p>
                  </div>
                </div>
              )}

              {errorMsg && !showOtp && (
                <div className="flex items-start gap-2 mb-6 text-amber-600 bg-amber-50 p-3 rounded-[8px] animate-in fade-in border border-amber-100">
                  <Clock size={16} className="shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium leading-snug">{errorMsg}</p>
                </div>
              )}

              <button
                disabled={isLocked}
                onClick={handleRevealSecurity}
                className="w-full py-3.5 rounded-[10px] font-semibold text-[14px] bg-[#1A1A1A] text-white hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLocked ? "Currently Time-Locked" : "Claim money now"}
              </button>
            </div>
          ) : (
            
            <div className="animate-in slide-in-from-right-4 duration-300">
              <button 
                onClick={() => { setShowOtp(false); setErrorMsg(""); setOtp(""); }}
                className="absolute top-6 left-6 text-[#6B7280] hover:text-[#1A1A1A] transition-colors"
                disabled={isVerifying}
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex justify-center mb-5 mt-4">
                <div className="w-12 h-12 bg-[#F5F4F0] rounded-full flex items-center justify-center">
                  <Lock size={18} className="text-[#1A1A1A]" />
                </div>
              </div>
              
              <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#1A1A1A] mb-3 tracking-tighter text-center">
                Security Verification
              </h2>
              
              {/* 🌟 TEXT COPY FIX: Aligned with Out-Of-Band Architecture */}
              <p className="text-[14px] text-[#4B5563] leading-relaxed mb-8 text-center max-w-[300px] mx-auto">
                Let's make sure it's really you. Please enter the 6-digit authentication code below provided by <span className="font-semibold text-[#1A1A1A]">{paymentData.senderName}</span>.
              </p>
              
              <input 
                type="text" 
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, ''));
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder="• • • • • •"
                disabled={isVerifying}
                className={`w-full border rounded-[10px] py-4 text-center text-[22px] sm:text-[26px] font-bold tracking-[0.5em] outline-none mb-4 transition-colors ${
                  errorMsg ? "border-red-400 focus:border-red-500 bg-red-50" : "border-[#D1D4D7] focus:border-black"
                }`}
              />
              
              {errorMsg && (
                <div className="flex items-center justify-center gap-1.5 mb-6 text-red-500 animate-in fade-in">
                  <AlertCircle size={14} />
                  <p className="text-[12.5px] font-medium">{errorMsg}</p>
                </div>
              )}
              
              <button 
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || isVerifying}
                className="w-full bg-[#1A1A1A] text-white py-3.5 rounded-[10px] font-medium text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black transition-all active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
              >
                {isVerifying ? <Loader2 size={16} className="animate-spin" /> : "Verify Code"}
              </button>
            </div>
          )}

        </div>
      </main>

      <footer className="w-full text-center pb-8 px-4">
        <p className="text-[12px] text-[#6B7280]">
          All Blinks are non-custodial. Blink does not and cannot access your digital assets.
        </p>
      </footer>
    </div>
  );
};
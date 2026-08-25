import React, { useMemo } from "react";
import { X, Link2Off, Calendar } from "lucide-react";
import { EscrowPayment } from "./ClaimPage"; // 🌟 Cleaned up import

interface PaymentAlreadyExpiredProps {
  paymentData?: EscrowPayment | null; 
  onClose?: () => void;
  onLearnMore?: () => void;
}

export const PaymentAlreadyExpired = ({ paymentData, onClose, onLearnMore }: PaymentAlreadyExpiredProps) => {
  
  const expiredDateStr = useMemo(() => {
    if (!paymentData?.timeline) return null;
    
    const terminalEvent = paymentData.timeline.find(
      e => e.state === "claim_expired" || e.state === "claim_canceled" || e.state === "canceled_expired"
    );
    
    if (terminalEvent) {
      return new Date(terminalEvent.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    return null;
  }, [paymentData]);

  const amountDisplay = paymentData 
    ? ` ${paymentData.currency?.toUpperCase().includes("USD") ? "$" : ""}${paymentData.amount.toLocaleString()} `
    : " ";

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

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 w-full max-w-[560px] mx-auto pb-12">
        <div className="bg-white w-full rounded-[12px] border border-black py-16 px-6 sm:py-20 sm:px-16 shadow-[0px_4px_24px_rgba(0,0,0,0.02)] text-center">
          
          <div className="w-12 h-12 bg-[#FFEEF1] rounded-full flex items-center justify-center mx-auto mb-6">
            <Link2Off size={24} strokeWidth={2} className="text-[#EF334E]" />
          </div>

          <h2 className="text-[13px] min-[375px]:text-[14px] sm:text-[20px] font-semibold text-[#1A1A1A] mb-3 tracking-tighter whitespace-nowrap sm:whitespace-normal">
            Oops... This{amountDisplay}Blink has already expired
          </h2>
          <p className="text-[14px] text-[#505050] leading-relaxed mb-6 px-2">
            Create your own Blinks and instantly send money that earn yield to people in over 140 countries
          </p>

          {expiredDateStr ? (
            <div className="flex items-center justify-center gap-2 mb-8 text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] py-1.5 px-4 rounded-full w-max mx-auto shadow-sm">
              <Calendar size={14} />
              <span className="text-[12px] font-medium tracking-wide">Expired on {expiredDateStr}</span>
            </div>
          ) : (
            <div className="mb-8" />
          )}

          <div className="space-y-3">
            <button
              onClick={onLearnMore}
              className="w-full py-3.5 rounded-[10px] font-medium text-[14px] bg-[#1A1A1A] text-white hover:bg-black transition-all active:scale-[0.98]"
            >
              Create your own Blink
            </button>
          </div>

        </div>
      </main>

      <footer className="w-full text-center pb-8 px-4">
        <p className="text-[12px] text-[#4B5563]">
          All Blinks are non-custodial wallets. Blink does not and cannot access your digital assets.
        </p>
      </footer>
    </div>
  );
};
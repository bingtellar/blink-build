import { useState, useEffect, useMemo } from "react";
import { X, ChevronRight, Wallet, Landmark, Smartphone, Info, List, Check } from "lucide-react";
import { CryptoDeposit } from "./CryptoDeposit";
import { BankDeposit } from "./BankDeposit";
import { MobileMoneyDeposit } from "./MobileMoneyDeposit";
import { useStore } from "../../../store/useStore"; 

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

type DepositMethod = "METHODS" | "CRYPTO" | "BANK" | "MOMO" | "SUCCESS";

interface DepositFlowProps {
  isOpen: boolean;
  onClose: () => void;
  prefillData?: any; // 🌟 ARCHITECTURE FIX: Accept AI Prefill payload
}

export const DepositFlow = ({ isOpen, onClose, prefillData }: DepositFlowProps) => {
  
  const storeActive = useStore((state) => state.activeAccount) as any;
  const storeAccounts = useStore((state) => state.accounts) as any[];
  
  const activeAccount = useMemo(() => {
    if (storeActive) return storeActive;
    if (storeAccounts && storeAccounts.length > 0) return storeAccounts[0];
    return null;
  }, [storeActive, storeAccounts]);

  // 🌟 ARCHITECTURE FIX: Automatically route to the correct screen based on AI prefill
  const [currentView, setCurrentView] = useState<DepositMethod>(() => {
    if (prefillData?.method === "bank") return "BANK";
    if (prefillData?.method === "mobile") return "MOMO";
    if (prefillData?.method === "usdc") return "CRYPTO";
    return "METHODS";
  });
  
  const [toast, setToast] = useState({ show: false, message: "" });
  
  const [successData, setSuccessData] = useState({ 
    usdcAmount: "", 
    fiatAmount: "", 
    fiatSymbol: "" 
  });

  const [fiatConfig, setFiatConfig] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      // 🌟 ARCHITECTURE FIX: Respect AI prefill routing every time the modal opens
      if (prefillData?.method === "bank") setCurrentView("BANK");
      else if (prefillData?.method === "mobile") setCurrentView("MOMO");
      else if (prefillData?.method === "usdc") setCurrentView("CRYPTO");
      else setCurrentView("METHODS");

      setToast({ show: false, message: "" });
      
      // 🛡️ SECURE ENTERPRISE FIX: Use HttpOnly Cookie
      fetch(`${API_BASE}/fiat/config`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      })
        .then(res => res.json())
        .then(data => setFiatConfig(data.config))
        .catch(err => console.error("Failed to load fiat config:", err));
    }
  }, [isOpen, prefillData]); // Added prefillData to dependency array

  const triggerToast = (msg: string) => {
    setToast({ show: true, message: msg });
    setTimeout(() => setToast({ show: false, message: "" }), 3000);
  };

  const handleSuccess = (usdcAmount: string, currency: string, fiatAmount?: string, fiatSymbol?: string) => {
    setSuccessData({ 
      usdcAmount, 
      fiatAmount: fiatAmount || "", 
      fiatSymbol: fiatSymbol || currency 
    });
    setCurrentView("SUCCESS");

    // 🌟 AGENTIC FEEDBACK LOOP
    window.dispatchEvent(new CustomEvent('agentic_transaction_success', {
      detail: {
        type: 'deposit',
        data: { usdcAmount, currency, fiatAmount, fiatSymbol: fiatSymbol || currency }
      }
    }));
  };

  if (!isOpen) return null;

  const isSuccessScreen = currentView === "SUCCESS";

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      
      {toast.show && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-3 rounded-full text-[13px] font-medium shadow-2xl z-[150] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-2">
          <Info size={16} className="text-[#2775CA]" />
          {toast.message}
        </div>
      )}

      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-300 backdrop-blur-sm" onClick={onClose} />
      
      {/* Container with slide-up animation */}
      <div className={`relative bg-white w-full sm:max-w-[420px] rounded-t-[24px] sm:rounded-[32px] rounded-b-none sm:rounded-b-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col max-h-[96dvh] sm:max-h-[90vh] pb-6 sm:pb-0 ${isSuccessScreen ? 'h-auto' : 'h-[90dvh] sm:h-[600px]'}`}>

        {/* --- METHODS MENU --- */}
        {currentView === "METHODS" && (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-white relative z-20 shrink-0 border-b border-[#F5F5F4]">
              <div className="w-8" />
              <h2 className="text-[16px] font-bold text-[#1A1A1A]">Deposit funds</h2>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
            </div>
            
            <div className="relative bg-white flex-1 overflow-y-auto">
               <div className="absolute top-0 left-0 w-full h-[200px] pointer-events-none z-0">
                  <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs><linearGradient id="fadeGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#D9E8FF" stopOpacity="0.6" /><stop offset="60%" stopColor="#F5F5F5" stopOpacity="0.3" /><stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient></defs>
                    <rect width="100%" height="100%" fill="url(#fadeGrad)" />
                  </svg>
                </div>
              <div className="p-6 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-[11px] font-bold text-[#757575] uppercase tracking-widest">Recommended Options</p>
                  <div className="w-7 h-7 bg-[#E6F0FF] rounded-lg flex items-center justify-center"><List size={14} className="text-[#2775CA]" /></div>
                </div>
                
                <div className="space-y-2.5">
                  <button onClick={() => setCurrentView("CRYPTO")} className="w-full flex items-center gap-3.5 p-3.5 rounded-[20px] group text-left transition-all duration-200 border border-transparent hover:border-[#1A1A1A]/10 hover:bg-white hover:shadow-sm active:scale-[0.98]">
                    <div className="w-10 h-10 bg-[#F5F5F4] rounded-full flex items-center justify-center shrink-0 group-hover:bg-black group-hover:text-white transition-colors"><Wallet size={18} /></div>
                    <div className="flex-1"><h4 className="font-bold text-[14px] text-[#1A1A1A]">Add via USDC</h4><p className="text-[12px] text-[#757575] leading-snug mt-0.5">Add money by using digital payment tokens like USDC. Instant and seamless.</p></div>
                    <ChevronRight size={18} className="text-[#1A1A1A] opacity-40" />
                  </button>

                  <button onClick={() => setCurrentView("BANK")} className="w-full flex items-center gap-3.5 p-3.5 rounded-[20px] group text-left transition-all duration-200 border border-transparent hover:border-[#1A1A1A]/10 hover:bg-white hover:shadow-sm active:scale-[0.98]">
                    <div className="w-10 h-10 bg-[#F5F5F4] rounded-full flex items-center justify-center shrink-0 group-hover:bg-black group-hover:text-white transition-colors"><Landmark size={18} /></div>
                    <div className="flex-1"><h4 className="font-bold text-[14px] text-[#1A1A1A]">Add via bank transfer</h4><p className="text-[12px] text-[#757575] leading-snug mt-0.5">Add money by transferring funds from any bank to a unique virtual account.</p></div>
                    <ChevronRight size={18} className="text-[#1A1A1A] opacity-40" />
                  </button>

                  <button onClick={() => setCurrentView("MOMO")} className="w-full flex items-center gap-3.5 p-3.5 rounded-[20px] group text-left transition-all duration-200 border border-transparent hover:border-[#1A1A1A]/10 hover:bg-white hover:shadow-sm active:scale-[0.98]">
                    <div className="w-10 h-10 bg-[#F5F5F4] rounded-full flex items-center justify-center shrink-0 group-hover:bg-black group-hover:text-white transition-colors"><Smartphone size={18} /></div>
                    <div className="flex-1"><h4 className="font-bold text-[14px] text-[#1A1A1A]">Add via mobile money</h4><p className="text-[12px] text-[#757575] leading-snug mt-0.5">Transfer funds to wallet via phone number</p></div>
                    <ChevronRight size={18} className="text-[#1A1A1A] opacity-40" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- ROUTED SUB-FLOWS WITH PREFILL PROP DRILLING --- */}
        {currentView === "CRYPTO" && <CryptoDeposit prefillData={prefillData} onClose={onClose} onBack={() => setCurrentView("METHODS")} showToast={triggerToast} onSuccess={handleSuccess} activeAccount={activeAccount} />}
        {currentView === "BANK" && <BankDeposit prefillData={prefillData} fiatConfig={fiatConfig} onClose={onClose} onBack={() => setCurrentView("METHODS")} onSuccess={handleSuccess} activeAccount={activeAccount} />}
        {currentView === "MOMO" && <MobileMoneyDeposit prefillData={prefillData} fiatConfig={fiatConfig} onClose={onClose} onBack={() => setCurrentView("METHODS")} onSuccess={handleSuccess} activeAccount={activeAccount} />}

        {/* --- PIXEL-PERFECT SUCCESS SCREEN --- */}
        {currentView === "SUCCESS" && (
          <div className="bg-white flex flex-col w-full h-full pt-2 animate-in fade-in duration-300">
            
            <div className="flex items-center justify-center px-6 py-4 relative shrink-0">
              <h2 className="text-[16px] font-bold text-[#1A1A1A]">Deposit Initiated</h2>
              <button onClick={onClose} className="absolute right-6 p-1 text-[#1A1A1A] hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="px-6 sm:px-8 flex flex-col items-center pt-6 pb-6 flex-1">
              
              <div className="w-[72px] h-[72px] bg-[#E5F7ED] rounded-full flex items-center justify-center mb-5">
                <Check size={36} className="text-[#3BA66A]" strokeWidth={3.5} />
              </div>
              
              <h2 className="text-[22px] font-bold text-[#1A1A1A] mb-2 tracking-tight text-center">Processing Deposit</h2>
              
              <p className="text-[14px] text-[#757575] text-center mb-8 leading-[1.6]">
                Your request has been received. <span className="font-bold text-[#1A1A1A]">{successData.usdcAmount} USDC</span><br />
                will be credited to your account once confirmed.
              </p>
              
              <div className="w-full bg-[#F9F9F9] border border-[#EAEAEA] rounded-[16px] p-4 mb-8">
                 <div className="flex justify-between items-center pb-3 border-b border-[#F0F0F0]">
                   <span className="text-[13px] text-[#757575] font-medium">Amount to Pay</span>
                   <span className="text-[14px] font-bold text-[#1A1A1A]">
                     {successData.fiatAmount ? `${successData.fiatSymbol}${successData.fiatAmount}` : `${successData.usdcAmount} USDC`}
                   </span>
                 </div>
                 
                 <div className="flex justify-between items-center pt-3">
                   <span className="text-[13px] text-[#757575] font-medium">Expected USDC</span>
                   <span className="text-[14px] font-bold text-[#3BA66A]">
                     +{successData.usdcAmount} USDC
                   </span>
                 </div>
              </div>

              <div className="w-full mt-auto pt-2 shrink-0">
                <button 
                  onClick={onClose} 
                  className="w-full py-4 bg-[#0A0A0A] text-white rounded-[16px] text-[14px] font-bold transition-all hover:bg-black active:scale-[0.98]"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
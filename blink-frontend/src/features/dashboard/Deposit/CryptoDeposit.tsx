import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Copy, Info, Check, X, Loader2 } from "lucide-react";
import { CRYPTO_NETWORKS, getNetworkDetails } from "../../../utils/constants";
import { AccountData } from "../MainDashboard"; // 🌟 FIX 1: Imported the master interface!

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface CryptoDepositProps {
  onClose: () => void;
  onBack: () => void;
  showToast: (msg: string) => void;
  onSuccess: (amount: string, currency: string, fiatAmount?: string, fiatSymbol?: string) => void;
  activeAccount?: AccountData | null;
  prefillData?: any;
}

export const CryptoDeposit = ({ onClose, onBack, showToast, onSuccess, activeAccount }: CryptoDepositProps) => {
  const [step, setStep] = useState<"FUNDING_DETAILS" | "QR_PAYMENT" | "CRYPTO_PROCESSING">("FUNDING_DETAILS");
  const [selectedNetwork, setSelectedNetwork] = useState("Stellar");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  
  const [processingPhase, setProcessingPhase] = useState<0 | 1 | 2>(0); 

  const isMounted = useRef(true);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  
  const baselineTxIds = useRef<Set<string>>(new Set());

  // 🛡️ ZERO-TRUST FIX: Never fall back to dummy data. If missing, it stays empty.
  const currentNetworkData = getNetworkDetails(selectedNetwork);
  const realDepositAddress = activeAccount?.muxedAddress || activeAccount?.walletAddress || "";

  // ROUTING: Override the global memo with the exact Sub-Account routing number (Muxed ID)
  const displayMemo = selectedNetwork === "Stellar" && activeAccount?.muxedId && activeAccount.muxedId !== "MASTER_WALLET" 
    ? activeAccount.muxedId 
    : currentNetworkData.memo;

  useEffect(() => {
    isMounted.current = true;
    
    const fetchBaseline = async () => {
      if (!activeAccount?.id) return;
      try {
        const res = await fetch(`${API_BASE}/transactions/${activeAccount.id}?_t=${Date.now()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          const ids = data.map((tx: any) => String(tx.id || tx.reference));
          baselineTxIds.current = new Set(ids);
        }
      } catch (err) {
        console.error("Failed to fetch transaction baseline:", err);
      }
    };
    
    fetchBaseline();

    return () => { 
      isMounted.current = false; 
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, [activeAccount?.id]);

  const handleCopy = (text: string, type: 'address' | 'memo') => {
    navigator.clipboard.writeText(text);
    if (type === 'address') { setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 2000); }
    else if (type === 'memo') { setCopiedMemo(true); setTimeout(() => setCopiedMemo(false), 2000); }
  };

  const startListeningForDeposit = () => {
    setStep("CRYPTO_PROCESSING");
    setProcessingPhase(0); 

    setTimeout(() => {
      if (isMounted.current && processingPhase === 0) setProcessingPhase(1);
    }, 3000);

    pollingInterval.current = setInterval(async () => {
      if (!activeAccount?.id) return;

      try {
        const res = await fetch(`${API_BASE}/transactions/${activeAccount.id}?_t=${Date.now()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include"
        });
        
        if (res.ok) {
          const latestTransactions = await res.json();
          
          const newDeposit = latestTransactions.find((tx: any) => 
             tx.type === "deposit" && 
             tx.status === "completed" && 
             !baselineTxIds.current.has(String(tx.id || tx.reference))
          );

          if (newDeposit && isMounted.current) {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            setProcessingPhase(2);

            window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

            setTimeout(() => {
              if (isMounted.current) {
                onSuccess(parseFloat(newDeposit.amount).toString(), "USDC"); 
              }
            }, 1000);
          }
        }
      } catch (error) {
        // Silent catch for polling errors
      }
    }, 5000); 
  };

  const hideBackButton = step === "CRYPTO_PROCESSING";

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-white relative z-20 shrink-0 border-b border-[#F5F5F4]">
        {!hideBackButton ? (
          <button onClick={() => step === "FUNDING_DETAILS" ? onBack() : setStep("FUNDING_DETAILS")} className="hover:bg-gray-100 p-1 rounded-full transition-colors">
            <ChevronLeft size={18} />
          </button>
        ) : <div className="w-6 h-6" />}
        
        <h2 className="text-[16px] font-bold text-[#1A1A1A]">
          {step === "FUNDING_DETAILS" && "Funding details"}
          {step === "QR_PAYMENT" && "Deposit USDC"}
          {step === "CRYPTO_PROCESSING" && "Awaiting Blockchain"}
        </h2>
        
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
      </div>

      <div className="relative bg-white flex-1 overflow-y-auto flex flex-col">
        <div className="absolute top-0 left-0 w-full h-[200px] pointer-events-none z-0">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs><linearGradient id="fadeGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#D9E8FF" stopOpacity="0.6" /><stop offset="60%" stopColor="#F5F5F5" stopOpacity="0.3" /><stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient></defs>
            <rect width="100%" height="100%" fill="url(#fadeGrad)" />
          </svg>
        </div>

        <div className="px-6 py-5 sm:p-6 relative z-10 flex-1 flex flex-col">
          
          {step === "FUNDING_DETAILS" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-bold text-[#1A1A1A]">Deposit USDC in your account</h3>
                <div className="w-8 h-8 bg-[#2775CA] rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">$</div>
              </div>
              
              <div className="mb-5">
                <p className="text-[11px] text-[#A3A3A3] mb-2.5">Deposit USDC via any of this Network</p>
                <div className="border border-[#F0F0EF] rounded-[16px] overflow-hidden bg-white/80 backdrop-blur-sm">
                  {CRYPTO_NETWORKS.map((net, idx) => (
                    <button
                      key={net.name}
                      onClick={() => { setSelectedNetwork(net.name); setStep("QR_PAYMENT"); }}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-[#FAFAFA] transition-colors ${idx !== CRYPTO_NETWORKS.length - 1 ? "border-b border-[#F0F0EF]" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center bg-[#F5F5F4] rounded-full overflow-hidden shrink-0 border border-[#E8E8E8]">
                          <img src={net.icon} alt={net.name} className="w-full h-full object-cover rounded-full" />
                        </div>
                        <span className="text-[13px] font-medium text-[#1A1A1A]">{net.name}</span>
                      </div>
                      <ChevronRight size={14} className="text-[#D1D1D1]" />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-2">
                <p className="text-[11px] text-[#A3A3A3] mb-2.5 uppercase font-bold tracking-wider">Other Tokens</p>
                <button onClick={() => showToast("Support for USDT & BTC is coming soon!")} className="w-full flex items-start gap-3 p-3.5 border border-[#F0F0EF] rounded-[16px] hover:border-black transition-all text-left bg-white/80 backdrop-blur-sm group">
                  <div className="flex -space-x-2 mt-0.5 shrink-0">
                    <div className="w-5 h-5 rounded-full border-2 border-white overflow-hidden bg-white"><img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png" alt="USDT" className="w-full h-full object-cover rounded-full" /></div>
                    <div className="w-5 h-5 rounded-full border-2 border-white overflow-hidden bg-white"><img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png" alt="BTC" className="w-full h-full object-cover rounded-full" /></div>
                  </div>
                  <div className="ml-2">
                    <h4 className="text-[12px] font-bold text-[#1A1A1A] group-hover:text-[#2775CA] transition-colors">Add fund using other tokens</h4>
                    <p className="text-[11px] text-[#757575] mt-0.5">Choose token, enter amount and deposit</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === "QR_PAYMENT" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col items-center flex-1 pb-1">
              <button onClick={() => setStep("FUNDING_DETAILS")} className="flex items-center gap-1.5 px-3 py-1 bg-[#F5F5F4] rounded-full text-[10px] font-bold mb-4 hover:bg-gray-200 transition-colors">
                <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-[#E8E8E8]">
                  <img src={CRYPTO_NETWORKS.find((n) => n.name === selectedNetwork)?.icon} alt="" className="w-full h-full object-cover rounded-full" />
                </div>
                {selectedNetwork} <ChevronRight size={12} className="rotate-90 ml-0.5" />
              </button>
              
              <div className="bg-white p-2.5 border border-[#F0F0EF] rounded-[24px] shadow-sm mb-4">
                {realDepositAddress ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${realDepositAddress}`} alt="QR Code" className="w-[120px] h-[120px]" />
                ) : (
                  <div className="w-[120px] h-[120px] flex items-center justify-center bg-[#F5F5F4] rounded-[16px]">
                    <Loader2 size={24} className="text-gray-400 animate-spin" />
                  </div>
                )}
              </div>
              
              <div className="w-full space-y-2 mb-4">
                <div className="relative w-full">
                  <div onClick={() => handleCopy(realDepositAddress, 'address')} className={`w-full bg-[#F5F5F4] rounded-[16px] px-3.5 py-2.5 flex items-center justify-between group cursor-pointer active:scale-95 transition-all ${copiedAddress ? "ring-1 ring-black" : ""}`}>
                    <div className="flex flex-col overflow-hidden w-full pr-3">
                      <span className="text-[10px] text-[#757575] font-bold uppercase mb-0.5">Wallet address</span>
                      <span className="text-[12px] font-mono font-medium truncate w-full">
                        {realDepositAddress ? realDepositAddress : "Loading secure address..."}
                      </span>
                    </div>
                    {copiedAddress ? <Check size={16} className="text-green-600 shrink-0" /> : <Copy size={16} className="text-[#1A1A1A] shrink-0" />}
                  </div>
                  {copiedAddress && <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-3 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 z-50">Address Copied!</div>}
                </div>

                {/* 🌟 Use displayMemo instead of currentNetworkData.memo */}
                {displayMemo && (
                  <div className="relative w-full animate-in fade-in slide-in-from-top-2">
                    <div onClick={() => handleCopy(displayMemo as string, 'memo')} className={`w-full bg-[#F9F9F9] rounded-[16px] px-3.5 py-2.5 flex items-center justify-between group cursor-pointer active:scale-95 transition-all border border-[#EAEAEA] hover:border-[#D1D1D1] ${copiedMemo ? "ring-1 ring-black" : ""}`}>
                      <div className="flex flex-col overflow-hidden w-full pr-3">
                        <span className="text-[10px] text-[#757575] font-bold uppercase mb-0.5 flex items-center gap-1"><Info size={10} /> Optional Memo / Tag</span>
                        <span className="text-[12px] font-mono font-bold text-[#1A1A1A] truncate w-full">{displayMemo}</span>
                      </div>
                      {copiedMemo ? <Check size={16} className="text-green-600 shrink-0" /> : <Copy size={16} className="text-[#1A1A1A] shrink-0" />}
                    </div>
                    {copiedMemo && <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-3 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 z-50">Memo Copied!</div>}
                  </div>
                )}
              </div>
              
              <div className="w-full bg-[#FFF9F2] border border-[#FFE4C4] rounded-[16px] p-3 flex gap-2.5 items-start mb-4">
                <Info size={16} className="text-[#D2691E] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#8B4513] leading-[1.4]">
                  Only send <span className="font-bold">USDC</span> to this address on the <span className="font-bold">{selectedNetwork}</span> network. 
                  {displayMemo && " The memo is completely optional."} Sending wrong token causes loss of funds.
                </p>
              </div>
              
              <button onClick={startListeningForDeposit} className="w-full mt-auto py-3.5 bg-black text-white rounded-[16px] text-[13px] font-bold shadow-lg shadow-black/10 hover:bg-gray-800 active:scale-[0.98] transition-all">
                I have transferred the funds
              </button>
            </div>
          )}

          {step === "CRYPTO_PROCESSING" && (
            <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center flex-1 pb-4">
              <div className="relative mb-6 mt-2">
                <div className="absolute inset-0 bg-[#2775CA] rounded-full animate-ping opacity-20"></div>
                <div className="w-20 h-20 bg-[#E8F0FE] rounded-full flex items-center justify-center relative z-10 border-4 border-white shadow-sm">
                  <Loader2 size={32} className="text-[#2775CA] animate-spin" />
                </div>
              </div>
              
              <h3 className="text-[18px] font-bold text-[#1A1A1A] mb-8 tracking-tight text-center">
                Listening to the<br/>Blockchain...
              </h3>
              
              <div className="w-full max-w-[240px] space-y-5 relative">
                <div className="absolute left-[11px] top-4 bottom-4 border-l-[2px] border-[#F5F5F4] -z-10"></div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 1 ? 'bg-[#34A853] text-white' : 'bg-[#FFF9F2] border border-[#FDE68A] text-[#D97706]'}`}>
                    {processingPhase >= 1 ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 1 ? 'text-[#1A1A1A]' : 'text-[#D97706]'}`}>
                    Waiting for transfer
                  </span>
                </div>

                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 2 ? 'bg-[#34A853] text-white' : processingPhase === 1 ? 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#059669]' : 'bg-[#F5F5F4] text-[#A3A3A3]'}`}>
                    {processingPhase >= 2 ? <Check size={12} strokeWidth={3} /> : processingPhase === 1 ? <Loader2 size={12} className="animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 2 ? 'text-[#1A1A1A]' : processingPhase === 1 ? 'text-[#059669]' : 'text-[#A3A3A3]'}`}>
                    Confirming on network
                  </span>
                </div>

                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 2 ? 'bg-[#34A853] text-white' : 'bg-[#F5F5F4] text-[#A3A3A3]'}`}>
                    {processingPhase >= 2 ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 2 ? 'text-[#1A1A1A]' : 'text-[#A3A3A3]'}`}>
                    Crediting USDC wallet
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
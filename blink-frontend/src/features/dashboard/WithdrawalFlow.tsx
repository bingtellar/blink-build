import { useState, useEffect, useMemo } from "react";
import { X, ChevronRight, Landmark, Smartphone, Wallet, Copy, Check } from "lucide-react";
import { BankWithdrawal } from "./Withdrawal/BankWithdrawal";
import { MobileMoneyWithdrawal } from "./Withdrawal/MobileMoneyWithdrawal";
import { CryptoWithdrawal } from "./Withdrawal/CryptoWithdrawal";
import { useStore } from "../../store/useStore"; 

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface WithdrawalSuccessData {
  method: "bank" | "mobile" | "usdc";
  amounts: { usdc: string; fiat: string };
  recipient: { accountName: string; accountNumber?: string; walletAddress?: string; bank?: string; network?: string; currency?: string };
  txDetails: { id: string; hash: string; fee: string; date: string; status: string };
}

const getCurrencySymbol = (currency?: string) => {
  switch (currency?.toUpperCase()) { 
    case "NGN": return "₦"; 
    case "USD": return "$"; 
    case "GBP": return "£"; 
    case "EUR": return "€"; 
    case "GHS": return "GH₵"; 
    case "KES": return "KSh"; 
    case "UGX": return "USh"; 
    case "RWF": return "FRw"; 
    case "TZS": return "TSh"; 
    case "XOF": return "CFA"; 
    case "XAF": return "FCFA"; 
    case "EGP": return "E£"; 
    case "ZAR": return "R"; 
    case "CNY": return "¥"; 
    default: return currency ? currency + " " : "¤"; 
  }
};

const getExplorerUrl = (network?: string, hash?: string) => {
  let safeHash = hash?.trim() || "";
  const net = network?.toLowerCase() || "";
  
  // 🛡️ GUARD 1: Prevent internal Reference IDs (like CW-D58BF49B) from breaking explorers
  if (!safeHash || safeHash.startsWith("CW-") || safeHash.length < 32) {
    return null; // Signals the UI to hide the explorer button
  }

  // 🛡️ GUARD 2: Environment Awareness (Auto-switches based on your local/prod env)
  const isTestnet = import.meta.env.MODE === "development" || import.meta.env.VITE_STELLAR_NETWORK === "testnet";

  // 🛡️ GUARD 3: The Cross-Chain 2-Hop Check
  // If the backend returns a 64-char hex with no '0x', it is the Soroban origin transaction, NOT the EVM destination.
  const isStellarHash = /^[0-9a-fA-F]{64}$/.test(safeHash) && !safeHash.startsWith("0x");

  // ⚡ STELLAR / SOROBAN
  if (net.includes("stellar") || net.includes("soroban") || isStellarHash) {
    safeHash = safeHash.replace(/^0x/i, "");
    return `https://stellar.expert/explorer/${isTestnet ? 'testnet' : 'public'}/tx/${safeHash}`;
  }

  // ⚡ SOLANA (Base58, no 0x)
  if (net.includes("solana")) {
    safeHash = safeHash.replace(/^0x/i, "");
    return `https://solscan.io/tx/${safeHash}${isTestnet ? '?cluster=devnet' : ''}`;
  }

  // ⚡ EVM CHAINS (Base, Polygon, Ethereum - Strict 0x prefix)
  if (!safeHash.startsWith("0x")) {
    safeHash = "0x" + safeHash;
  }

  if (net.includes("polygon")) {
    return isTestnet ? `https://amoy.polygonscan.com/tx/${safeHash}` : `https://polygonscan.com/tx/${safeHash}`;
  }
  
  if (net.includes("base")) {
    return isTestnet ? `https://sepolia.basescan.org/tx/${safeHash}` : `https://basescan.org/tx/${safeHash}`;
  }
  
  // Default EVM Fallback: Ethereum
  return isTestnet ? `https://sepolia.etherscan.io/tx/${safeHash}` : `https://etherscan.io/tx/${safeHash}`;
};

interface WithdrawalFlowProps {
  isOpen: boolean;
  onClose: () => void;
  prefillData?: any;
  onAddTransaction?: (tx: any) => void;             
  onUpdateBalance?: (bal: string | number) => void;
}

export const WithdrawalFlow = ({ isOpen, onClose, prefillData }: WithdrawalFlowProps) => {
  
  // 🌟 ENTERPRISE FIX: Remove manual mutations, rely on Sync Engine
  const storeActive = useStore((state) => state.activeAccount) as any;
  const storeAccounts = useStore((state) => state.accounts) as any[];
  
  const activeAccount = useMemo(() => {
    if (storeActive) return storeActive;
    if (storeAccounts && storeAccounts.length > 0) return storeAccounts[0];
    return null; 
  }, [storeActive, storeAccounts]);

  // 🌟 THE MATRIX FIX: Safely read the exact segregated balance based on ledger type
  const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
  const availableBalance = activeAccount ? (
    isMasterWallet && activeAccount.balances?.mainOperating !== undefined
      ? activeAccount.balances.mainOperating
      : parseFloat(activeAccount.balance) || 0
  ) : 0;

  // Bulletproof State Initialization: Instantly calculate the correct screen
  const [currentView, setCurrentView] = useState<"METHODS" | "BANK" | "MOMO" | "CRYPTO" | "SUCCESS">(() => {
    if (prefillData?.method === "bank") return "BANK";
    if (prefillData?.method === "mobile") return "MOMO";
    if (prefillData?.method === "usdc") return "CRYPTO";
    return "METHODS";
  });
  
  const [successData, setSuccessData] = useState<WithdrawalSuccessData | null>(null);
  const [copied, setCopied] = useState(false);
  const [fiatConfig, setFiatConfig] = useState<any>(null);

  // Cleaned up useEffect: Only handles data fetching and resets
  useEffect(() => {
    if (isOpen) {
      // 🌟 ARCHITECTURE FIX: Respect AI prefill routing, but fallback to METHODS for humans
      if (prefillData?.method === "bank") setCurrentView("BANK");
      else if (prefillData?.method === "mobile") setCurrentView("MOMO");
      else if (prefillData?.method === "usdc") setCurrentView("CRYPTO");
      else setCurrentView("METHODS");
      
      setSuccessData(null);

      const authToken = localStorage.getItem("bingtellar_auth_token");

      // 🛡️ SECURE: Dynamic URL and Auth Header Injection
      fetch(`${API_BASE}/fiat/config`, {
        headers: { "Authorization": `Bearer ${authToken}` }
      })
        .then(res => res.json())
        .then(data => setFiatConfig(data.config))
        .catch(err => console.error("Failed to load fiat config:", err));
    } else {
      // Reset view to METHODS only after the closing animation finishes (prevents flickering)
      setTimeout(() => setCurrentView("METHODS"), 300);
    }
  }, [isOpen, prefillData]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const handleSuccess = (data: WithdrawalSuccessData) => {
    setSuccessData(data);
    setCurrentView("SUCCESS");

    // 🌟 AGENTIC FEEDBACK LOOP
    window.dispatchEvent(new CustomEvent('agentic_transaction_success', {
      detail: { type: 'withdrawal', data: data }
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className={`relative bg-white w-full sm:max-w-[440px] rounded-t-[24px] sm:rounded-[32px] rounded-b-none sm:rounded-b-[32px] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 max-h-[96dvh] sm:max-h-[90vh] pb-8 sm:pb-0 ${currentView === "SUCCESS" ? "h-auto" : "h-[90dvh] sm:h-[640px]"}`}>
        
        {/* --- METHODS MENU --- */}
        {currentView === "METHODS" && (
          <>
            <div className="px-8 pt-8 pb-4 flex items-center justify-between z-10 bg-white shrink-0">
              <h2 className="text-[18px] font-bold text-[#1A1A1A]">Withdraw funds</h2>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="flex-1 relative flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
                <p className="text-[14px] text-[#757575]">Select destination for withdrawal</p>
                <div className="space-y-2 pb-8">
                  <button onClick={() => setCurrentView("BANK")} className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100 text-left active:scale-[0.98]">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-[#F5F5F4] flex items-center justify-center text-gray-600 shrink-0">
                        <Landmark size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[15px]">To Bank account</h4>
                        <p className="text-[12px] text-[#757575] max-w-[180px]">Withdraw to a bank account you specify</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">up to 5mins - 24h</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300" />
                  </button>

                  <button onClick={() => setCurrentView("MOMO")} className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100 text-left active:scale-[0.98]">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-[#F5F5F4] flex items-center justify-center text-gray-600 shrink-0">
                        <Smartphone size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[15px]">To Mobile money</h4>
                        <p className="text-[12px] text-[#757575] max-w-[180px]">Withdraw to a mobile money wallet number</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300" />
                  </button>

                  <button onClick={() => setCurrentView("CRYPTO")} className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100 text-left active:scale-[0.98]">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-[#F5F5F4] flex items-center justify-center text-gray-600 shrink-0">
                        <Wallet size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[15px]">To USDC Wallet</h4>
                        <p className="text-[12px] text-[#757575] max-w-[180px]">Send to an external wallet</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300" />
                  </button>

                  <button className="w-full flex items-center justify-between p-4 rounded-[24px] opacity-40 cursor-not-allowed text-left">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-[#F5F5F4] flex items-center justify-center text-gray-600 shrink-0">
                        <Wallet size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[15px]">To Giftcard</h4>
                        <p className="text-[12px] text-[#757575]">Withdraw asset as giftcard</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-full text-gray-500 font-bold uppercase tracking-tight">Soon</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- ROUTES (Passing fiatConfig down) --- */}
        {currentView === "BANK" && <BankWithdrawal fiatConfig={fiatConfig} onClose={onClose} onBack={() => prefillData ? onClose() : setCurrentView("METHODS")} onSuccess={handleSuccess} availableBalance={availableBalance} activeAccount={activeAccount} prefillData={prefillData} />}
        {currentView === "MOMO" && <MobileMoneyWithdrawal fiatConfig={fiatConfig} onClose={onClose} onBack={() => prefillData ? onClose() : setCurrentView("METHODS")} onSuccess={handleSuccess} availableBalance={availableBalance} activeAccount={activeAccount} prefillData={prefillData} />}
        {currentView === "CRYPTO" && <CryptoWithdrawal onClose={onClose} onBack={() => prefillData ? onClose() : setCurrentView("METHODS")} onSuccess={handleSuccess} availableBalance={availableBalance} activeAccount={activeAccount} prefillData={prefillData} />}
        
        {/* --- SUCCESS RECEIPT SCREEN --- */}
        {currentView === "SUCCESS" && successData && (
          <div className="flex-1 relative flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="p-8 flex flex-col items-center text-center pb-8 h-full overflow-y-auto">
              <div className="w-full flex justify-end mb-4 absolute top-6 right-6">
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={22} /></button>
              </div>

              <div className="flex -space-x-4 mb-5 mt-4 relative">
                <div className="w-14 h-14 bg-[#2775CA] rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white text-xl font-bold z-10 translate-x-2">$</div>
                <div className="w-14 h-14 bg-[#34A853] rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white text-xl font-bold z-0">
                  {successData.method === "usdc" ? "$" : getCurrencySymbol(successData.recipient.currency)}
                </div>
              </div>

              <h3 className="text-[22px] font-bold mb-1 tracking-tight text-[#1A1A1A]">Withdraw {successData.amounts.usdc} USDC</h3>
              <p className="text-[12px] text-gray-400 mb-6 font-medium">{successData.txDetails.date}</p>

              <div className="w-full border border-gray-100 rounded-[24px] p-5 space-y-5 relative mb-6 bg-white shadow-sm">
                <div className="flex items-start gap-4 text-left">
                  <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center shrink-0 z-10 text-gray-400">
                    <Wallet size={15} />
                  </div>
                  <div><p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">From</p><p className="font-bold text-[13px]">Account balance</p></div>
                </div>
                <div className="absolute left-[38px] top-[46px] bottom-[164px] border-l-[1.5px] border-dashed border-gray-200 z-0" />
                <div className="flex items-start gap-4 text-left">
                  <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center shrink-0 z-10 text-gray-400">
                    {successData.method === "mobile" ? <Smartphone size={15} /> : <Landmark size={15} />}
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">To</p>
                    <p className="font-bold text-[13px]">{successData.method === "usdc" ? successData.recipient.network : successData.recipient.bank}</p>
                    <p className="text-[11px] text-gray-500 max-w-[180px] truncate">{successData.recipient.accountName} • {successData.method === "usdc" ? successData.recipient.walletAddress : successData.recipient.accountNumber}</p>
                  </div>
                </div>

                <hr className="border-gray-100" />
                <div className="space-y-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Transaction ID</span>
                    <span className="font-bold uppercase tracking-tight">{successData.txDetails.id}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-500">Network fee</span>
                    <span className="font-bold text-gray-800">
                      {successData.txDetails.fee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Txhash</span>
                    <button 
                      onClick={() => handleCopyHash(successData.txDetails.hash)}
                      className="flex items-center gap-1.5 hover:opacity-70 transition-opacity group"
                    >
                      <span className="font-bold text-gray-300 max-w-[120px] truncate">
                        {successData.txDetails.hash}
                      </span>
                      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-300" />}
                    </button>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-gray-500">Status</span>
                    {successData.txDetails.status === "pending" ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wide text-[#D97706] bg-[#FEF3C7]">Pending</span>
                    ) : successData.txDetails.status === "processing" ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wide text-[#2775CA] bg-[#E8F0FE]">Processing</span>
                    ) : successData.txDetails.status === "failed" ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wide text-[#DC2626] bg-[#FEE2E2]">Failed</span>
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wide text-[#059669] bg-[#D1FADF]">Completed</span>
                    )}
                  </div>
                </div>
              </div>

              {(() => {
                const explorerUrl = getExplorerUrl(successData.recipient.network, successData.txDetails.hash);
                
                if (successData.method === "usdc" && explorerUrl) {
                  return (
                    <button 
                      onClick={() => window.open(explorerUrl, "_blank")} 
                      className="w-full bg-black text-white rounded-full py-4 font-bold text-[14px] mt-auto hover:bg-gray-900 transition-colors"
                    >
                      View on explorer
                    </button>
                  );
                }
                
                return (
                  <button onClick={onClose} className="w-full bg-black text-white rounded-full py-4 font-bold text-[14px] mt-auto hover:bg-gray-900 transition-colors">
                    {successData.txDetails.status === "processing" ? "Continue to Dashboard" : "Go to Dashboard"}
                  </button>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Wallet, Search, Check, ChevronDown, Loader2, AlertCircle, Lock } from "lucide-react";
import toast from "react-hot-toast"; 
import { SorobanService } from "../../../services/SorobanService";
import { LocalCryptoUtil } from "../../../utils/LocalCryptoUtil";
import { useStore } from "../../../store/useStore";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const cryptoNetworksList = ["Stellar", "Ethereum (ERC20)", "Solana", "Polygon", "Base"];

export interface ExtendedAccountData {
  id: string;
  name?: string;
  balance: number;
  walletAddress?: string;
  encryptedWalletKey?: string;
  [key: string]: any; 
}

interface CryptoWithdrawalProps {
  onClose: () => void;
  onBack: () => void;
  onSuccess: (data: any) => void;
  availableBalance: number;
  activeAccount?: ExtendedAccountData | null;
  prefillData?: any;
}

export const CryptoWithdrawal = ({ onClose, onBack, onSuccess, availableBalance, activeAccount, prefillData }: CryptoWithdrawalProps) => {
  const updateAccountBalance = useStore((state: any) => state.updateAccountBalance);
  
  // 🌟 THE FIX 1: Instantly load the AMOUNT screen if Radar copilot provides crypto details
  const [step, setStep] = useState<"RECIPIENT_LIST" | "NEW_RECIPIENT" | "AMOUNT" | "REVIEW" | "PIN_VERIFICATION">(() => {
    return prefillData ? "AMOUNT" : "RECIPIENT_LIST";
  });
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<"network" | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [savedRecipients, setSavedRecipients] = useState<any[]>([]);

  // 🌟 THE FIX 2: Instantly inject the AI's crypto data into the Recipient State
  const [recipient, setRecipient] = useState(() => {
    if (prefillData) {
      return { 
        network: prefillData.network || "Stellar", 
        walletAddress: prefillData.details || prefillData.walletAddress || prefillData.recipient || "", 
        // 🌟 AGGRESSIVE HARVESTING: Catch the name from any possible NLP permutation
        accountName: prefillData.name || prefillData.accountName || prefillData.label || prefillData.recipientName || "", 
        email: prefillData.email || "", 
        isOwner: false 
      };
    }
    return { network: "", walletAddress: "", accountName: "", email: "", isOwner: false };
  });

  const [amounts, setAmounts] = useState(() => {
    if (prefillData && prefillData.amount) {
      const validUsdc = prefillData.amount.toString().replace(/[^0-9.]/g, '');
      const usdcParts = validUsdc.split('.');
      let formattedUsdc = usdcParts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (usdcParts.length > 1) formattedUsdc += '.' + usdcParts.slice(1).join('');
      return { usdc: formattedUsdc };
    }
    return { usdc: "" };
  });
  const [pinInput, setPinInput] = useState("");

  const isMounted = useRef(true);

  // 🌟 DYNAMIC FEE CALCULATION
  const networkFee = recipient.network === "Stellar" ? 0.00 : 1.50; // Native Stellar is free. Cross-chain carries bridge gas.

  useEffect(() => {
    isMounted.current = true;
    setIsFetchingData(true);

    loadSavedRecipients();
    
    setTimeout(() => {
      if (isMounted.current) setIsFetchingData(false);
    }, 300);

    return () => { isMounted.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  // 🌟 THE SYNC ENGINE: Listen for global address book updates
  useEffect(() => {
    const handleSync = () => loadSavedRecipients();
    window.addEventListener('bingtellar_recipients_updated', handleSync);
    return () => window.removeEventListener('bingtellar_recipients_updated', handleSync);
  }, []);

  const loadSavedRecipients = async () => {
    if (!activeAccount?.id) return;
    try {
      const res = await fetch(`${API_BASE}/users/${activeAccount.id}/recipients`, {
        method: 'GET',
        headers: { "Content-Type": "application/json" },
        credentials: 'include' // 🌟 FIX: Enables native HttpOnly Cookie transmission
      });

      if (!res.ok) return;
      const data = await res.json();
      
      const cryptoRecs = data.filter((r: any) => r.type === "Wallet");
      const mapped = cryptoRecs.map((r: any) => ({
        id: r.id, method: "usdc", accountName: r.name, walletAddress: r.details, network: r.network || "Stellar", currency: "USDC"
      }));
      if (isMounted.current) setSavedRecipients(mapped);
    } catch (err) {
      console.error("Failed to load saved crypto recipients", err);
    }
  };

  // 🌟 THE OMNI-HEALER LOCK
  const hasConsumedPrefill = useRef(false);

  const handleAmountChange = (value: string) => {
    hasConsumedPrefill.current = true; // 🔒 INSTANT LOCK: Invalidate AI data on user type
    setError(null);
    const validChars = value.replace(/[^0-9.]/g, '');
    const parts = validChars.split('.');
    let formatted = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (parts.length > 1) formatted += '.' + parts.slice(1).join('');
    setAmounts({ usdc: formatted });
  };

  // 🌟 THE PERFECTED OMNI-HEALER
  useEffect(() => {
    if (prefillData && !hasConsumedPrefill.current) {
      
      // 1. Heal Amount
      if (prefillData.amount) {
        handleAmountChange(prefillData.amount.toString());
      }

      // 2. Heal Recipient Details (Catches any React rendering race conditions)
      const finalName = prefillData.name || prefillData.accountName || prefillData.label || prefillData.recipientName || prefillData.memo || prefillData.note || "";
      const finalAddress = prefillData.details || prefillData.walletAddress || prefillData.recipient || "";
      const finalNetwork = prefillData.network || "Stellar";

      setRecipient(prev => ({
        ...prev,
        accountName: finalName || prev.accountName,
        walletAddress: finalAddress || prev.walletAddress,
        network: finalNetwork || prev.network
      }));

      // Lock it so user edits aren't overwritten later
      hasConsumedPrefill.current = true; 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillData]);

  const handleSaveNewRecipient = async () => {
    if (!activeAccount?.id) return;
    setStep("AMOUNT"); 

    try {
      await fetch(`${API_BASE}/users/${activeAccount.id}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 🌟 FIX: Enables native HttpOnly Cookie transmission
        body: JSON.stringify({
          name: recipient.accountName, 
          type: "Wallet", 
          details: recipient.walletAddress, 
          network: recipient.network,
          email: recipient.email
        })
      });
      // 🌟 THE SYNC ENGINE: Broadcast recipient update globally
      window.dispatchEvent(new Event('bingtellar_recipients_updated'));
      loadSavedRecipients();
    } catch (err) {
      console.error("Failed to save recipient to cloud", err);
    }
  };

  const submitWithdrawal = async () => {
    if (pinInput.length < 6) return;

    if (!activeAccount || !activeAccount.encryptedWalletKey) {
        setError("Secure key missing from session. Please log out and log back in.");
        return;
    }

    setIsLoading(true); 
    setError(null);

    // 🔥 TRUE OPTIMISTIC UI: Calculate and deduct instantly BEFORE the network request
    const withdrawnAmount = parseFloat(amounts.usdc.replace(/,/g, "")) || 0;
    const totalDeduction = withdrawnAmount + networkFee;
    const previousBalance = availableBalance; // Save to rollback if needed
    
    // Deduct immediately on Frame 0
    updateAccountBalance(activeAccount.id, Math.max(0, availableBalance - totalDeduction));
    
    try {
        let rawSecretKey = "";
        try {
            rawSecretKey = await LocalCryptoUtil.decrypt(activeAccount.encryptedWalletKey, pinInput);
        } catch (e) {
            throw new Error("Incorrect PIN. Decryption failed.");
        }

        if (!rawSecretKey || !rawSecretKey.startsWith("S") || rawSecretKey.length !== 56) {
            throw new Error("Incorrect PIN. Yielded invalid Secret Key.");
        }

        const withdrawnAmount = parseFloat(amounts.usdc.replace(/,/g, "")) || 0;
        const totalDeduction = withdrawnAmount + networkFee;

        if (totalDeduction > availableBalance) {
            throw new Error(`Insufficient balance. You need $${totalDeduction.toFixed(2)} to cover the amount + gas fee.`);
        }
      
        // 🌟 FIX: Smart Routing for XDR Target Address
        const isCrossChain = recipient.network !== "Stellar";
        const treasuryAddress = import.meta.env.VITE_TREASURY_ADDRESS;
        
        if (isCrossChain && !treasuryAddress) {
            throw new Error("FATAL: Treasury configuration missing. Cannot execute cross-chain settlement.");
        }

        // If native Stellar, send directly to recipient. If EVM, send to Treasury Bridge.
        const targetAddress = isCrossChain ? treasuryAddress : recipient.walletAddress;

        const signedXDR = await SorobanService.buildAndSignTransferXDR(
            rawSecretKey, 
            targetAddress, 
            totalDeduction.toString() // Deduct the amount + network fee
        );

        const response = await fetch(`${API_BASE}/crypto/withdrawal/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // 🌟 FIX: Enables native HttpOnly Cookie transmission
            body: JSON.stringify({
                userId: activeAccount.id,
                usdcAmount: withdrawnAmount,
                networkFee: networkFee,
                signedXdr: signedXDR,           
                recipientDetails: {
                    walletAddress: recipient.walletAddress,
                    network: recipient.network,
                    accountName: recipient.accountName
                },
                // 🌟 RADAR AUDIT TRAIL: Explicitly pass the note to override the backend's JSON fallback
                note: prefillData ? "Initiated via Radar Copilot" : "Crypto Withdrawal"
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Backend failed to broadcast crypto withdrawal");

        const confirmedTxHash = data.blockchainTxHash || data.txHash;

        onSuccess({ 
          method: "usdc",
          amounts: { usdc: amounts.usdc, fiat: amounts.usdc }, 
          recipient: { ...recipient, accountNumber: recipient.walletAddress, bank: recipient.network, currency: "USDC" }, 
          txDetails: {
            id: data.reference || confirmedTxHash, 
            hash: confirmedTxHash,
            fee: `${networkFee.toFixed(2)} USDC`,
            date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }),
            status: isCrossChain ? "processing" : "completed",
          }
        });

    } catch (err: any) {
        // 🔥 ROLLBACK UI: The network request failed, so give the user their balance back instantly.
        updateAccountBalance(activeAccount.id, previousBalance);
        setError(err.message || "Transaction failed. Please try again.");
        setPinInput(""); 
    } finally {
        setIsLoading(false);
    }
  };

  const validateCryptoAddress = (address: string, net: string) => {
    if (net.includes("ERC20") || net.includes("Polygon") || net.includes("Base")) return /^0x[a-fA-F0-9]{40}$/.test(address);
    if (net === "Stellar") return address.startsWith("G") && address.length === 56;
    if (net === "Solana") return address.length >= 32 && address.length <= 44 && !address.startsWith("0x");
    return address.length > 20;
  };

  const isRecipientValid = recipient.walletAddress.trim() !== "" && validateCryptoAddress(recipient.walletAddress, recipient.network) && recipient.network !== "" && recipient.accountName.trim() !== "";
  
  const parsedUsdc = parseFloat(amounts.usdc.replace(/,/g, '') || "0");
  const isInsufficient = (parsedUsdc + networkFee) > availableBalance;
  const isAmountValid = parsedUsdc > 0 && !isInsufficient;

  const handleContinue = () => {
    if (activeAccount?.kycStatus !== 'approved' || !activeAccount?.isReady) {
      toast.error(
        <div className="flex flex-col text-left ml-1 mt-0.5">
          <span className="text-[14px] font-bold text-[#DC2626] mb-0.5 tracking-tight">
            Action not approved
          </span>
          <span className="text-[12px] font-medium text-[#DC2626]/80 leading-snug">
            Your Blink account has not been verified and activated yet. Contact <strong className="font-bold text-[#DC2626]">support@ourblink.cash</strong>
          </span>
        </div>, 
        {
          duration: 5000,
          position: 'top-center',
          style: { 
            background: '#FEF2F2', 
            border: '1px solid #FECACA',
            padding: '14px 16px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.15)',
            maxWidth: '380px',
            alignItems: 'flex-start'
          }
        }
      );
      return; 
    }
    setStep("REVIEW");
  };

  return (
    <>
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-3 flex items-center justify-between z-10 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => {
              if (step === "PIN_VERIFICATION") setStep("REVIEW");
              else if (step === "REVIEW") setStep("AMOUNT");
              else if (step === "AMOUNT") setStep("RECIPIENT_LIST");
              else onBack();
          }} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-[16px] sm:text-[18px] font-bold text-[#1A1A1A]">
            {step === "RECIPIENT_LIST" && "Select recipient"}
            {step === "NEW_RECIPIENT" && "New recipient details"}
            {step === "AMOUNT" && "Amount"}
            {step === "REVIEW" && "Review transaction"}
            {step === "PIN_VERIFICATION" && "Security Verification"}
          </h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
      </div>

      {error && <div className="mx-6 sm:mx-8 mt-2 p-3 bg-red-50 text-red-600 rounded-xl text-[13px] flex items-center gap-2"><AlertCircle size={16} />{error}</div>}

      <div className="flex-1 relative flex flex-col overflow-hidden">
        {(isLoading || isFetchingData) && <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-[1px] flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-black" /></div>}

        <div className="flex-1 overflow-y-auto">
          {step === "RECIPIENT_LIST" && (
            <div className="px-6 sm:px-8 py-4 sm:py-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="relative mb-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search saved recipients" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-100 rounded-full py-3.5 pl-12 pr-4 text-[14px] outline-none focus:border-gray-300 transition-colors" />
              </div>
              <button onClick={() => { setRecipient({ network: "", walletAddress: "", accountName: "", email: "", isOwner: false }); setStep("NEW_RECIPIENT"); }} className="w-full bg-black text-white rounded-full py-3.5 font-bold text-[14px] mb-8 shadow-lg shadow-black/10 active:scale-[0.98]">+ Add new recipient</button>

              {savedRecipients.filter(r => r.accountName.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                <div className="space-y-4">
                  <h4 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-4">Saved Beneficiaries</h4>
                  {savedRecipients.filter(r => r.accountName.toLowerCase().includes(searchTerm.toLowerCase())).map((rec) => (
                    <div key={rec.id} onClick={() => { setRecipient({ ...recipient, ...rec }); setStep("AMOUNT"); }} className="flex items-center justify-between p-4 rounded-[20px] border border-gray-100 hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98]">
                      <div className="flex items-center gap-4 text-left"><div className="w-10 h-10 bg-[#87CEF5] rounded-full flex items-center justify-center text-gray-600 font-bold text-[14px]">{rec.accountName.charAt(0).toUpperCase()}</div><div><h4 className="font-bold text-[14px]">{rec.accountName}</h4><p className="text-[12px] text-gray-500">{rec.network} • {rec.walletAddress.slice(0,6)}...{rec.walletAddress.slice(-4)}</p></div></div><ChevronRight size={16} className="text-gray-300" />
                    </div>
                  ))}
                </div>
              ) : (<div className="flex items-center gap-4"><div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-red-500 shrink-0"><Wallet size={18} /></div><div className="text-left"><h4 className="font-bold text-[15px]">No saved recipient yet</h4><p className="text-[13px] text-[#757575]">Frequent beneficiaries will be displayed here</p></div></div>)}
            </div>
          )}

          {step === "NEW_RECIPIENT" && (
            <div className="px-6 sm:px-8 py-4 sm:py-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="relative z-30">
                  <div onClick={() => { setActiveDropdown(activeDropdown === "network" ? null : "network"); setSearchTerm(""); }} className="w-full bg-[#F9F9F9] rounded-[16px] p-4 text-[14px] flex justify-between items-center cursor-pointer border border-transparent hover:border-gray-200">
                    <span className={recipient.network ? "text-black" : "text-gray-500"}>{recipient.network || "Select Crypto Network"}</span><ChevronDown size={18} className="text-gray-400" />
                  </div>
                  {activeDropdown === "network" && (
                    <div className="absolute top-[105%] left-0 right-0 bg-white border border-gray-100 rounded-[16px] shadow-xl p-3 animate-in fade-in slide-in-from-top-2">
                      <div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search network" className="w-full bg-[#F9F9F9] rounded-lg py-2.5 pl-9 pr-3 outline-none text-[13px]" /></div>
                      <div className="max-h-[160px] overflow-y-auto">
                        {cryptoNetworksList.filter(n => n.toLowerCase().includes(searchTerm.toLowerCase())).map((n) => (
                          <div key={n} onClick={() => { setRecipient({ ...recipient, network: n }); setActiveDropdown(null); }} className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer text-[13px]">{n}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <input type="text" value={recipient.walletAddress} placeholder="Wallet Address" className={`w-full bg-[#F9F9F9] rounded-[16px] p-4 text-[14px] outline-none focus:border-gray-300 border ${recipient.walletAddress && !validateCryptoAddress(recipient.walletAddress, recipient.network) ? "border-red-300 focus:border-red-400" : "border-transparent"}`} onChange={(e) => setRecipient({ ...recipient, walletAddress: e.target.value }) } />
                  {recipient.walletAddress && !validateCryptoAddress(recipient.walletAddress, recipient.network) && (<p className="text-[11px] text-red-500 mt-2 px-2">Please enter a valid {recipient.network || 'crypto'} address.</p>)}
                </div>
                <input type="text" value={recipient.accountName} placeholder="Wallet Label/Name" className="w-full bg-[#F9F9F9] border border-transparent focus:border-gray-200 rounded-[16px] p-4 text-[14px] outline-none" onChange={(e) => setRecipient({ ...recipient, accountName: e.target.value }) } />
                <input type="email" value={recipient.email} placeholder="Email (optional)" className="w-full bg-[#F9F9F9] border border-transparent focus:border-gray-200 rounded-[16px] p-4 text-[14px] outline-none" onChange={(e) => setRecipient({ ...recipient, email: e.target.value }) } />
                <div className="flex items-center gap-3 py-1 cursor-pointer group" onClick={() => setRecipient({ ...recipient, isOwner: !recipient.isOwner })}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${recipient.isOwner ? "bg-black border-black text-white" : "border-gray-300 group-hover:border-gray-400"}`}>{recipient.isOwner && <Check size={10} />}</div>
                  <span className="text-[12px] sm:text-[13px] font-medium text-gray-600 group-hover:text-black transition-colors">I am the owner of this account</span>
                </div>
                <button disabled={!isRecipientValid} onClick={handleSaveNewRecipient} className={`w-full rounded-full py-3.5 font-bold text-[14px] mt-6 transition-all ${isRecipientValid ? "bg-black text-white shadow-lg shadow-black/10 active:scale-[0.98]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Continue</button>
            </div>
          )}

          {step === "AMOUNT" && (
            <div className="px-6 sm:px-8 pt-2 pb-8 flex flex-col min-h-full bg-white animate-in fade-in slide-in-from-right-4 duration-300">
              <div className={`bg-white border rounded-[20px] p-5 sm:p-6 mt-2 shadow-sm relative z-10 transition-colors ${isInsufficient ? "border-red-400 ring-4 ring-red-50" : "border-gray-100"}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Wallet size={12} /> From Balance</span>
                  <span className={`text-[10px] sm:text-[11px] font-bold ${isInsufficient ? "text-red-500" : "text-gray-400"}`}><button onClick={() => handleAmountChange(Math.max(0, availableBalance - networkFee).toString())} className="text-[#2775CA] hover:underline mr-1">Max</button>Balance: ${availableBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#2775CA] rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner">$</div><span className="font-bold text-[16px] sm:text-[18px]">USDC</span></div>
                  <input type="text" value={amounts.usdc} onChange={(e) => handleAmountChange(e.target.value)} placeholder="0.00" className={`text-right text-3xl sm:text-4xl font-bold outline-none w-1/2 placeholder-gray-200 ${isInsufficient ? "text-red-500" : "text-[#1A1A1A]"}`} />
                </div>
              </div>
              {isInsufficient && (<div className="flex items-center gap-1.5 text-red-500 text-[11px] sm:text-[12px] font-medium px-2 mt-2 mb-1"><AlertCircle size={14} /><span>Please ensure you have enough funds to cover the amount and network fee.</span></div>)}
              
              <div className={`relative py-4 sm:py-5 pl-[44px] sm:pl-[52px] pr-4 space-y-1.5 sm:space-y-2 text-[11px] sm:text-[12px] text-gray-400 ${!isInsufficient ? "mb-1" : "mb-0"}`}>
                <div className="absolute left-[28px] sm:left-[34px] top-0 bottom-0 border-l-[1.5px] border-dashed border-gray-200" />
                <div className="flex justify-between"><span>Network Fee</span><span className={networkFee === 0 ? "text-[#34A853] font-bold" : ""}>{networkFee === 0 ? "Free" : `${networkFee.toFixed(2)} USDC`}</span></div>
                <div className="flex justify-between font-bold text-black border-t border-dashed border-gray-200 pt-1 mt-1"><span>Total Deduction</span><span>{amounts.usdc ? (parseFloat(amounts.usdc.replace(/,/g, '')) + networkFee).toFixed(2) : "0.00"} USDC</span></div>
              </div>

              <div className="bg-white border border-gray-100 rounded-[20px] p-5 sm:p-6 mb-6 shadow-sm relative z-10">
                 <div className="pt-2 flex justify-between items-center">
                  <span className="text-[11px] sm:text-[12px] font-bold flex items-center gap-2"><Wallet size={14} className="text-gray-400" /> To {recipient.network} Wallet - <span className="text-black">{recipient.accountName || "Recipient"}</span></span>
                  <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-[11px] sm:text-[12px] font-bold underline text-black">{isDetailsOpen ? "Hide details" : "View details"}</button>
                </div>
                {isDetailsOpen && (
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-100 space-y-1.5 text-[11px] sm:text-[12px] animate-in slide-in-from-top-2">
                    <div className="flex justify-between text-gray-500"><span>Label</span><span className="font-bold text-black">{recipient.accountName}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Address</span><span className="font-bold text-black text-right max-w-[200px] truncate">{recipient.walletAddress}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Network</span><span className="font-bold text-black">{recipient.network}</span></div>
                  </div>
                )}
              </div>
              <button disabled={!isAmountValid} onClick={handleContinue} className={`w-full rounded-full py-3.5 font-bold text-[14px] mt-auto transition-all ${isAmountValid ? "bg-black text-white active:scale-95 shadow-lg shadow-black/10" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Continue</button>
            </div>
          )}

          {/* REVIEW STEP */}
          {step === "REVIEW" && (
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-10 sm:pb-8 flex flex-col min-h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-[#F9F9F9] border border-gray-100 rounded-[20px] p-5 sm:p-6 space-y-3.5 sm:space-y-4 text-[13px] sm:text-[14px]">
                <div className="flex justify-between"><span className="text-gray-500">Withdraw Amount</span><span className="font-bold text-[#1A1A1A]">{amounts.usdc} USDC</span></div>
                <div className="flex justify-between"><span className="text-gray-500">From</span><span className="font-bold text-[#1A1A1A]">USDC Balance</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Network Fee ({recipient.network})</span><span className={`font-bold ${networkFee === 0 ? "text-[#34A853]" : "text-[#1A1A1A]"}`}>{networkFee === 0 ? "Free" : `${networkFee.toFixed(2)} USDC`}</span></div>
                <div className="flex justify-between pt-1 border-t border-gray-200/60 font-bold"><span className="text-gray-700">Total Deduction</span><span className="text-[#1A1A1A]">{(parseFloat(amounts.usdc.replace(/,/g, '') || "0") + networkFee).toFixed(2)} USDC</span></div>
                
                <hr className="border-gray-200 my-3 sm:my-4" />
                
                <div className="flex justify-between"><span className="text-gray-500">To</span><span className="font-bold text-[#1A1A1A]">Crypto Wallet</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Network</span><span className="font-bold text-[#1A1A1A]">{recipient.network}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Label</span><span className="font-bold text-[#1A1A1A]">{recipient.accountName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="font-bold text-[#1A1A1A] max-w-[150px] truncate text-right">{recipient.walletAddress}</span></div>
              </div>
              <button onClick={() => setStep("PIN_VERIFICATION")} className="w-full bg-black text-white rounded-full py-3.5 sm:py-4 font-bold text-[14px] mt-6 hover:bg-gray-900 transition-colors flex justify-center items-center active:scale-[0.98]">
                Confirm Withdrawal Details
              </button>
            </div>
          )}

          {/* 🌟 PIN VERIFICATION STEP WITH TICKING CURSOR */}
          {step === "PIN_VERIFICATION" && (
            <div className="px-6 sm:px-8 pt-8 pb-12 sm:pb-8 flex flex-col items-center min-h-full animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="w-16 h-16 bg-[#F5F5F4] rounded-full flex items-center justify-center text-gray-800 mb-6">
                  <Lock size={28} />
               </div>
               <h3 className="text-[20px] font-bold text-center mb-2">Authorize Withdrawal</h3>
               <p className="text-[13px] text-gray-500 text-center mb-8">
                  Enter your 6-digit secure PIN to sign and authorize the transfer of {amounts.usdc} USDC on the blockchain.
               </p>

               <div className="relative flex justify-center gap-3 mb-8 w-full max-w-[280px]">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const isFilled = pinInput.length > i;
                    const isActive = pinInput.length === i;
                    
                    return (
                      <div 
                        key={i} 
                        className={`relative w-10 h-12 rounded-xl flex items-center justify-center text-xl font-bold border-2 transition-all duration-200 overflow-hidden
                          ${isFilled ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-black'} 
                          ${isActive ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-110' : ''}`
                        }
                      >
                        {isFilled && <span className="animate-in zoom-in duration-150">•</span>}
                        {isActive && !isFilled && <span className="w-px h-5 bg-blue-500 animate-pulse" />}
                      </div>
                    );
                  })}

                  <input 
                    type="password" 
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={pinInput}
                    onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setPinInput(val);
                        setError(null);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
               </div>

               <button 
                  onClick={submitWithdrawal} 
                  disabled={isLoading || pinInput.length !== 6} 
                  className={`w-full rounded-full py-4 font-bold text-[14px] mt-auto transition-all flex justify-center items-center ${pinInput.length === 6 ? "bg-black text-white shadow-lg active:scale-[0.98]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                 {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Sign & Withdraw USDC"}
               </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Smartphone, Wallet, Check, AlertCircle, X, Loader2, Info, Search } from "lucide-react";
import { FIAT_CURRENCIES } from "../../../utils/constants";
import { AccountData } from "../MainDashboard";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface MobileMoneyDepositProps {
  fiatConfig?: any; 
  onClose: () => void;
  onBack: () => void;
  onSuccess: (amount: string, currency: string, fiatAmount?: string, fiatSymbol?: string) => void;
  activeAccount?: AccountData | null;
  prefillData?: any; // 🌟 ADDED PROP
}

export const MobileMoneyDeposit = ({ fiatConfig, onClose, onBack, onSuccess, activeAccount, prefillData }: MobileMoneyDepositProps) => {
  const [step, setStep] = useState<"MOMO_CURRENCY" | "MOMO_DETAILS" | "MOMO_AMOUNT" | "MOMO_PROMPT" | "MOMO_PROCESSING">("MOMO_CURRENCY");
  
  // 🌟 THE OMNI-HEALER LOCK
  const hasConsumedPrefill = useRef(false);
  
  const availableCurrencies = FIAT_CURRENCIES.filter(c => {
     if (!fiatConfig) return true; 
     const config = fiatConfig[c.code];
     return config && config.methods.includes('mobile_money');
  });

  const [selectedCurrency, setSelectedCurrency] = useState(availableCurrencies.find((c:any) => c.code === "KES") || availableCurrencies[0]);
  const [bankAmounts, setBankAmounts] = useState({ fiat: "", usdc: "" });
  const [fiatFee, setFiatFee] = useState(0);
  const [currencySearchQuery, setCurrencySearchQuery] = useState(""); 
  const [momoPhoneNumber, setMomoPhoneNumber] = useState("");
  const [momoAccountName, setMomoAccountName] = useState("");
  
  const [processingPhase, setProcessingPhase] = useState<0 | 1 | 2>(0); 
  const [isInitiating, setIsInitiating] = useState(false);
  
  // 🌟 NEW: Track the specific transaction ID to poll against
  const [refId, setRefId] = useState("");

  const isMounted = useRef(true);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { 
      isMounted.current = false; 
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, []);

  const filteredCurrencies = availableCurrencies.filter((c: any) => c.code.toLowerCase().includes(currencySearchQuery.toLowerCase()) || c.name.toLowerCase().includes(currencySearchQuery.toLowerCase()));

  const handleBankAmountChange = (value: string, source: "fiat" | "usdc") => {
    hasConsumedPrefill.current = true; // 🔒 INSTANT LOCK: Invalidate AI data on user type
    
    let rawValue = value.replace(/,/g, '');
    const validChars = rawValue.replace(/[^0-9.]/g, '');
    if (!validChars) { setBankAmounts({ fiat: "", usdc: "" }); setFiatFee(0); return; }
    
    const parts = validChars.split('.');
    let formatted = parts[0];
    if (parts.length > 1) formatted += '.' + parts.slice(1).join('');
    const splitForCommas = formatted.split('.');
    if (splitForCommas[0]) splitForCommas[0] = splitForCommas[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const finalFormatted = splitForCommas.join('.');
    const cleanNumeric = parseFloat(finalFormatted.replace(/,/g, "")) || 0;

    const activeRate = fiatConfig && fiatConfig[selectedCurrency.code] 
        ? fiatConfig[selectedCurrency.code].rateToUsdc 
        : ((selectedCurrency as any).depositRate || (selectedCurrency as any).rate || 1);
        
    const formatCounterpart = (num: number) => {
      if (isNaN(num) || num <= 0) return "";
      const counterpartParts = num.toFixed(2).toString().split('.');
      counterpartParts[0] = counterpartParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return counterpartParts.join('.');
    };

    // 🌟 THE MATH FIX: 1.5% of Fiat Volume
    if (source === "fiat") {
      const calculatedFee = cleanNumeric * 0.015;
      setFiatFee(calculatedFee);
      const amountAfterFee = Math.max(0, cleanNumeric - calculatedFee);
      setBankAmounts({ fiat: finalFormatted, usdc: amountAfterFee > 0 ? formatCounterpart(amountAfterFee / activeRate) : "" });
    } else {
      const neededFiatAfterFee = cleanNumeric * activeRate;
      const calculatedFee = neededFiatAfterFee * 0.015;
      setFiatFee(calculatedFee);
      const totalFiat = neededFiatAfterFee > 0 ? neededFiatAfterFee + calculatedFee : 0;
      setBankAmounts({ usdc: finalFormatted, fiat: totalFiat > 0 ? formatCounterpart(totalFiat) : "" });
    }
  };

  // 🌟 THE OMNI-HEALER TRIGGER
  useEffect(() => {
    const activeRate = fiatConfig && fiatConfig[selectedCurrency.code] 
        ? fiatConfig[selectedCurrency.code].rateToUsdc 
        : ((selectedCurrency as any).depositRate || (selectedCurrency as any).rate || 1);

    if (!hasConsumedPrefill.current && prefillData?.amount && activeRate > 1) {
      handleBankAmountChange(prefillData.amount.toString(), "usdc");
      hasConsumedPrefill.current = true;
    }
  }, [fiatConfig, selectedCurrency, prefillData]);

  // 🌟 SECURE INITIATION: Hit backend to trigger the STK Push
  // 🌟 SECURE INITIATION: Hit backend to trigger the STK Push
  const initiateMomoDeposit = async () => {
    if (!activeAccount) {
      alert("Please log in to initiate a deposit.");
      return;
    }

    setIsInitiating(true);
    const totalFiatToSend = parseFloat(bankAmounts.fiat.replace(/,/g, ""));
    
    // 🌟 ROUTING FIX: Capture the exact Muxed Address for the Sub-Account
    const sweepDestinationAddress = activeAccount.muxedAddress || activeAccount.walletAddress || "";

    if (!sweepDestinationAddress) {
      alert("System Error: No secure deposit address found for this ledger. Please contact support.");
      setIsInitiating(false);
      return;
    }

    try {
      const authToken = localStorage.getItem("bingtellar_auth_token");

      const response = await fetch(`${API_BASE}/fiat/deposit/initiate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({
          userId: activeAccount.id, 
          fiatAmount: totalFiatToSend,
          fiatCurrency: selectedCurrency.code,
          paymentMethod: 'mobile_money',
          phoneNumber: momoPhoneNumber,
          accountName: momoAccountName,
          // 🌟 ROUTING FIX: Pass the address to the backend!
          destinationAddress: sweepDestinationAddress 
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to initiate deposit");

      // The STK push has been sent to the user's phone!
      setRefId(data.reference);

      // Notify the dashboard to update the pending list
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

      setStep("MOMO_PROMPT");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsInitiating(false);
    }
  };

  // 🌟 PRODUCTION FIX: Real Backend Polling for Telco Webhooks
  const startListeningForMomoWebhook = () => {
    setStep("MOMO_PROCESSING");
    setProcessingPhase(0); 

    // Initial visual queue that we registered the click
    setTimeout(() => {
      if (isMounted.current && processingPhase === 0) setProcessingPhase(1);
    }, 2000);

    // 🛡️ ACTUAL SECURE POLLING
    pollingInterval.current = setInterval(async () => {
      if (!activeAccount?.id || !refId) return;

      try {
        const authToken = localStorage.getItem("bingtellar_auth_token");
        const response = await fetch(`${API_BASE}/transactions/${activeAccount.id}?_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
          const txs = await response.json();
          // Find the exact transaction we initiated
          const liveTx = txs.find((tx: any) => String(tx.reference) === String(refId));

          if (liveTx && liveTx.status === "completed" && isMounted.current) {
            // THE TELCO WEBHOOK FIRED AND THE DB IS UPDATED!
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            setProcessingPhase(2);

            // Sync the entire dashboard so the main balance updates instantly
            window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

            setTimeout(() => {
              if (isMounted.current) {
                 onSuccess(bankAmounts.usdc, selectedCurrency.code, bankAmounts.fiat, selectedCurrency.symbol);
              }
            }, 1000);
          } else if (liveTx && liveTx.status === "rejected" && isMounted.current) {
            // User cancelled the STK push or had insufficient funds
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            alert("This transaction failed or was cancelled on your mobile device.");
            setStep("MOMO_CURRENCY");
          }
        }
      } catch (e) {
        // Silent catch for network hiccups during polling
      }
    }, 5000); // Poll every 5 seconds for the webhook update
  };

  const totalFiatToSend = parseFloat(bankAmounts.fiat.replace(/,/g, "")) || 0;
  const isBelowMin = totalFiatToSend > 0 && totalFiatToSend < (selectedCurrency as any).minAmount;
  const isAboveMax = totalFiatToSend > (selectedCurrency as any).maxAmount;
  const hasAmountError = isBelowMin || isAboveMax;
  const isBankAmountValid = parseFloat(bankAmounts.usdc.replace(/,/g, "")) > 0 && totalFiatToSend > fiatFee && !hasAmountError;

  const handleBackNavigation = () => {
    if (step === "MOMO_CURRENCY") onBack();
    else if (step === "MOMO_DETAILS") setStep("MOMO_CURRENCY");
    else if (step === "MOMO_AMOUNT") setStep("MOMO_DETAILS");
    else if (step === "MOMO_PROMPT") setStep("MOMO_AMOUNT");
  };

  const hideBackButton = step === "MOMO_PROCESSING";
  
  const activeRate = fiatConfig && fiatConfig[selectedCurrency.code] 
        ? fiatConfig[selectedCurrency.code].rateToUsdc 
        : ((selectedCurrency as any).depositRate || (selectedCurrency as any).rate || 1);

  return (
    <>
      <div className={`flex items-center justify-between px-6 pt-7 pb-6 bg-white relative z-20 shrink-0 ${["MOMO_CURRENCY", "MOMO_DETAILS", "MOMO_AMOUNT", "MOMO_PROMPT"].includes(step) ? "" : "border-b border-[#F5F5F4]"}`}>
        {!hideBackButton ? (
          <button onClick={handleBackNavigation} className="hover:bg-gray-100 p-1 rounded-full transition-colors"><ChevronLeft size={18} /></button>
        ) : <div className="w-6 h-6" />}
        
        <h2 className="text-[16px] font-bold text-[#1A1A1A]">
          {step === "MOMO_CURRENCY" && "Select mobile money currency"}
          {step === "MOMO_DETAILS" && "Account Details"}
          {step === "MOMO_AMOUNT" && "Add via mobile money"}
          {step === "MOMO_PROMPT" && "Authorize Payment"}
          {step === "MOMO_PROCESSING" && "Processing Deposit"}
        </h2>
        
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
      </div>

      <div className="relative bg-white flex-1 overflow-y-auto flex flex-col">
        <div className="px-6 py-5 sm:px-6 relative z-10 flex-1 flex flex-col">
          
          {step === "MOMO_CURRENCY" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex-1 flex flex-col -mt-2">
              <div className="relative mb-5">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
                <input type="text" placeholder="Search" value={currencySearchQuery} onChange={(e) => setCurrencySearchQuery(e.target.value)} className="w-full border border-[#E8E8E8] rounded-full py-3 pl-10 pr-4 text-[13px] outline-none focus:border-[#1A1A1A] transition-colors" />
              </div>
              <p className="text-[10px] font-bold text-[#878787] uppercase tracking-wider mb-2">Mobile Money Supported</p>
              <div className="space-y-1 -mx-2 flex-1 overflow-y-auto pb-4">
                {filteredCurrencies.filter((c: any) => c.code !== "USD").map((currency: any) => (
                  <button key={currency.code} onClick={() => { setSelectedCurrency(currency); setStep("MOMO_DETAILS"); }} className="w-full flex items-center justify-between p-3 rounded-[16px] hover:bg-[#F9F9F9] transition-colors group">
                    <div className="flex items-center gap-3">
                      <img src={currency.flagUrl} alt={currency.name} className="w-7 h-7 object-contain drop-shadow-sm" />
                      <div className="text-left"><h4 className="font-bold text-[14px] text-[#1A1A1A] leading-tight">{currency.code}</h4><p className="text-[12px] text-[#757575]">{currency.name}</p></div>
                    </div>
                    <ChevronRight size={18} className="text-[#A3A3A3] group-hover:text-[#1A1A1A] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "MOMO_DETAILS" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col flex-1 -mt-2 pb-2">
              <p className="text-[12px] text-[#757575] mb-5 leading-relaxed">Enter the details of the mobile money account you will be sending funds from.</p>
              <div className="space-y-3 mb-6">
                <div className="bg-white border border-gray-200 focus-within:border-black focus-within:ring-1 focus-within:ring-black rounded-[16px] p-3.5 transition-all">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Phone Number</span>
                  <input type="tel" placeholder={`e.g. +${selectedCurrency.code === "KES" ? "254" : selectedCurrency.code === "GHS" ? "233" : "000"} 700 000 000`} value={momoPhoneNumber} onChange={(e) => setMomoPhoneNumber(e.target.value)} className="w-full text-[14px] font-bold outline-none placeholder-gray-300 bg-transparent text-[#1A1A1A]" />
                </div>
                <div className="bg-white border border-gray-200 focus-within:border-black focus-within:ring-1 focus-within:ring-black rounded-[16px] p-3.5 transition-all">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Account Holder Name</span>
                  <input type="text" placeholder="e.g. John Doe" value={momoAccountName} onChange={(e) => setMomoAccountName(e.target.value)} className="w-full text-[14px] font-bold outline-none placeholder-gray-300 bg-transparent text-[#1A1A1A]" />
                </div>
              </div>
              <button disabled={!momoPhoneNumber || !momoAccountName} onClick={() => setStep("MOMO_AMOUNT")} className={`w-full rounded-[16px] py-3.5 font-bold text-[13px] mt-auto transition-all ${momoPhoneNumber && momoAccountName ? "bg-black text-white active:scale-95 shadow-lg shadow-black/10" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Continue</button>
            </div>
          )}

          {step === "MOMO_AMOUNT" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col flex-1 pb-2">
              <div className={`bg-white border ${hasAmountError ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500" : "border-gray-100 focus-within:border-black focus-within:ring-black"} focus-within:ring-1 rounded-[20px] p-5 mt-1 shadow-sm transition-all relative z-10`}>
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Smartphone size={12} /> You Send</span></div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5"><img src={(selectedCurrency as any).flagUrl} alt={selectedCurrency.code} className="w-8 h-8 object-contain drop-shadow-sm" /><span className="font-bold text-[16px]">{selectedCurrency.code}</span></div>
                  <input type="text" value={bankAmounts.fiat} onChange={(e) => handleBankAmountChange(e.target.value, "fiat")} placeholder="0.00" className={`text-right text-3xl font-bold outline-none w-1/2 placeholder-gray-200 bg-transparent ${hasAmountError ? "text-red-500" : "text-[#1A1A1A]"}`} />
                </div>
              </div>
              
              {hasAmountError && (
                <div className="flex items-center gap-1.5 text-red-500 mt-2 ml-4 animate-in fade-in"><AlertCircle size={14} /><span className="text-[11px] font-medium">{isBelowMin ? `Minimum amount is ${selectedCurrency.symbol}${(selectedCurrency as any).minAmount.toLocaleString()}` : `Maximum amount is ${selectedCurrency.symbol}${(selectedCurrency as any).maxAmount.toLocaleString()}`}</span></div>
              )}
              
              <div className="relative py-4 pl-[48px] pr-4 space-y-2 text-[11px] text-gray-400 mb-2">
                <div className="absolute left-[30px] top-0 bottom-0 border-l-[1.5px] border-dashed border-gray-200" />
                <div className="flex justify-between"><span>Fees</span><span>{selectedCurrency.symbol}{fiatFee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-[#1A1A1A]"><span>Amount after fees</span><span>{selectedCurrency.symbol}{Math.max(0, (totalFiatToSend) - fiatFee).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between font-bold text-black italic"><span>Exchange rate</span><span>1 USDC = {selectedCurrency.symbol}{activeRate.toLocaleString()}</span></div>
              </div>
              
              <div className="bg-white border border-gray-100 focus-within:border-black focus-within:ring-1 focus-within:ring-black rounded-[20px] p-5 mb-5 shadow-sm transition-all relative z-10">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-[#2775CA] rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner">$</div><span className="font-bold text-[16px]">USDC</span></div>
                  <input type="text" value={bankAmounts.usdc} onChange={(e) => handleBankAmountChange(e.target.value, "usdc")} placeholder="0.00" className="text-right text-3xl font-bold outline-none w-1/2 placeholder-gray-200 bg-transparent text-[#1A1A1A]" />
                </div>
                <div className="pt-3 mt-4 border-t border-gray-100 flex justify-between items-center"><span className="text-[11px] font-bold flex items-center gap-1.5"><Wallet size={12} className="text-gray-400" /> To Account Balance</span></div>
              </div>
              
              <button disabled={!isBankAmountValid || isInitiating} onClick={initiateMomoDeposit} className={`w-full rounded-[16px] py-3.5 font-bold text-[13px] mt-auto transition-all ${isBankAmountValid && !isInitiating ? "bg-black text-white active:scale-95 shadow-lg shadow-black/10" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                {isInitiating ? <Loader2 size={18} className="animate-spin text-gray-400" /> : "Continue"}
              </button>
            </div>
          )}

          {step === "MOMO_PROMPT" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col items-center text-center flex-1 pb-2">
              <div className="relative mb-6 mt-4">
                <div className="w-20 h-20 bg-[#F9F9F9] border border-[#E8E8E8] rounded-full flex items-center justify-center shadow-sm"><Smartphone size={32} className="text-[#2775CA] animate-pulse" /></div>
              </div>
              <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Check your phone</h2>
              <p className="text-[12px] text-[#757575] mb-6 max-w-[260px] leading-relaxed">We've sent a secure payment prompt to <span className="font-bold text-[#1A1A1A]">{momoPhoneNumber}</span>. Please enter your Mobile Money PIN to authorize the deposit.</p>
              <div className="w-full bg-[#FFF9F2] border border-[#FFE4C4] rounded-[16px] p-4 mb-6 text-left flex gap-2.5 items-start">
                <Info size={16} className="text-[#D2691E] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#8B4513] leading-[1.5]">Didn't receive a prompt? Make sure your phone is nearby, unlocked, and has network reception.</p>
              </div>
              
              {/* 🌟 REPLACED: Changed to production intent polling button */}
              <button onClick={startListeningForMomoWebhook} className="w-full flex justify-center items-center py-3.5 bg-black text-white rounded-[16px] text-[13px] font-bold transition-all shadow-lg shadow-black/10 hover:bg-gray-800 mt-auto">
                I have entered my PIN
              </button>
            </div>
          )}

          {step === "MOMO_PROCESSING" && (
            <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center flex-1 pb-8">
              <div className="relative mb-8 mt-4">
                <div className="absolute inset-0 bg-[#2775CA] rounded-full animate-ping opacity-20"></div>
                <div className="w-20 h-20 bg-[#E8F0FE] rounded-full flex items-center justify-center relative z-10 border-4 border-white shadow-sm">
                  <Loader2 size={32} className="text-[#2775CA] animate-spin" />
                </div>
              </div>
              <h3 className="text-[18px] font-bold text-[#1A1A1A] mb-6 tracking-tight">Syncing network...</h3>
              <div className="w-full max-w-[260px] space-y-6 relative">
                <div className="absolute left-[11px] top-4 bottom-4 border-l-[2px] border-[#F5F5F4] -z-10"></div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 1 ? 'bg-[#34A853] text-white' : 'bg-[#FFF9F2] border border-[#FDE68A] text-[#D97706]'}`}>
                    {processingPhase >= 1 ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 1 ? 'text-[#1A1A1A]' : 'text-[#D97706]'}`}>Prompt authorized</span>
                </div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 2 ? 'bg-[#34A853] text-white' : processingPhase === 1 ? 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#059669]' : 'bg-[#F5F5F4] text-[#A3A3A3]'}`}>
                    {processingPhase >= 2 ? <Check size={12} strokeWidth={3} /> : processingPhase === 1 ? <Loader2 size={12} className="animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 2 ? 'text-[#1A1A1A]' : processingPhase === 1 ? 'text-[#059669]' : 'text-[#A3A3A3]'}`}>Processing MoMo finality</span>
                </div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 2 ? 'bg-[#34A853] text-white' : 'bg-[#F5F5F4] text-[#A3A3A3]'}`}>
                    {processingPhase >= 2 ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 2 ? 'text-[#1A1A1A]' : 'text-[#A3A3A3]'}`}>Crediting USDC wallet</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
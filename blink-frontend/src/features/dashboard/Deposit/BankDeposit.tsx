import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Landmark, Wallet, Copy, Check, AlertCircle, X, Loader2, Clock, Search } from "lucide-react";
import { FIAT_CURRENCIES } from "../../../utils/constants";
import { AccountData } from "../MainDashboard";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface BankDepositProps {
  fiatConfig?: any; 
  onClose: () => void;
  onBack: () => void;
  onSuccess: (amount: string, currency: string, fiatAmount?: string, fiatSymbol?: string) => void;
  activeAccount?: AccountData | null;
  prefillData?: any; // 🌟 1. Added Prop
}

export const BankDeposit = ({ fiatConfig, onClose, onBack, onSuccess, activeAccount, prefillData }: BankDepositProps) => {
  const [step, setStep] = useState<"BANK_CURRENCY" | "BANK_AMOUNT" | "BANK_FUNDING_DETAILS" | "BANK_EXPIRED" | "BANK_PROCESSING">("BANK_CURRENCY");
  
  // 🌟 THE OMNI-HEALER LOCK
  const hasConsumedPrefill = useRef(false);
  
  const [selectedCurrency, setSelectedCurrency] = useState(FIAT_CURRENCIES[0]);
  const [bankAmounts, setBankAmounts] = useState({ fiat: "", usdc: "" });
  const [timeLeft, setTimeLeft] = useState(15 * 60); 
  const [refId, setRefId] = useState("");
  const [fiatFee, setFiatFee] = useState(0);
  const [currencySearchQuery, setCurrencySearchQuery] = useState(""); 
  
  const [depositInstructions, setDepositInstructions] = useState<any>(null);
  const [isInitiating, setIsInitiating] = useState(false);

  const [copiedBank, setCopiedBank] = useState(false);
  const [copiedAccountName, setCopiedAccountName] = useState(false);
  const [copiedBankName, setCopiedBankName] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const [processingPhase, setProcessingPhase] = useState<0 | 1 | 2>(0); 

  const isMounted = useRef(true);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const availableCurrencies = FIAT_CURRENCIES.filter(c => {
     if (!fiatConfig) return true; 
     const config = fiatConfig[c.code];
     return config && config.methods.includes('bank_transfer');
  });

  const filteredCurrencies = availableCurrencies.filter((c: any) => c.code.toLowerCase().includes(currencySearchQuery.toLowerCase()) || c.name.toLowerCase().includes(currencySearchQuery.toLowerCase()));

  useEffect(() => {
    isMounted.current = true;
    return () => { 
      isMounted.current = false; 
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "BANK_FUNDING_DETAILS" && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (step === "BANK_FUNDING_DETAILS" && timeLeft === 0) {
      setStep("BANK_EXPIRED");
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCopy = (text: string, type: 'bank' | 'ref' | 'accountName' | 'bankName' | 'amount') => {
    navigator.clipboard.writeText(text || "");
    if (type === 'bank') { setCopiedBank(true); setTimeout(() => setCopiedBank(false), 2000); }
    else if (type === 'ref') { setCopiedRef(true); setTimeout(() => setCopiedRef(false), 2000); }
    else if (type === 'accountName') { setCopiedAccountName(true); setTimeout(() => setCopiedAccountName(false), 2000); }
    else if (type === 'bankName') { setCopiedBankName(true); setTimeout(() => setCopiedBankName(false), 2000); }
    else if (type === 'amount') { setCopiedAmount(true); setTimeout(() => setCopiedAmount(false), 2000); }
  };

  const handleBankAmountChange = (value: string, source: "fiat" | "usdc") => {
    hasConsumedPrefill.current = true; // 🔒 INSTANT LOCK: Invalidate AI data on user type
    
    let rawValue = value.replace(/,/g, '');
    const validChars = rawValue.replace(/[^0-9.]/g, '');
    
    if (!validChars) {
      setBankAmounts({ fiat: "", usdc: "" });
      setFiatFee(0);
      return;
    }
    
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiatConfig, selectedCurrency, prefillData]);

  const initiateBankTransfer = async () => {
    if (!activeAccount) {
      alert("Please log in to initiate a deposit.");
      return;
    }

    setIsInitiating(true);
    const totalFiatToSend = parseFloat(bankAmounts.fiat.replace(/,/g, ""));
    
    // 🌟 INTEGRATION FIX: We must capture the exact Muxed/Stellar address the USDC should be swept to.
    const sweepDestinationAddress = activeAccount.muxedAddress || activeAccount.walletAddress || "";

    if (!sweepDestinationAddress) {
      alert("System Error: No secure deposit address found for this ledger. Please contact support.");
      setIsInitiating(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/fiat/deposit/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({
          userId: activeAccount.id, 
          fiatAmount: totalFiatToSend,
          fiatCurrency: selectedCurrency.code,
          paymentMethod: 'bank_transfer',
          destinationAddress: sweepDestinationAddress // 🌟 Pass to Backend to feed the Onramp Initialize payload
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to initiate deposit");

      setRefId(data.reference);
      setDepositInstructions(data.instructions);
      
      if (data.usdcAmountExpected) {
         setBankAmounts(prev => ({...prev, usdc: data.usdcAmountExpected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}));
      }

      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

      setTimeLeft(15 * 60);
      setStep("BANK_FUNDING_DETAILS");

    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsInitiating(false);
    }
  };

  const confirmBankDeposit = () => {
    setStep("BANK_PROCESSING");
    setProcessingPhase(0); 

    // Initial visual queue that we registered the click (AWAITING_FIAT_DEPOSIT phase)
    setTimeout(() => {
      if (isMounted.current && processingPhase === 0) setProcessingPhase(1);
    }, 2000);

    pollingInterval.current = setInterval(async () => {
      if (!activeAccount?.id || !refId) return;

      try {
        const response = await fetch(`${API_BASE}/transactions/${activeAccount.id}?_t=${Date.now()}`, {
            method: "GET",
            headers: { 'Content-Type': 'application/json' },
            credentials: "include"
        });

        if (response.ok) {
          const txs = await response.json();
          const liveTx = txs.find((tx: any) => String(tx.reference) === String(refId));

          if (liveTx) {
            // 🌟 INTEGRATION FIX: Map to the exact Liquidity Engine webhook states
            const status = liveTx.status?.toUpperCase();

            if (status === "AWAITING_TREASURY_SETTLEMENT") {
               // Fiat received, processing crypto dispatch
               setProcessingPhase(1); 
            } 
            else if (status === "COMPLETED") {
              if (pollingInterval.current) clearInterval(pollingInterval.current);
              setProcessingPhase(2);

              window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

              setTimeout(() => {
                if (isMounted.current) {
                   onSuccess(bankAmounts.usdc, selectedCurrency.code, bankAmounts.fiat, selectedCurrency.symbol);
                }
              }, 1000);
            } 
            else if (status === "FAILED" || status === "REJECTED") {
              if (pollingInterval.current) clearInterval(pollingInterval.current);
              alert(`Deposit failed: ${liveTx.failureReason || "Transaction rejected by provider."}`);
              setStep("BANK_CURRENCY");
            }
          }
        }
      } catch (e) {
        // Silent catch to prevent disrupting the polling loop
      }
    }, 5000); 
  };

  const totalFiatToSend = parseFloat(bankAmounts.fiat.replace(/,/g, "")) || 0;
  const isBelowMin = totalFiatToSend > 0 && totalFiatToSend < (selectedCurrency as any).minAmount;
  const isAboveMax = totalFiatToSend > (selectedCurrency as any).maxAmount;
  const hasAmountError = isBelowMin || isAboveMax;
  const isBankAmountValid = parseFloat(bankAmounts.usdc.replace(/,/g, "")) > 0 && totalFiatToSend > fiatFee && !hasAmountError;

  const handleBackNavigation = () => {
    if (step === "BANK_CURRENCY") onBack();
    else if (step === "BANK_AMOUNT") setStep("BANK_CURRENCY");
    else if (step === "BANK_FUNDING_DETAILS") setStep("BANK_AMOUNT");
  };

  const hideHeaders = step === "BANK_PROCESSING";
  
  const activeRate = fiatConfig && fiatConfig[selectedCurrency.code] 
        ? fiatConfig[selectedCurrency.code].rateToUsdc 
        : ((selectedCurrency as any).depositRate || (selectedCurrency as any).rate || 1);

  return (
    <>
      <div className={`flex items-center justify-between px-6 pt-5 pb-4 bg-white relative z-20 shrink-0 ${["BANK_CURRENCY", "BANK_AMOUNT", "BANK_FUNDING_DETAILS"].includes(step) ? "" : "border-b border-[#F5F5F4]"}`}>
        {!hideHeaders ? (
          <button onClick={handleBackNavigation} className="hover:bg-gray-100 p-1 rounded-full transition-colors"><ChevronLeft size={18} /></button>
        ) : <div className="w-6 h-6" />}
        
        <h2 className="text-[16px] font-bold text-[#1A1A1A]">
          {step === "BANK_CURRENCY" && "Select funding currency"}
          {step === "BANK_AMOUNT" && "Add via bank transfer"}
          {step === "BANK_FUNDING_DETAILS" && "Funding details"}
          {step === "BANK_PROCESSING" && "Processing Deposit"}
        </h2>
        
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
      </div>

      <div className="relative bg-white flex-1 overflow-y-auto flex flex-col">
        <div className={`px-6 sm:px-6 relative z-10 flex-1 flex flex-col ${step === "BANK_FUNDING_DETAILS" ? "pt-2 pb-4" : "pt-4 pb-6"}`}>
          
          {step === "BANK_CURRENCY" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex-1 flex flex-col">
              <div className="relative mb-5">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
                <input type="text" placeholder="Search" value={currencySearchQuery} onChange={(e) => setCurrencySearchQuery(e.target.value)} className="w-full border border-[#E8E8E8] rounded-full py-3 pl-10 pr-4 text-[13px] outline-none focus:border-[#1A1A1A] transition-colors" />
              </div>
              <p className="text-[10px] font-bold text-[#878787] uppercase tracking-wider mb-2">Available Currencies</p>
             <div className="space-y-1 -mx-2 pb-4 flex-1 overflow-y-auto">
                {filteredCurrencies.map((currency: any) => (
                  <button key={currency.code} onClick={() => { setSelectedCurrency(currency); setStep("BANK_AMOUNT"); }} className="w-full flex items-center justify-between p-3 rounded-[16px] hover:bg-[#F9F9F9] transition-colors group">
                    <div className="flex items-center gap-3">
                      <img src={currency.flagUrl} alt={currency.name} className="w-7 h-7 rounded-full object-cover shadow-sm" />
                      <div className="text-left"><h4 className="font-bold text-[14px] text-[#1A1A1A] leading-tight">{currency.code}</h4><p className="text-[12px] text-[#757575]">{currency.name}</p></div>
                    </div>
                    <ChevronRight size={18} className="text-[#A3A3A3] group-hover:text-[#1A1A1A] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "BANK_AMOUNT" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col flex-1 pb-2">
              <div className={`bg-white border ${hasAmountError ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500" : "border-gray-100 focus-within:border-black focus-within:ring-black"} focus-within:ring-1 rounded-[20px] p-5 shadow-sm transition-all relative z-10`}>
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Landmark size={12} /> You Send</span></div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5"><img src={(selectedCurrency as any).flagUrl} alt={selectedCurrency.code} className="w-8 h-8 rounded-full object-cover shadow-sm" /><span className="font-bold text-[16px]">{selectedCurrency.code}</span></div>
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
              
              <div className="bg-white border border-gray-100 focus-within:border-black focus-within:ring-1 focus-within:ring-black rounded-[20px] p-5 mb-6 shadow-sm transition-all relative z-10">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-[#2775CA] rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner">$</div><span className="font-bold text-[16px]">USDC</span></div>
                  <input type="text" value={bankAmounts.usdc} onChange={(e) => handleBankAmountChange(e.target.value, "usdc")} placeholder="0.00" className="text-right text-3xl font-bold outline-none w-1/2 placeholder-gray-200 bg-transparent text-[#1A1A1A]" />
                </div>
                <div className="pt-3 mt-4 border-t border-gray-100 flex justify-between items-center"><span className="text-[11px] font-bold flex items-center gap-1.5"><Wallet size={12} className="text-gray-400" /> To Account Balance</span></div>
              </div>
              
              <button disabled={!isBankAmountValid || isInitiating} onClick={initiateBankTransfer} className={`w-full mt-auto flex items-center justify-center py-3.5 rounded-[16px] font-bold text-[13px] transition-all ${isBankAmountValid && !isInitiating ? "bg-black text-white active:scale-[0.98] shadow-lg shadow-black/10" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                {isInitiating ? <Loader2 size={18} className="animate-spin text-gray-400" /> : "Continue"}
              </button>
            </div>
          )}

          {step === "BANK_FUNDING_DETAILS" && (
            <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col flex-1 pb-2">
              <p className="text-[12px] text-[#757575] mb-4 leading-relaxed">Make a transfer of exactly <span className="font-bold text-[#1A1A1A]">{selectedCurrency.code} {totalFiatToSend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> to this account details below.</p>
              
              <div className="border border-[#E8E8E8] rounded-[16px] bg-white overflow-hidden mb-4 shadow-sm">
                <div className="bg-[#F9FAFB] px-3.5 py-2.5 flex items-center gap-2 border-b border-[#E8E8E8]">
                  <div className="w-6 h-6 rounded-full bg-white border border-[#E8E8E8] flex items-center justify-center shrink-0"><Landmark size={10} className="text-[#D2691E]" /></div>
                  <span className="text-[12px] font-bold text-[#1A1A1A]">Receiving bank details</span>
                </div>
                <div className="p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#757575]">Account Number</span>
                    <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-[#1A1A1A]">{depositInstructions?.accountNumber}</span><button onClick={() => handleCopy(depositInstructions?.accountNumber, "bank")} className="text-[#757575] hover:text-[#1A1A1A] transition-colors relative">{copiedBank ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}</button></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#757575]">Account Name</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-[#1A1A1A] truncate max-w-[120px]">
                        {depositInstructions?.accountName}
                      </span>
                      <button onClick={() => handleCopy(depositInstructions?.accountName, "accountName")} className="text-[#757575] hover:text-[#1A1A1A] transition-colors shrink-0">
                        {copiedAccountName ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#757575]">Bank</span>
                    <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-[#1A1A1A]">{depositInstructions?.bankName}</span><button onClick={() => handleCopy(depositInstructions?.bankName, "bankName")} className="text-[#757575] hover:text-[#1A1A1A] transition-colors">{copiedBankName ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}</button></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#757575]">Amount + fee</span>
                    <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-[#1A1A1A]">{selectedCurrency.code} {totalFiatToSend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><button onClick={() => handleCopy(totalFiatToSend.toString(), "amount")} className="text-[#757575] hover:text-[#1A1A1A] transition-colors">{copiedAmount ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}</button></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#757575]">Reference</span>
                    <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-[#1A1A1A]">{refId}</span><button onClick={() => handleCopy(refId, "ref")} className="text-[#757575] hover:text-[#1A1A1A] transition-colors relative">{copiedRef ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}</button></div>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#FFF9F2] rounded-[14px] p-3.5 mb-4">
                <h4 className="text-[12px] font-bold text-[#1A1A1A] mb-1">Attention!</h4>
                <p className="text-[10px] text-[#757575] leading-relaxed mb-1">Make sure you always add the unique reference code generated for this deposit to your transfer narration.</p>
                <p className="text-[10px] text-[#757575] leading-relaxed">Ensure you send the exact amount from an account bearing your name.</p>
              </div>
              
              <div className="text-center mb-4"><p className="text-[11px] text-[#1A1A1A]">Expires in <span className="font-bold tabular-nums">{formatTime(timeLeft)} minutes</span></p></div>
              
              <button onClick={confirmBankDeposit} className="w-full mt-auto py-3.5 bg-black text-white rounded-[16px] text-[13px] font-bold hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm">Confirm - I've sent payment</button>
            </div>
          )}

          {step === "BANK_PROCESSING" && (
            <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center flex-1 pb-8">
              <div className="relative mb-8 mt-4">
                <div className="absolute inset-0 bg-[#2775CA] rounded-full animate-ping opacity-20"></div>
                <div className="w-20 h-20 bg-[#E8F0FE] rounded-full flex items-center justify-center relative z-10 border-4 border-white shadow-sm">
                  <Loader2 size={32} className="text-[#2775CA] animate-spin" />
                </div>
              </div>
              <h3 className="text-[18px] font-bold text-[#1A1A1A] mb-6 tracking-tight text-center">
                Awaiting Bank <br/> Confirmation
              </h3>
              <div className="w-full max-w-[260px] space-y-6 relative">
                <div className="absolute left-[11px] top-4 bottom-4 border-l-[2px] border-[#F5F5F4] -z-10"></div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 1 ? 'bg-[#34A853] text-white' : 'bg-[#FFF9F2] border border-[#FDE68A] text-[#D97706]'}`}>
                    {processingPhase >= 1 ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 1 ? 'text-[#1A1A1A]' : 'text-[#D97706]'}`}>Payment request received</span>
                </div>
                
                <div className="flex items-center gap-3 bg-white relative z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 shadow-sm ${processingPhase >= 2 ? 'bg-[#34A853] text-white' : processingPhase === 1 ? 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#059669]' : 'bg-[#F5F5F4] text-[#A3A3A3]'}`}>
                    {processingPhase >= 2 ? <Check size={12} strokeWidth={3} /> : processingPhase === 1 ? <Loader2 size={12} className="animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                  </div>
                  <span className={`text-[13px] font-medium transition-colors ${processingPhase >= 2 ? 'text-[#1A1A1A]' : processingPhase === 1 ? 'text-[#059669]' : 'text-[#A3A3A3]'}`}>Processing bank finality</span>
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

          {step === "BANK_EXPIRED" && (
            <div className="animate-in zoom-in-95 duration-500 flex flex-col items-center flex-1 text-center pt-10">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4"><Clock size={24} className="text-red-500" /></div>
              <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Time Expired</h2>
              
              <p className="text-[13px] text-[#757575] mb-16 max-w-[270px] leading-relaxed">
                The 15-minute window for this deposit has elapsed. This account has expired. Please try again if you haven't made payment. 
              </p>
              
              <div className="w-full flex flex-col gap-3 max-w-[340px]">
                <button 
                  onClick={() => { setStep("BANK_AMOUNT"); setTimeLeft(15 * 60); }} 
                  className="w-full py-3.5 bg-black text-white rounded-[16px] text-[13px] font-bold transition-all active:scale-[0.98]"
                >
                  Try again
                </button>
                <button 
                  onClick={confirmBankDeposit} 
                  className="w-full py-3.5 bg-white border border-[#E8E8E8] text-[#1A1A1A] rounded-[16px] text-[13px] font-bold hover:bg-[#F9F9F9] transition-all active:scale-[0.98]"
                >
                  I have made payment of {selectedCurrency.code} {totalFiatToSend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
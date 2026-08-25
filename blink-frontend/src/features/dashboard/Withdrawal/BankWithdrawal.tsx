import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Landmark, Search, Check, ChevronDown, Loader2, AlertCircle, Wallet, Lock } from "lucide-react";
import { TransactionData as BaseTxData } from "../MainDashboard";
import { FIAT_CURRENCIES } from "../../../utils/constants";
import { SorobanService } from "../../../services/SorobanService"; 
import { LocalCryptoUtil } from "../../../utils/LocalCryptoUtil";
import { useStore } from "../../../store/useStore";
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface ExtendedAccountData { id: string; name?: string; balance: number; walletAddress?: string; encryptedWalletKey?: string; [key: string]: any; }
export interface ExtendedTransactionData extends BaseTxData { fiatAmount?: number; fiatCurrency?: string; }

// STRICT SEPARATION: Only countries that support Bank Transfers
const regionData: Record<string, { flag: string; currencies: string[]; banks?: string[]; code: string }> = {
  // --- AFRICA ---
  Nigeria: { flag: "🇳🇬", currencies: ["NGN", "USD"], code: "NG", banks: ["Access Bank", "First Bank", "Guaranty Trust Bank", "Kuda Bank", "Moniepoint MFB", "Paycom (Opay)", "PalmPay", "Zenith Bank"] },
  Kenya: { flag: "🇰🇪", currencies: ["KES", "USD"], code: "KE", banks: ["Absa Bank Kenya", "Co-operative Bank", "Equity Bank", "I&M Bank", "KCB Bank", "NCBA Bank", "Stanbic Bank"] },
  Tanzania: { flag: "🇹🇿", currencies: ["TZS", "USD"], code: "TZ" },
  "South Africa": { flag: "🇿🇦", currencies: ["ZAR", "USD"], code: "ZA", banks: ["Standard Bank", "First National Bank (FNB)", "Absa Bank", "Nedbank", "Capitec Bank"] },
  Ghana: { flag: "🇬🇭", currencies: ["GHS", "USD"], code: "GH" },
  Uganda: { flag: "🇺🇬", currencies: ["UGX", "USD"], code: "UG" },
  Rwanda: { flag: "🇷🇼", currencies: ["RWF", "USD"], code: "RW" },
  "Ivory Coast": { flag: "🇨🇮", currencies: ["XOF", "USD"], code: "CI" },
  Cameroon: { flag: "🇨🇲", currencies: ["XAF", "USD"], code: "CM" },
  Egypt: { flag: "🇪🇬", currencies: ["EGP", "USD"], code: "EG" },
  "DR Congo": { flag: "🇨🇩", currencies: ["CDF", "USD"], code: "CD" },
  Zambia: { flag: "🇿🇲", currencies: ["ZMW", "USD"], code: "ZM" },

  // --- WESTERN CORRIDORS ---
  "United Kingdom": { flag: "🇬🇧", currencies: ["GBP", "USD"], code: "GB", banks: ["Barclays", "HSBC", "Lloyds Bank", "Monzo", "Revolut", "Starling Bank"] },
  "United States": { flag: "🇺🇸", currencies: ["USD"], code: "US", banks: ["JPMorgan Chase", "Bank of America", "Wells Fargo", "Citibank"] },

  // --- EUROPEAN CORRIDORS (ALL 35 NATIONS) ---
  Andorra: { flag: "🇦🇩", currencies: ["EUR", "USD"], code: "AD" },
  Austria: { flag: "🇦🇹", currencies: ["EUR", "USD"], code: "AT" },
  Belgium: { flag: "🇧🇪", currencies: ["EUR", "USD"], code: "BE" },
  Bulgaria: { flag: "🇧🇬", currencies: ["EUR", "USD"], code: "BG" },
  Croatia: { flag: "🇭🇷", currencies: ["EUR", "USD"], code: "HR" },
  "Czech Republic": { flag: "🇨🇿", currencies: ["EUR", "USD"], code: "CZ" },
  Denmark: { flag: "🇩🇰", currencies: ["EUR", "USD"], code: "DK" },
  Estonia: { flag: "🇪🇪", currencies: ["EUR", "USD"], code: "EE" },
  Finland: { flag: "🇫🇮", currencies: ["EUR", "USD"], code: "FI" },
  France: { flag: "🇫🇷", currencies: ["EUR", "USD"], code: "FR" },
  Germany: { flag: "🇩🇪", currencies: ["EUR", "USD"], code: "DE" },
  Greece: { flag: "🇬🇷", currencies: ["EUR", "USD"], code: "GR" },
  Hungary: { flag: "🇭🇺", currencies: ["EUR", "USD"], code: "HU" },
  Iceland: { flag: "🇮🇸", currencies: ["EUR", "USD"], code: "IS" },
  Ireland: { flag: "🇮🇪", currencies: ["EUR", "USD"], code: "IE" },
  Italy: { flag: "🇮🇹", currencies: ["EUR", "USD"], code: "IT" },
  Latvia: { flag: "🇱🇻", currencies: ["EUR", "USD"], code: "LV" },
  Liechtenstein: { flag: "🇱🇮", currencies: ["EUR", "USD"], code: "LI" },
  Lithuania: { flag: "🇱🇹", currencies: ["EUR", "USD"], code: "LT" },
  Luxembourg: { flag: "🇱🇺", currencies: ["EUR", "USD"], code: "LU" },
  Malta: { flag: "🇲🇹", currencies: ["EUR", "USD"], code: "MT" },
  Monaco: { flag: "🇲🇨", currencies: ["EUR", "USD"], code: "MC" },
  Netherlands: { flag: "🇳🇱", currencies: ["EUR", "USD"], code: "NL" },
  Norway: { flag: "🇳🇴", currencies: ["EUR", "USD"], code: "NO" },
  Poland: { flag: "🇵🇱", currencies: ["EUR", "USD"], code: "PL" },
  Portugal: { flag: "🇵🇹", currencies: ["EUR", "USD"], code: "PT" },
  Romania: { flag: "🇷🇴", currencies: ["EUR", "USD"], code: "RO" },
  "San Marino": { flag: "🇸🇲", currencies: ["EUR", "USD"], code: "SM" },
  Slovakia: { flag: "🇸🇰", currencies: ["EUR", "USD"], code: "SK" },
  Slovenia: { flag: "🇸🇮", currencies: ["EUR", "USD"], code: "SI" },
  Spain: { flag: "🇪🇸", currencies: ["EUR", "USD"], code: "ES" },
  Sweden: { flag: "🇸🇪", currencies: ["EUR", "USD"], code: "SE" },
  Switzerland: { flag: "🇨🇭", currencies: ["EUR", "USD"], code: "CH" },
  "Vatican City": { flag: "🇻🇦", currencies: ["EUR", "USD"], code: "VA" },

  // --- ASIAN & GLOBAL CORRIDORS ---
  China: { flag: "🇨🇳", currencies: ["CNY", "USD"], code: "CN", banks: ["Industrial and Commercial Bank of China", "China Construction Bank", "Agricultural Bank of China", "Bank of China", "Alipay", "WeChat Pay"] },
  Australia: { flag: "🇦🇺", currencies: ["AUD", "USD"], code: "AU" },
  "Hong Kong": { flag: "🇭🇰", currencies: ["HKD", "USD"], code: "HK" },
  India: { flag: "🇮🇳", currencies: ["INR", "USD"], code: "IN" },
  Singapore: { flag: "🇸🇬", currencies: ["SGD", "USD"], code: "SG" },
  "South Korea": { flag: "🇰🇷", currencies: ["KRW", "USD"], code: "KR" },
  Argentina: { flag: "🇦🇷", currencies: ["ARS", "USD"], code: "AR" },
  "United Arab Emirates": { flag: "🇦🇪", currencies: ["AED", "USD"], code: "AE" }
};

const FALLBACK_NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" }, { name: "First Bank of Nigeria", code: "011" }, 
  { name: "Guaranty Trust Bank", code: "058" }, { name: "Zenith Bank", code: "057" }, 
  { name: "United Bank for Africa", code: "033" }, { name: "Paycom (Opay)", code: "999992" }, 
  { name: "Kuda Bank", code: "090267" }, { name: "Moniepoint MFB", code: "090405" }, 
  { name: "PalmPay", code: "090317" }, { name: "Fidelity Bank", code: "070" },
  { name: "Standard Chartered Bank", code: "232" }, { name: "Sterling Bank", code: "232" }
];

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
    // 🌟 NEW SYMBOLS ADDED
    case "AUD": return "A$";
    case "HKD": return "HK$";
    case "INR": return "₹";
    case "SGD": return "S$";
    case "KRW": return "₩";
    case "ARS": return "$";
    case "AED": return "AED";
    case "CDF": return "FC";
    case "ZMW": return "ZK";
    case "BWP": return "P";
    default: return currency ? currency + " " : "¤"; 
  }
};

const MIN_WITHDRAWAL = 2; const MAX_WITHDRAWAL = 10000; 

interface BankWithdrawalProps { fiatConfig?: any; onClose: () => void; onBack: () => void; onSuccess: (data: any) => void; availableBalance: number; activeAccount?: ExtendedAccountData | null; prefillData?: any; }

export const BankWithdrawal = ({ fiatConfig, onClose, onBack, onSuccess, availableBalance, activeAccount, prefillData }: BankWithdrawalProps) => {
  const updateAccountBalance = useStore((state: any) => state.updateAccountBalance);
  // 🌟 THE FIX 1: Instantly load the AMOUNT screen if Radar Copilot provides bank details
  const [step, setStep] = useState<"RECIPIENT_LIST" | "NEW_RECIPIENT" | "AMOUNT" | "REVIEW" | "PIN_VERIFICATION">(() => {
    return (prefillData && prefillData.bankCountry) ? "AMOUNT" : "RECIPIENT_LIST";
  });
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");

  const [activeDropdown, setActiveDropdown] = useState<"country" | "currency" | "bank" | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [exchangeRate, setExchangeRate] = useState(() => {
    if (prefillData && prefillData.rate) return Number(prefillData.rate);
    return FIAT_CURRENCIES[0]?.withdrawalRate || 1;
  });
  
  const [savedRecipients, setSavedRecipients] = useState<any[]>([]);
  
  // 🌟 THE FIX 2: Instantly inject the AI's bank data into the Recipient State
  const [recipient, setRecipient] = useState(() => {
    if (prefillData && prefillData.bankCountry) {
      const region = regionData[prefillData.bankCountry];
      return {
        country: prefillData.bankCountry, 
        flag: region ? region.flag : "", 
        currency: region ? region.currencies[0] : "NGN", 
        bank: prefillData.bankName || "", 
        accountNumber: prefillData.details || "", 
        accountName: prefillData.name || "", 
        email: prefillData.email || "", 
        isOwner: false
      };
    }
    return { country: "", flag: "", currency: "", bank: "", accountNumber: "", accountName: "", email: "", isOwner: false };
  });
  
  const [amounts, setAmounts] = useState(() => {
    if (prefillData && prefillData.amount) {
      const validUsdc = prefillData.amount.toString().replace(/[^0-9.]/g, '');
      const usdcParts = validUsdc.split('.');
      let formattedUsdc = usdcParts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (usdcParts.length > 1) formattedUsdc += '.' + usdcParts.slice(1).join('');

      let formattedFiat = "";
      if (prefillData.estimatedPayout) {
         const validFiat = prefillData.estimatedPayout.toString().replace(/[^0-9.]/g, '');
         const fiatNum = parseFloat(validFiat);
         formattedFiat = isNaN(fiatNum) ? "" : fiatNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }
      return { usdc: formattedUsdc, fiat: formattedFiat };
    }
    return { usdc: "", fiat: "" };
  });

  // 2. NOW we can safely calculate railFee because 'recipient' exists
  const railFee = recipient.currency === "NGN" ? 50.00 : 0.00; 
  
  // 3. Restore the legacy fee variable used by your submitWithdrawal function
  // const fiatFee = 0;

  const [nigerianBanks, setNigerianBanks] = useState<{name: string, code: string}[]>([]);
  const [nonNgInstitutions, setNonNgInstitutions] = useState<{name: string, code: string}[]>([]); // 🌟 NEW STATE
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const [allowManualName, setAllowManualName] = useState(false);

  const isMounted = useRef(true);

  const loadSavedRecipients = useCallback(async () => {
    if (!activeAccount?.id) return;
    try {
      const res = await fetch(`${API_BASE}/users/${activeAccount.id}/recipients`, { method: 'GET', headers: { "Content-Type": "application/json" }, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      
      // 🌟 STRICT SEPARATION: Only load Bank recipients
      const bankRecs = data.filter((r: any) => r.type?.toLowerCase() === "bank");
      const mapped = bankRecs.map((r: any) => {
        const region = regionData[r.bankCountry || "Nigeria"];
        return {
          id: r.id, method: 'bank', accountName: r.name, accountNumber: r.details, bank: r.bankName,
          country: r.bankCountry, flag: region ? region.flag : "", currency: region ? region.currencies[0] : "NGN"
        };
      });
      if (isMounted.current) setSavedRecipients(mapped);
    } catch (err) { console.error("Failed to load saved recipients", err); }
  }, [activeAccount?.id]);

 useEffect(() => {
    isMounted.current = true;
    setIsFetchingData(true);
    
    loadSavedRecipients();
    fetchNigerianBanks().finally(() => {
      if (isMounted.current) setIsFetchingData(false);
    });
    
    return () => { isMounted.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  useEffect(() => {
    const handleSync = () => loadSavedRecipients();
    window.addEventListener('bingtellar_recipients_updated', handleSync);
    return () => window.removeEventListener('bingtellar_recipients_updated', handleSync);
  }, [loadSavedRecipients]);

  useEffect(() => {
    if (recipient.currency) {
      if (fiatConfig && fiatConfig[recipient.currency]) setExchangeRate(fiatConfig[recipient.currency].rateToFiat || fiatConfig[recipient.currency].rateToUsdc);
      else { const c = FIAT_CURRENCIES.find(c => c.code === recipient.currency); if (c) setExchangeRate(c.withdrawalRate); }
    }
  }, [recipient.currency, fiatConfig]);

  // 🌟 Fetch dynamic institutions when a non-Nigerian country is selected
  // 🌟 Trigger fetch when country OR currency changes
  useEffect(() => {
    if (recipient.country && recipient.country !== "Nigeria" && regionData[recipient.country]) {
      // 🌟 Get the active currency or default to the region's primary currency
      const activeCurrency = recipient.currency || regionData[recipient.country].currencies[0];
      fetchNonNgInstitutions(regionData[recipient.country].code, activeCurrency);
    } else if (recipient.country === "Nigeria") {
      setNonNgInstitutions([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient.country, recipient.currency]); 

  // 🌟 Accept currencyCode and append it to the URL
  const fetchNonNgInstitutions = async (countryCode: string, currencyCode: string) => {
    try {
      // 🌟 Added &currency=${currencyCode}
      const res = await fetch(`${API_BASE}/fiat/institutions?country=${countryCode}&channel=BANK_ACCOUNT&currency=${currencyCode}`, { 
        method: 'GET', headers: { "Content-Type": "application/json" }, credentials: 'include' 
      });
      
      if (!res.ok) throw new Error(`API status: ${res.status}`);
      const payload = await res.json();
      
      let bankArray: any[] = [];
      if (Array.isArray(payload)) bankArray = payload;
      else if (Array.isArray(payload.data)) bankArray = payload.data;
      else if (payload.data && Array.isArray(payload.data.data)) bankArray = payload.data.data;
      else if (payload.data && Array.isArray(payload.data.institutions)) bankArray = payload.data.institutions;
      else if (payload.data && Array.isArray(payload.data.banks)) bankArray = payload.data.banks;

      if (bankArray.length > 0) {
         const formatted = bankArray.map((b: any) => ({ 
           name: String(b.name || b.institutionName || b.bankName || b.bank_name || '').trim(), 
           code: String(b.code || b.institutionCode || b.bankCode || b.bank_code || '').trim() 
         })).filter(b => b.name !== '');

         if (isMounted.current && formatted.length > 0) {
           setNonNgInstitutions(formatted);
           return;
         }
      }
      throw new Error("Empty bank array returned from API");
    } catch (err) {
      console.warn(`Could not fetch institutions for ${countryCode}, using static fallback.`, err);
      const staticBanks = regionData[recipient.country]?.banks || [];
      if (isMounted.current && staticBanks.length > 0) {
        setNonNgInstitutions(staticBanks.map(name => ({ name, code: name.toUpperCase().replace(/\s+/g, '_') })));
      }
    }
  };

  // 🌟 Separate triggers for Nigerian NUBAN vs. International Lookups
  useEffect(() => {
    if (recipient.country === "Nigeria" && recipient.currency === "NGN" && recipient.bank && recipient.accountNumber.length === 10) {
      if (nigerianBanks.length === 0) return;
      resolveNubanAccount();
    } else if (recipient.country !== "Nigeria" && recipient.bank && recipient.accountNumber.trim().length >= 6) {
      resolveNonNgAccount(); // 🌟 Trigger International Resolver
    } else {
      if (recipient.country === "Nigeria" && recipient.accountNumber.length < 10) {
         setRecipient(prev => ({ ...prev, accountName: "" })); setAllowManualName(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient.accountNumber, recipient.bank, nigerianBanks, nonNgInstitutions]);

  const fetchNigerianBanks = async () => {
    try {
      const res = await fetch(`${API_BASE}/fiat/banks/ng`, { method: 'GET', headers: { "Content-Type": "application/json" }, credentials: 'include' });
      if (!res.ok) throw new Error(`API returned status: ${res.status}`);
      const payload = await res.json();
      
      let bankArray: any[] = [];
      if (Array.isArray(payload)) bankArray = payload; 
      else if (payload.data && Array.isArray(payload.data)) bankArray = payload.data; 
      else if (payload.banks && Array.isArray(payload.banks)) bankArray = payload.banks; 
      else if (payload.message && Array.isArray(payload.message)) bankArray = payload.message; 

      if (bankArray.length > 0) {
         const formatted = bankArray.map((b: any) => ({ name: b.name || b.bankName || b.bank_name, code: b.code || b.bankCode || b.bank_code }));
         if (isMounted.current) setNigerianBanks(formatted);
         return; 
      }
      throw new Error("Payload did not contain a recognizable array of banks.");
    } catch (err) {
      console.warn("Could not fetch live Nigerian banks from API, using fallback.", err);
      if (isMounted.current) setNigerianBanks(FALLBACK_NIGERIAN_BANKS);
    }
  };

  const resolveNubanAccount = async () => {
    setIsResolvingAccount(true); setError(null); setAllowManualName(false);
    setRecipient(prev => ({ ...prev, accountName: "" })); 
    
    try {
      const searchStr = recipient.bank.toLowerCase().trim();
      let selectedBank = nigerianBanks.find(b => b.name.toLowerCase() === searchStr);
      
      if (!selectedBank) {
          selectedBank = nigerianBanks.find(b => {
              const apiName = b.name.toLowerCase();
              if (searchStr.includes('opay') && (apiName.includes('paycom') || apiName.includes('opay'))) return true;
              if (searchStr.includes('gtb') && apiName.includes('guaranty')) return true;
              if (searchStr.includes('kuda') && apiName.includes('kuda')) return true;
              if (searchStr.includes('uba') && apiName.includes('united')) return true;
              if (searchStr.includes('palmpay') && apiName.includes('palmpay')) return true;
              if (searchStr.includes('moniepoint') && apiName.includes('moniepoint')) return true;
              return apiName.includes(searchStr) || searchStr.includes(apiName);
          });
      }

      if (!selectedBank) { setAllowManualName(true); throw new Error("Could not auto-verify this specific bank. Please type the account name manually."); }
      if (selectedBank.name !== recipient.bank) setRecipient(prev => ({ ...prev, bank: selectedBank!.name }));

      const res = await fetch(`${API_BASE}/fiat/banks/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ accountNumber: recipient.accountNumber, bankCode: selectedBank.code }) });
      const payload = await res.json();
      
      if (!res.ok) { setAllowManualName(true); throw new Error(payload.error || "Failed to resolve NUBAN account. Please type the name manually."); }
      setRecipient(prev => ({ ...prev, accountName: payload.accountName }));
    } catch (err: any) { setError(err.message); } finally { setIsResolvingAccount(false); }
  };

  // 🌟 Universal account resolver for non-Nigerian banks
  const resolveNonNgAccount = async () => {
    if (!recipient.accountNumber || !recipient.bank) return;
    setIsResolvingAccount(true); setError(null); setAllowManualName(false);
    setRecipient(prev => ({ ...prev, accountName: "" })); 
    
    try {
      const searchStr = recipient.bank.toLowerCase().trim();
      const selectedBank = nonNgInstitutions.find(b => 
        b.name.toLowerCase() === searchStr || searchStr.includes(b.name.toLowerCase())
      );

      if (!selectedBank) { 
          setAllowManualName(true); 
          throw new Error("Could not auto-verify this institution. Please type the account name manually."); 
      }

      const res = await fetch(`${API_BASE}/institutions/lookup`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', 
          body: JSON.stringify({ 
              accountNumber: recipient.accountNumber, 
              institutionCode: selectedBank.code,
              countryCode: regionData[recipient.country]?.code
          }) 
      });
      
      const payload = await res.json();
      if (!res.ok) { 
          setAllowManualName(true); 
          throw new Error(payload.error || "Failed to resolve account. Please type the name manually."); 
      }
      
      const resolvedName = payload.accountName || payload.data?.accountName || payload.data?.account_name;
      setRecipient(prev => ({ ...prev, accountName: resolvedName }));
    } catch (err: any) { setError(err.message); } finally { setIsResolvingAccount(false); }
  };

  
  const handleAmountChange = (value: string, source: "usdc" | "fiat") => {
    hasConsumedPrefill.current = true; // 🔒 INSTANT LOCK: Invalidate AI data on user type
    setError(null);
    const validChars = value.replace(/[^0-9.]/g, '');
    const parts = validChars.split('.');
    let formatted = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (parts.length > 1) formatted += '.' + parts.slice(1).join('');
    
    const numValue = parseFloat(formatted.replace(/,/g, "")) || 0;
    const formatCounterpart = (num: number) => isNaN(num) ? "" : num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    if (source === "usdc") {
      // 🌟 THE MATH FIX: Calculate Gross, deduct Rail Fee, determine Net
      const grossFiat = numValue * exchangeRate;
      let netFiat = grossFiat - railFee;
      if (netFiat < 0) netFiat = 0; // Prevent negative fiat projections
      
      setAmounts({ usdc: formatted, fiat: formatCounterpart(netFiat) });
    } else {
      // 🌟 THE MATH FIX: If typing Net Fiat, add Rail Fee to find required Gross USDC
      const grossFiat = numValue + railFee;
      const usdcNeeded = grossFiat / exchangeRate;
      
      setAmounts({ fiat: formatted, usdc: formatCounterpart(usdcNeeded) });
    }
  };

  // THE PERFECTED OMNI-HEALER
  const hasConsumedPrefill = useRef(false);

  useEffect(() => {
    let baseUsdc = amounts.usdc;
    if (!hasConsumedPrefill.current && prefillData?.amount) {
      baseUsdc = prefillData.amount.toString();
    }
    if (baseUsdc && exchangeRate > 1 && !hasConsumedPrefill.current) {
      handleAmountChange(baseUsdc, "usdc");
      hasConsumedPrefill.current = true; 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeRate, railFee, prefillData]);

  const handleSaveNewRecipient = async () => {
    if (!activeAccount?.id) return;
    setStep("AMOUNT"); 

    try {
      await fetch(`${API_BASE}/users/${activeAccount.id}/recipients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', 
        body: JSON.stringify({
          name: recipient.accountName, type: "Bank", details: recipient.accountNumber, email: recipient.email || undefined,
          bankCountry: recipient.country, bankName: recipient.bank
        })
      });
      window.dispatchEvent(new Event('bingtellar_recipients_updated'));
      loadSavedRecipients();
    } catch (err) { console.error("Failed to save recipient to cloud", err); }
  };

  const submitWithdrawal = async () => {
    if (pinInput.length < 6) return;
    if (!activeAccount || !activeAccount.encryptedWalletKey) { setError("Secure key missing from session. Please log out and log back in."); return; }

    setIsLoading(true); setError(null);

    // 🔥 TRUE OPTIMISTIC UI: Deduct instantly BEFORE the network request
    const withdrawnAmount = parseFloat(amounts.usdc.replace(/,/g, "")) || 0;
    const previousBalance = availableBalance;
    updateAccountBalance(activeAccount.id, Math.max(0, availableBalance - withdrawnAmount));

    try {
        const rawSecretKey = await LocalCryptoUtil.decrypt(activeAccount.encryptedWalletKey, pinInput);
        if (!rawSecretKey || !rawSecretKey.startsWith("S") || rawSecretKey.length !== 56) throw new Error("Incorrect PIN. Yielded invalid Secret Key.");

        const withdrawnAmount = parseFloat(amounts.usdc.replace(/,/g, "")) || 0;
        const fiatAmountValue = parseFloat(amounts.fiat.replace(/,/g, "")) || 0;
        
        const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS;
        if (!TREASURY_ADDRESS) throw new Error("FATAL: Environment configuration missing. Cannot execute blockchain settlement safely.");
      
        const signedXDR = await SorobanService.buildAndSignTransferXDR(rawSecretKey, TREASURY_ADDRESS, withdrawnAmount.toString());

        // 🌟 STRICT SEPARATION: This modal only ever sends bank_transfer
        const response = await fetch(`${API_BASE}/fiat/withdrawal/initiate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                userId: activeAccount.id, 
                usdcAmount: withdrawnAmount, 
                fiatCurrency: recipient.currency,
                paymentMethod: "bank_transfer", 
                signedXdr: signedXDR,           
                recipientDetails: { bankName: recipient.bank, accountNumber: recipient.accountNumber, accountName: recipient.accountName },
                // 🌟 THE FIX: Pass the exact locked client math to the backend!
                clientExchangeRate: exchangeRate,
                clientRailFee: railFee,
                clientNetFiat: fiatAmountValue,
                // 🌟 RADAR AUDIT TRAIL: Explicitly pass the note to override the backend's JSON fallback
                note: prefillData ? "Initiated via Radar Copilot" : "Bank Withdrawal"
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Backend failed to process withdrawal");
        const confirmedTxHash = data.blockchainTxHash || data.txHash;

        onSuccess({
            method: "bank_transfer", amounts, recipient, 
            txDetails: { id: data.reference, hash: confirmedTxHash, fee: `Free`, date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status: data.status }
        });
    } catch (err: any) { 
        updateAccountBalance(activeAccount.id, previousBalance); // 🔥 ROLLBACK
        setError(err.message || "Transaction failed. Please try again."); 
        setPinInput(""); 
    } finally { setIsLoading(false); }
  };

  const activeBankList = recipient.country === "Nigeria" 
    ? (nigerianBanks.length > 0 ? nigerianBanks.map(b => b.name) : FALLBACK_NIGERIAN_BANKS.map(b => b.name))
    : (nonNgInstitutions.length > 0 
        ? nonNgInstitutions.map(b => b.name) 
        : (regionData[recipient.country]?.banks || []));
  const isNubanCountry = recipient.country === "Nigeria" && recipient.currency === "NGN";
  const isRecipientValid = recipient.country !== "" && recipient.currency !== "" && recipient.bank !== "" && recipient.accountNumber.trim().length >= 8 && recipient.accountName.trim() !== "" && !isResolvingAccount;
  
  const parsedUsdc = parseFloat(amounts.usdc.replace(/,/g, '') || "0");
  const isInsufficient = parsedUsdc > availableBalance;
  const isBelowMin = parsedUsdc > 0 && parsedUsdc < MIN_WITHDRAWAL;
  const isAboveMax = parsedUsdc > MAX_WITHDRAWAL;
  const hasAmountError = isInsufficient || isBelowMin || isAboveMax;
  const isAmountValid = parsedUsdc >= MIN_WITHDRAWAL && parsedUsdc <= MAX_WITHDRAWAL && !isInsufficient;

  const handleContinue = () => {
    if (activeAccount?.kycStatus !== 'approved' || !activeAccount?.isReady) {
      toast.error(<div className="flex flex-col text-left ml-1 mt-0.5"><span className="text-[14px] font-bold text-[#DC2626] mb-0.5 tracking-tight">Action not approved</span><span className="text-[12px] font-medium text-[#DC2626]/80 leading-snug">Your Blink account has not been verified and activated yet. Contact <strong className="font-bold text-[#DC2626]">support@ourblink.cash</strong></span></div>, { duration: 5000, position: 'top-center', style: { background: '#FEF2F2', border: '1px solid #FECACA', padding: '14px 16px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.15)', maxWidth: '380px', alignItems: 'flex-start' } }); return; 
    }
    setStep("REVIEW");
  };

  return (
    <>
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-3 flex items-center justify-between z-10 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => { if (step === "PIN_VERIFICATION") setStep("REVIEW"); else if (step === "REVIEW") setStep("AMOUNT"); else if (step === "AMOUNT") setStep("RECIPIENT_LIST"); else onBack(); }} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={20} /></button>
          <h2 className="text-[16px] sm:text-[18px] font-bold text-[#1A1A1A]">{step === "RECIPIENT_LIST" && "Select recipient"}{step === "NEW_RECIPIENT" && "New recipient details"}{step === "AMOUNT" && "Amount"}{step === "REVIEW" && "Review transaction"}{step === "PIN_VERIFICATION" && "Security Verification"}</h2>
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
              <button onClick={() => { setRecipient({ country: "", flag: "", currency: "", bank: "", accountNumber: "", accountName: "", email: "", isOwner: false }); setStep("NEW_RECIPIENT"); }} className="w-full bg-black text-white rounded-full py-3.5 font-bold text-[14px] mb-8 shadow-lg shadow-black/10 active:scale-[0.98]">+ Add new recipient</button>

              {savedRecipients.filter(r => r.accountName.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                <div className="space-y-4">
                  <h4 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-4">Saved Beneficiaries</h4>
                  {savedRecipients.filter(r => r.accountName.toLowerCase().includes(searchTerm.toLowerCase())).map((rec) => (
                    <div key={rec.id} onClick={() => { setRecipient({ ...recipient, ...rec }); setStep("AMOUNT"); }} className="flex items-center justify-between p-4 rounded-[20px] border border-gray-100 hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98]">
                      <div className="flex items-center gap-4 text-left"><div className="w-10 h-10 bg-[#87CEF5] rounded-full flex items-center justify-center text-gray-600 font-bold text-[14px]">{rec.accountName.charAt(0).toUpperCase()}</div><div><h4 className="font-bold text-[14px]">{rec.accountName}</h4><p className="text-[12px] text-gray-500">{rec.bank} • {rec.accountNumber}</p></div></div><ChevronRight size={16} className="text-gray-300" />
                    </div>
                  ))}
                </div>
              ) : (<div className="flex items-center gap-4"><div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-red-500 shrink-0"><Wallet size={18} /></div><div className="text-left"><h4 className="font-bold text-[15px]">No saved recipient yet</h4><p className="text-[13px] text-[#757575]">Frequent beneficiaries will be displayed here</p></div></div>)}
            </div>
          )}

          {step === "NEW_RECIPIENT" && (
            <div className="px-6 sm:px-8 py-4 sm:py-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="relative z-40">
                  <div onClick={() => { setActiveDropdown(activeDropdown === "country" ? null : "country"); setSearchTerm(""); }} className="w-full bg-[#F9F9F9] rounded-[16px] p-4 text-[14px] flex justify-between items-center cursor-pointer border border-transparent hover:border-gray-200">
                    <span className={recipient.country ? "text-black" : "text-gray-500"}>{recipient.country ? `${recipient.flag} ${recipient.country}` : "Select Country"}</span><ChevronDown size={18} className="text-gray-400" />
                  </div>
                  {activeDropdown === "country" && (
                    <div className="absolute top-[105%] left-0 right-0 bg-white border border-gray-100 rounded-[16px] shadow-xl p-3 animate-in fade-in slide-in-from-top-2">
                      <div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search country" className="w-full bg-[#F9F9F9] rounded-lg py-2.5 pl-9 pr-3 outline-none text-[13px]" /></div>
                      <div className="max-h-[160px] overflow-y-auto">
                        {Object.keys(regionData).filter(c => c.toLowerCase().includes(searchTerm.toLowerCase())).map((c) => (
                          <div key={c} onClick={() => { setRecipient({ ...recipient, country: c, flag: regionData[c].flag, currency: "", bank: "", accountNumber: "", accountName: "" }); setActiveDropdown(null); }} className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer flex items-center gap-3 text-[13px]"><span>{regionData[c].flag}</span> {c}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="relative z-30">
                  <div onClick={() => { if (recipient.country) { setActiveDropdown(activeDropdown === "currency" ? null : "currency"); setSearchTerm(""); } }} className={`w-full bg-[#F9F9F9] rounded-[16px] p-4 text-[14px] flex justify-between items-center border border-transparent transition-all ${!recipient.country ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-200"}`}>
                    <span className={recipient.currency ? "text-black" : "text-gray-500"}>{recipient.currency || "Select Currency"}</span><ChevronDown size={18} className="text-gray-400" />
                  </div>
                  {activeDropdown === "currency" && recipient.country && (
                    <div className="absolute top-[105%] left-0 right-0 bg-white border border-gray-100 rounded-[16px] shadow-xl p-3 animate-in fade-in slide-in-from-top-2">
                      <div className="max-h-[160px] overflow-y-auto">
                        {regionData[recipient.country].currencies.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase())).map((curr) => (
                          <div key={curr} onClick={() => { setRecipient({ ...recipient, currency: curr, bank: "", accountNumber: "", accountName: "" }); setActiveDropdown(null); }} className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer text-[13px]">{curr}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="relative z-20">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={recipient.bank}
                      onChange={(e) => {
                         setRecipient({ ...recipient, bank: e.target.value, accountName: "" });
                         if(isNubanCountry && recipient.accountNumber.length === 10) resolveNubanAccount();
                         if(recipient.country) setActiveDropdown("bank");
                      }}
                      onFocus={() => { if(recipient.country) setActiveDropdown("bank") }}
                      disabled={!recipient.country} 
                      placeholder="Bank or Financial Institution" 
                      className={`w-full bg-[#F9F9F9] rounded-[16px] p-4 pr-10 text-[14px] outline-none border border-transparent focus:border-gray-300 transition-all ${!recipient.country && "opacity-50 cursor-not-allowed"}`} 
                    />
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer" onClick={() => { if (recipient.country) setActiveDropdown(activeDropdown === "bank" ? null : "bank"); }} />
                  </div>
                  {activeDropdown === "bank" && recipient.country && (
                    <div className="absolute top-[105%] left-0 right-0 bg-white border border-gray-100 rounded-[16px] shadow-xl p-3 animate-in fade-in slide-in-from-top-2">
                      <div className="max-h-[160px] overflow-y-auto">
                        {activeBankList.filter(b => b.toLowerCase().includes(recipient.bank.toLowerCase())).map((b) => (
                          <div key={b} onClick={() => { setRecipient({ ...recipient, bank: b, accountName: "" }); setActiveDropdown(null); }} className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer text-[13px]">{b}</div>
                        ))}
                        {activeBankList.filter(b => b.toLowerCase().includes(recipient.bank.toLowerCase())).length === 0 && (
                           <div className="p-3 text-gray-400 italic rounded-lg text-[12px]">{isNubanCountry ? `No bank found matching "${recipient.bank}"` : "Type provider manually if not listed"}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <input 
                  type="text" 
                  value={recipient.accountNumber} 
                  disabled={!recipient.country} 
                  placeholder={isNubanCountry ? "10-digit NUBAN" : "Account number"} 
                  className={`w-full bg-[#F9F9F9] rounded-[16px] p-4 text-[14px] outline-none focus:border-gray-300 border transition-all ${!recipient.country && "opacity-50 cursor-not-allowed"} ${(recipient.accountNumber && recipient.accountNumber.trim().length < 8) || (isNubanCountry && recipient.accountNumber.length > 0 && recipient.accountNumber.length !== 10) ? "border-red-300 focus:border-red-400" : "border-transparent"}`} 
                  onChange={(e) => {
                     const val = e.target.value.replace(/\D/g, ''); 
                     setRecipient({ ...recipient, accountNumber: val });
                     setAllowManualName(false); 
                  }} 
                />
                
                <div className="relative">
                  <input 
                    type="text" 
                    value={recipient.accountName} 
                    disabled={(isNubanCountry && !allowManualName) || isResolvingAccount}
                    placeholder={isResolvingAccount ? "Verifying account details..." : "Account holder name"} 
                    className={`w-full bg-[#F9F9F9] border rounded-[16px] p-4 pr-10 text-[14px] outline-none transition-all 
                       ${isResolvingAccount ? "border-blue-300 bg-blue-50 text-blue-600 font-medium animate-pulse" : "border-transparent focus:border-gray-200"}
                       ${isNubanCountry && !isResolvingAccount && recipient.accountName && !allowManualName ? "bg-green-50 text-gray-700 font-bold border-green-200" : ""}
                       ${isNubanCountry && !isResolvingAccount && !recipient.accountName && !allowManualName ? "text-gray-400 cursor-not-allowed" : ""}
                    `} 
                    onChange={(e) => setRecipient({ ...recipient, accountName: e.target.value }) } 
                  />
                  {isResolvingAccount && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500" size={18} />}
                  {isNubanCountry && !isResolvingAccount && recipient.accountName && !allowManualName && <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-green-600" size={18} />}
                </div>

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
              <div className={`bg-white border rounded-[20px] p-5 relative z-10 transition-colors ${hasAmountError ? "border-red-400" : "border-gray-100"}`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Wallet size={14} /> From Balance</span>
                  <div className={`flex items-center gap-1.5 text-[12px] font-bold ${isInsufficient ? "text-red-500" : "text-[#1A1A1A]"}`}>
                    <span>${availableBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    <button onClick={() => handleAmountChange(availableBalance.toString(), "usdc")} className="text-[#2775CA] bg-transparent hover:bg-gray-50 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider transition-colors">Max</button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#2775CA] rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner">$</div><span className="font-bold text-[16px] sm:text-[18px]">USDC</span></div>
                  <input type="text" value={amounts.usdc} onChange={(e) => handleAmountChange(e.target.value, "usdc")} placeholder="0.00" className={`text-right text-3xl sm:text-4xl font-bold outline-none w-1/2 placeholder-gray-200 ${hasAmountError ? "text-red-500" : "text-[#1A1A1A]"}`} />
                </div>
              </div>

              {hasAmountError && (
                <div className="flex items-center gap-1.5 text-red-500 text-[11px] sm:text-[12px] font-medium px-2 mt-2 mb-1 animate-in fade-in zoom-in duration-200">
                  <AlertCircle size={14} /><span>{isInsufficient ? "Please ensure you have enough funds." : isBelowMin ? `Minimum withdrawal is $${MIN_WITHDRAWAL.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC.` : `Maximum withdrawal is $${MAX_WITHDRAWAL.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC.`}</span>
                </div>
              )}

              <div className={`relative py-3 sm:py-4 pl-[44px] sm:pl-[52px] pr-4 space-y-1.5 text-[11px] sm:text-[12px] text-gray-400 ${!hasAmountError ? "mt-1" : "mt-0"}`}>
                <div className="absolute left-[28px] sm:left-[32px] top-0 bottom-0 border-l-[1.5px] border-dashed border-gray-200" />
                <div className="flex justify-between"><span>Gross Conversion</span><span className="font-medium">{recipient.currency} {((parseFloat(amounts.usdc.replace(/,/g, '')) || 0) * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span>Bank Rail Fee</span><span className="font-medium">-{recipient.currency} {railFee.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Net Delivered</span><span className="text-[#34A853] font-bold">{recipient.currency} {amounts.fiat || "0.00"}</span></div>
                <div className="flex justify-between font-bold text-black italic mt-1 pt-1 border-t border-gray-100"><span>Execution Rate</span><span>$1 = {Number(exchangeRate).toFixed(2)}</span></div>
              </div>

              <div className="bg-white border border-gray-100 rounded-[20px] p-5 mb-4 relative z-10">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#34A853] rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner">{getCurrencySymbol(recipient.currency)}</div>
                    <span className="font-bold text-[16px] sm:text-[18px]">{recipient.currency}</span>
                  </div>
                  <input type="text" value={amounts.fiat} onChange={(e) => handleAmountChange(e.target.value, "fiat")} placeholder="0.00" className="text-right text-3xl sm:text-4xl font-bold outline-none w-1/2 placeholder-gray-200" />
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center sm:hidden">
                    <span className="text-[11px] font-bold flex items-center gap-2"><Landmark size={14} className="text-gray-400" /> To Bank - <span className="text-black truncate max-w-[120px]">{recipient.accountName || "Recipient"}</span></span>
                    <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-[11px] font-bold underline text-black shrink-0">{isDetailsOpen ? "Hide details" : "View details"}</button>
                  </div>

                  <div className="hidden sm:flex flex-col gap-1.5 pt-1">
                    <span className="text-[12px] font-bold flex items-center gap-2 text-gray-500"><Landmark size={14} className="text-gray-400" /> To Bank</span>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-bold text-black truncate pr-4">{recipient.accountName || "Recipient"}</span>
                      <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-[12px] font-bold underline text-black shrink-0 hover:text-gray-700 transition-colors">{isDetailsOpen ? "Hide details" : "View details"}</button>
                    </div>
                  </div>
                </div>
                {isDetailsOpen && (
                  <div className="mt-2 pt-2 border-t border-dashed border-gray-100 space-y-1 text-[11px] sm:text-[12px] animate-in slide-in-from-top-2">
                    <div className="flex justify-between text-gray-500"><span>Account holder name</span><span className="font-bold text-black">{recipient.accountName}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Account number</span><span className="font-bold text-black">{recipient.accountNumber}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Bank name</span><span className="font-bold text-black">{recipient.bank}</span></div>
                  </div>
                )}
              </div>
              
              <div className="mt-auto pt-2 pb-6">
                <button disabled={!isAmountValid} onClick={handleContinue} className={`w-full rounded-full py-3.5 font-bold text-[14px] transition-all ${isAmountValid ? "bg-black text-white active:scale-95 shadow-lg shadow-black/10" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>Continue</button>
              </div>
            </div>
          )}

          {step === "REVIEW" && (
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-10 sm:pb-8 flex flex-col min-h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-[#F9F9F9] border border-gray-100 rounded-[20px] p-5 sm:p-6 space-y-3.5 sm:space-y-4 text-[13px] sm:text-[14px]">
                <div className="flex justify-between"><span className="text-gray-500">Withdraw</span><span className="font-bold text-[#1A1A1A]">{amounts.usdc} USDC</span></div>
                <div className="flex justify-between"><span className="text-gray-500">From</span><span className="font-bold text-[#1A1A1A]">USDC Balance</span></div>
                
                <hr className="border-gray-200 my-2" />
                
                <div className="flex justify-between"><span className="text-gray-500">Gross Conversion</span><span className="font-bold text-[#1A1A1A]">{recipient.currency} {((parseFloat(amounts.usdc.replace(/,/g, '')) || 0) * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Bank Rail Fee</span><span className="font-bold text-[#1A1A1A]">-{recipient.currency} {railFee.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Net Delivered</span><span className="font-bold text-[#34A853]">{amounts.fiat} {recipient.currency}</span></div>
                
                <hr className="border-gray-200 my-2" />
                
                <div className="flex justify-between"><span className="text-gray-500">To</span><span className="font-bold text-[#1A1A1A]">Bank account</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Bank name</span><span className="font-bold text-[#1A1A1A]">{recipient.bank}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Account name</span><span className="font-bold text-[#1A1A1A] max-w-[150px] truncate text-right">{recipient.accountName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Account number</span><span className="font-bold text-[#1A1A1A] max-w-[150px] truncate text-right">{recipient.accountNumber}</span></div>
              </div>
              <button onClick={() => setStep("PIN_VERIFICATION")} className="w-full bg-black text-white rounded-full py-3.5 sm:py-4 font-bold text-[14px] mt-6 hover:bg-gray-900 transition-colors flex justify-center items-center active:scale-[0.98]">Confirm Withdrawal Details</button>
            </div>
          )}

          {step === "PIN_VERIFICATION" && (
            <div className="px-6 sm:px-8 pt-8 pb-12 sm:pb-8 flex flex-col items-center min-h-full animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="w-16 h-16 bg-[#F5F5F4] rounded-full flex items-center justify-center text-gray-800 mb-6"><Lock size={28} /></div>
               <h3 className="text-[20px] font-bold text-center mb-2">Authorize Withdrawal</h3>
               <p className="text-[13px] text-gray-500 text-center mb-8">Enter your 6-digit secure PIN to sign and authorize the transfer of {amounts.usdc} USDC on the blockchain.</p>

               <div className="relative flex justify-center gap-3 mb-8 w-full max-w-[280px]">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const isFilled = pinInput.length > i;
                    const isActive = pinInput.length === i;
                    return (
                      <div key={i} className={`relative w-10 h-12 rounded-xl flex items-center justify-center text-xl font-bold border-2 transition-all duration-200 overflow-hidden ${isFilled ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-black'} ${isActive ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-110' : ''}`}>
                        {isFilled && <span className="animate-in zoom-in duration-150">•</span>}
                        {isActive && !isFilled && <span className="w-px h-5 bg-blue-500 animate-pulse" />}
                      </div>
                    );
                  })}
                  <input type="password" inputMode="numeric" maxLength={6} autoFocus value={pinInput} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setPinInput(val); setError(null); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
               </div>

               <button onClick={submitWithdrawal} disabled={isLoading || pinInput.length !== 6} className={`w-full rounded-full py-4 font-bold text-[14px] mt-auto transition-all flex justify-center items-center ${pinInput.length === 6 ? "bg-black text-white shadow-lg active:scale-[0.98]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                 {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Sign & Withdraw USDC"}
               </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
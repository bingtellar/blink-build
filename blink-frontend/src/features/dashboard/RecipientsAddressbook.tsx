import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Search, MoreHorizontal, X, ArrowUpRight, ChevronDown, AlertCircle, Loader2, Check } from "lucide-react";
import { useStore } from "../../store/useStore";
import toast from 'react-hot-toast'; 

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface Recipient {
  id: string | number; name: string; type: string; details: string; email?: string;
  walletAddress?: string; beneficiaryType?: string; bankCountry?: string; bankName?: string;
  accountTypeOption?: string; routingNumber?: string; momoCountry?: string; momoNetwork?: string;
  token?: string; network?: string; dateAdded: string; 
}

// 🌟 STRICT SEPARATION: Global Region Map
const regionData: Record<string, { code: string; currencies: string[]; isBank?: boolean; isMomo?: boolean }> = {
  // --- AFRICA ---
  Nigeria: { code: "NG", currencies: ["NGN", "USD"], isBank: true },
  Kenya: { code: "KE", currencies: ["KES", "USD"], isBank: true, isMomo: true },
  "South Africa": { code: "ZA", currencies: ["ZAR", "USD"], isBank: true },
  Ghana: { code: "GH", currencies: ["GHS", "USD"], isBank: true, isMomo: true },
  Uganda: { code: "UG", currencies: ["UGX", "USD"], isBank: true, isMomo: true },
  Rwanda: { code: "RW", currencies: ["RWF", "USD"], isBank: true, isMomo: true },
  Tanzania: { code: "TZ", currencies: ["TZS", "USD"], isBank: true, isMomo: true },
  "Ivory Coast": { code: "CI", currencies: ["XOF", "USD"], isBank: true, isMomo: true },
  Cameroon: { code: "CM", currencies: ["XAF", "USD"], isBank: true, isMomo: true },
  Egypt: { code: "EG", currencies: ["EGP", "USD"], isBank: true, isMomo: true },
  Zambia: { code: "ZM", currencies: ["ZMW", "USD"], isBank: true },

  // --- WESTERN CORRIDORS ---
  "United Kingdom": { code: "GB", currencies: ["GBP", "USD"], isBank: true },
  "United States": { code: "US", currencies: ["USD"], isBank: true },

  // --- EUROPEAN CORRIDORS (ALL 35 NATIONS) ---
  Andorra: { code: "AD", currencies: ["EUR", "USD"], isBank: true },
  Austria: { code: "AT", currencies: ["EUR", "USD"], isBank: true },
  Belgium: { code: "BE", currencies: ["EUR", "USD"], isBank: true },
  Bulgaria: { code: "BG", currencies: ["EUR", "USD"], isBank: true },
  Croatia: { code: "HR", currencies: ["EUR", "USD"], isBank: true },
  "Czech Republic": { code: "CZ", currencies: ["EUR", "USD"], isBank: true },
  Denmark: { code: "DK", currencies: ["EUR", "USD"], isBank: true },
  Estonia: { code: "EE", currencies: ["EUR", "USD"], isBank: true },
  Finland: { code: "FI", currencies: ["EUR", "USD"], isBank: true },
  France: { code: "FR", currencies: ["EUR", "USD"], isBank: true },
  Germany: { code: "DE", currencies: ["EUR", "USD"], isBank: true },
  Greece: { code: "GR", currencies: ["EUR", "USD"], isBank: true },
  Hungary: { code: "HU", currencies: ["EUR", "USD"], isBank: true },
  Iceland: { code: "IS", currencies: ["EUR", "USD"], isBank: true },
  Ireland: { code: "IE", currencies: ["EUR", "USD"], isBank: true },
  Italy: { code: "IT", currencies: ["EUR", "USD"], isBank: true },
  Latvia: { code: "LV", currencies: ["EUR", "USD"], isBank: true },
  Liechtenstein: { code: "LI", currencies: ["EUR", "USD"], isBank: true },
  Lithuania: { code: "LT", currencies: ["EUR", "USD"], isBank: true },
  Luxembourg: { code: "LU", currencies: ["EUR", "USD"], isBank: true },
  Malta: { code: "MT", currencies: ["EUR", "USD"], isBank: true },
  Monaco: { code: "MC", currencies: ["EUR", "USD"], isBank: true },
  Netherlands: { code: "NL", currencies: ["EUR", "USD"], isBank: true },
  Norway: { code: "NO", currencies: ["EUR", "USD"], isBank: true },
  Poland: { code: "PL", currencies: ["EUR", "USD"], isBank: true },
  Portugal: { code: "PT", currencies: ["EUR", "USD"], isBank: true },
  Romania: { code: "RO", currencies: ["EUR", "USD"], isBank: true },
  "San Marino": { code: "SM", currencies: ["EUR", "USD"], isBank: true },
  Slovakia: { code: "SK", currencies: ["EUR", "USD"], isBank: true },
  Slovenia: { code: "SI", currencies: ["EUR", "USD"], isBank: true },
  Spain: { code: "ES", currencies: ["EUR", "USD"], isBank: true },
  Sweden: { code: "SE", currencies: ["EUR", "USD"], isBank: true },
  Switzerland: { code: "CH", currencies: ["EUR", "USD"], isBank: true },
  "Vatican City": { code: "VA", currencies: ["EUR", "USD"], isBank: true },

  // --- ASIAN & GLOBAL CORRIDORS ---
  China: { code: "CN", currencies: ["CNY", "USD"], isBank: true },
  Australia: { code: "AU", currencies: ["AUD", "USD"], isBank: true },
  "Hong Kong": { code: "HK", currencies: ["HKD", "USD"], isBank: true },
  India: { code: "IN", currencies: ["INR", "USD"], isBank: true },
  Singapore: { code: "SG", currencies: ["SGD", "USD"], isBank: true },
  "South Korea": { code: "KR", currencies: ["KRW", "USD"], isBank: true },
  Argentina: { code: "AR", currencies: ["ARS", "USD"], isBank: true },
  "United Arab Emirates": { code: "AE", currencies: ["AED", "USD"], isBank: true }
};

const BANK_COUNTRIES = Object.keys(regionData).filter(c => regionData[c].isBank);
const MOMO_COUNTRIES = Object.keys(regionData).filter(c => regionData[c].isMomo);

const FALLBACK_NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" }, { name: "First Bank of Nigeria", code: "011" }, 
  { name: "Guaranty Trust Bank", code: "058" }, { name: "Zenith Bank", code: "057" }, 
  { name: "United Bank for Africa", code: "033" }, { name: "Paycom (Opay)", code: "999992" }, 
  { name: "Kuda Bank", code: "090267" }, { name: "Moniepoint MFB", code: "090405" }, 
  { name: "PalmPay", code: "090317" }, { name: "Fidelity Bank", code: "070" }
];

const CRYPTO_TOKENS = ["USDC", "USDT"];
const CRYPTO_NETWORKS = ["Tron (TRC20)", "Ethereum (ERC20)", "Binance Smart Chain (BEP20)", "Polygon", "Solana", "Stellar"];

interface CustomSelectProps { label: string; value: string; onChange: (val: string) => void; options: string[]; placeholder?: string; searchable?: boolean; disabled?: boolean; }
const CustomSelect = ({ label, value, onChange, options, placeholder = "Select...", searchable = false, disabled = false }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const safeOptions = Array.isArray(options) ? options : [];
  const filteredOptions = safeOptions.filter(opt => opt.toLowerCase().includes(searchValue.toLowerCase()));

  return (
    <div className="relative">
      <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">{label}</label>
      <div onClick={() => !disabled && setIsOpen(!isOpen)} className={`w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] flex justify-between items-center transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-black'}`}>
        <span className={value ? "text-[#1A1A1A] truncate pr-4" : "text-gray-400"}>{value || placeholder}</span>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSearchValue(""); }} />
          <div className="absolute left-0 right-0 top-[76px] mt-1 bg-white border border-[#E8E8E8] rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[220px] animate-in fade-in zoom-in-95 duration-200">
            {searchable && (
              <div className="p-2 border-b border-[#F0F0EF] shrink-0 bg-white">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input autoFocus type="text" placeholder="Search options..." value={searchValue} onChange={(e) => setSearchValue(e.target.value)} className="w-full bg-[#F5F5F4] rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-gray-300" />
                </div>
              </div>
            )}
            <div className="overflow-y-auto scrollbar-hide py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-gray-500 text-center">No results found</div>
              ) : (
                filteredOptions.map((opt) => (
                  <div key={opt} onClick={() => { onChange(opt); setIsOpen(false); setSearchValue(""); }} className={`px-4 py-2.5 text-[13px] cursor-pointer transition-colors ${value === opt ? 'bg-gray-100 font-bold text-[#1A1A1A]' : 'text-[#1A1A1A] hover:bg-[#F9F9F8]'}`}>
                    {opt}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const RecipientsSkeleton = () => (
  <div className="w-full overflow-visible pb-24 animate-in fade-in duration-300">
    <table className="w-full text-left border-collapse whitespace-nowrap table-fixed">
      <thead>
        <tr className="border-b border-[#F0F0EF]">
          <th className="py-4 pr-4 w-[35%] lg:w-[30%]"><div className="h-3 w-16 bg-[#F3F4F6] rounded animate-pulse" /></th>
          <th className="hidden md:table-cell py-4 px-2 w-[15%]"><div className="h-3 w-24 bg-[#F3F4F6] rounded animate-pulse" /></th>
          <th className="hidden sm:table-cell py-4 px-2 w-[25%] lg:w-[25%]"><div className="h-3 w-28 bg-[#F3F4F6] rounded animate-pulse" /></th>
          <th className="hidden lg:table-cell py-4 px-2 w-[15%]"><div className="h-3 w-20 bg-[#F3F4F6] rounded animate-pulse" /></th>
          <th className="py-4 px-2 w-[80px]"><div className="h-3 w-12 bg-[#F3F4F6] rounded animate-pulse mx-auto" /></th>
          <th className="py-4 pl-2 w-[60px]"><div className="h-3 w-8 bg-[#F3F4F6] rounded animate-pulse ml-auto" /></th>
        </tr>
      </thead>
      <tbody>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <tr key={i} className="border-b border-[#F0F0EF]">
            <td className="py-5 pr-4"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-[#F3F4F6] rounded-full animate-pulse shrink-0" /><div className="h-4 w-24 sm:w-32 bg-[#F3F4F6] rounded animate-pulse" /></div></td>
            <td className="hidden md:table-cell py-5 px-4"><div className="h-4 w-20 bg-[#F3F4F6] rounded animate-pulse" /></td>
            <td className="hidden sm:table-cell py-5 px-4"><div className="h-4 w-40 bg-[#F3F4F6] rounded animate-pulse" /></td>
            <td className="hidden lg:table-cell py-5 px-4"><div className="h-4 w-12 bg-[#F3F4F6] rounded animate-pulse" /></td>
            <td className="py-5 px-4"><div className="flex justify-center"><div className="w-[24px] h-[24px] bg-[#F3F4F6] rounded-full animate-pulse" /></div></td>
            <td className="py-5 pl-4"><div className="flex justify-end"><div className="w-8 h-8 bg-[#F3F4F6] rounded-full animate-pulse" /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export interface RecipientsAddressbookProps { onInitiatePay?: (recipient: any) => void; isFetching?: boolean; }

export const RecipientsAddressbook = ({ onInitiatePay, isFetching = false }: RecipientsAddressbookProps) => {
  const activeAccount = useStore((state) => state.activeAccount) as any;

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDBFetching, setIsDBFetching] = useState(true);

  const tabs = ['All', 'Email', 'Bank', 'Mobile money', 'Wallet'];
  const [activeTab, setActiveTab] = useState('All');

  const isMounted = useRef(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Email");
  const [newDetails, setNewDetails] = useState("");
  
  const [beneficiaryType, setBeneficiaryType] = useState("Individual");
  const [bankCountry, setBankCountry] = useState(BANK_COUNTRIES[0]);
  const [bankName, setBankName] = useState("");
  const [accountTypeOption, setAccountTypeOption] = useState("Checking / Current Account");
  const [routingNumber, setRoutingNumber] = useState("");
  const [momoCountry, setMomoCountry] = useState(MOMO_COUNTRIES[0]);
  const [momoNetwork, setMomoNetwork] = useState("");
  const [token, setToken] = useState(CRYPTO_TOKENS[0]);
  const [network, setNetwork] = useState(CRYPTO_NETWORKS[0]);

  const [nigerianBanks, setNigerianBanks] = useState<{name: string, code: string}[]>([]);
  const [dynamicInstitutions, setDynamicInstitutions] = useState<{name: string, code: string}[]>([]); 
  // const [activeInstitutionCode, setActiveInstitutionCode] = useState("");
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const [allowManualName, setAllowManualName] = useState(false);

  useEffect(() => { setErrorMsg(""); }, [newType, bankCountry, momoCountry, network]);

  useEffect(() => {
    if (errorMsg) { const timer = setTimeout(() => setErrorMsg(""), 4000); return () => clearTimeout(timer); }
  }, [errorMsg]);

  const fetchNigerianBanks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fiat/banks/ng`, { 
        method: 'GET',
        headers: { "Content-Type": "application/json" },
        credentials: 'include' 
      });
      if (!res.ok) throw new Error(`API returned status: ${res.status}`);
      
      const payload = await res.json();
      
      let bankArray: any[] = [];
      if (Array.isArray(payload)) bankArray = payload; 
      else if (payload.data && Array.isArray(payload.data)) bankArray = payload.data; 
      else if (payload.banks && Array.isArray(payload.banks)) bankArray = payload.banks; 
      else if (payload.message && Array.isArray(payload.message)) bankArray = payload.message; 

      if (bankArray.length > 0) {
         const formatted = bankArray.map((b: any) => ({ name: b.name || b.bankName || b.bank_code, code: b.code || b.bankCode || b.bank_code }));
         if (isMounted.current) setNigerianBanks(formatted);
         return; 
      }
      throw new Error("Invalid format");
    } catch (err) {
      console.warn("Could not fetch live Nigerian banks, falling back.", err);
      if (isMounted.current) setNigerianBanks(FALLBACK_NIGERIAN_BANKS);
    }
  }, []);

  const loadRecipients = async () => {
    if (!activeAccount?.id) return;
    setIsDBFetching(true);
    try {
      const res = await fetch(`${API_BASE}/users/${activeAccount.id}/recipients`, { 
        method: 'GET',
        headers: { "Content-Type": "application/json" },
        credentials: 'include' 
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      
      // 🌟 THE FIX 1: Auto-Migration Engine
      // Silently catches legacy "Nigerian Mobile Money" database records and maps them to Bank transfers.
      const mapped = data.map((r: any) => {
         let resolvedType = r.type;
         let resolvedBankCountry = r.bankCountry;
         let resolvedBankName = r.bankName;

         if (resolvedType?.toLowerCase().includes('mobile') && (r.momoCountry === 'Nigeria' || r.bankCountry === 'Nigeria')) {
             resolvedType = 'Bank';
             resolvedBankCountry = 'Nigeria';
             resolvedBankName = r.momoNetwork || r.bankName || "Paycom (Opay)"; 
         }

         return { ...r, type: resolvedType, bankCountry: resolvedBankCountry, bankName: resolvedBankName, dateAdded: r.createdAt };
      });

      if (isMounted.current) setRecipients(mapped);
    } catch (err) { console.error("Failed to load saved recipients", err); } 
    finally { if (isMounted.current) setIsDBFetching(false); }
  };

  useEffect(() => {
    isMounted.current = true;
    loadRecipients();
    fetchNigerianBanks();
    
    window.addEventListener('bingtellar_recipients_updated', loadRecipients);
    return () => { isMounted.current = false; window.removeEventListener('bingtellar_recipients_updated', loadRecipients); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, fetchNigerianBanks]);

  // 🌟 DYNAMIC INSTITUTION FETCHER
  useEffect(() => {
    const fetchInstitutions = async () => {
      const targetCountry = newType === "Bank" ? bankCountry : momoCountry;
      const channel = newType === "Bank" ? "BANK_ACCOUNT" : "MOBILE_MONEY";
      
      if (!targetCountry || !regionData[targetCountry]) return;
      
      if (newType === "Bank" && targetCountry === "Nigeria") {
          setDynamicInstitutions(nigerianBanks);
          return;
      }

      try {
        const countryCode = regionData[targetCountry].code;
        const currencyCode = regionData[targetCountry].currencies[0];
        
        const res = await fetch(`${API_BASE}/fiat/institutions?country=${countryCode}&channel=${channel}&currency=${currencyCode}`, { 
          method: 'GET', headers: { "Content-Type": "application/json" }, credentials: 'include' 
        });
        
        if (!res.ok) throw new Error(`API status: ${res.status}`);
        const payload = await res.json();
        
        let instArray: any[] = [];
        if (Array.isArray(payload)) instArray = payload;
        else if (Array.isArray(payload.data)) instArray = payload.data;
        else if (payload.data && Array.isArray(payload.data.data)) instArray = payload.data.data;
        else if (payload.data && Array.isArray(payload.data.institutions)) instArray = payload.data.institutions;
        else if (payload.data && Array.isArray(payload.data.banks)) instArray = payload.data.banks;

        if (instArray.length > 0) {
           const formatted = instArray.map((b: any) => ({ 
             name: String(b.name || b.institutionName || b.bankName || '').trim(), 
             code: String(b.code || b.institutionCode || b.bankCode || '').trim() 
           })).filter(b => b.name !== '');

           if (isMounted.current) {
               setDynamicInstitutions(formatted);
               
               if (newType === "Bank" && !bankName) {
                   setBankName(formatted[0].name);
               } else if (newType === "Mobile money" && !momoNetwork) {
                   setMomoNetwork(formatted[0].name);
               }
           }
        }
      } catch (err) {
        console.warn(`Could not fetch institutions for ${targetCountry}`, err);
        setDynamicInstitutions([]);
      }
    };

    fetchInstitutions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankCountry, momoCountry, newType, nigerianBanks]);

  // 🌟 THE UNIVERSAL RESOLVER TRIGGER
  useEffect(() => {
     const isNuban = newType === "Bank" && bankCountry === "Nigeria" && newDetails.length === 10;
     const isInternationalBank = newType === "Bank" && bankCountry !== "Nigeria" && newDetails.length >= 6;
     const isMobileMoney = newType === "Mobile money" && newDetails.length >= 8;
     
     if (isNuban) {
         if (nigerianBanks.length === 0) return;
         resolveAccount(newDetails, bankName, true);
     } else if (isInternationalBank || isMobileMoney) {
         if (dynamicInstitutions.length === 0) return;
         const targetName = newType === "Bank" ? bankName : momoNetwork;
         resolveAccount(newDetails, targetName, false);
     } else {
        if (newDetails.length < 6) {
           setNewName("");
           setAllowManualName(false);
        }
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDetails, bankName, momoNetwork, newType, bankCountry, momoCountry, nigerianBanks, dynamicInstitutions]);

  // 🌟 THE UNIVERSAL ACCOUNT RESOLVER
  const resolveAccount = async (accNumber: string, targetName: string, isNubanCountry: boolean) => {
    setIsResolvingAccount(true); setErrorMsg(""); setNewName(""); setAllowManualName(false);
    
    try {
      const searchStr = targetName.toLowerCase().trim();
      const institutionList = isNubanCountry ? nigerianBanks : dynamicInstitutions;
      
      let selectedInst = institutionList.find(b => b.name.toLowerCase() === searchStr);
      
      if (!selectedInst && isNubanCountry) {
          selectedInst = institutionList.find(b => {
              const apiName = b.name.toLowerCase();
              if (searchStr.includes('opay') && (apiName.includes('paycom') || apiName.includes('opay'))) return true;
              if (searchStr.includes('gtb') && apiName.includes('guaranty')) return true;
              if (searchStr.includes('uba') && apiName.includes('united')) return true;
              return apiName.includes(searchStr) || searchStr.includes(apiName);
          });
      }

      if (!selectedInst) {
          setAllowManualName(true);
          throw new Error("Could not auto-verify this provider. Please type the name manually.");
      }

      if (newType === "Bank" && bankName !== selectedInst.name) setBankName(selectedInst.name);
      if (newType === "Mobile money" && momoNetwork !== selectedInst.name) setMomoNetwork(selectedInst.name);

      const endpoint = isNubanCountry ? `${API_BASE}/fiat/banks/resolve` : `${API_BASE}/institutions/lookup`;
      const payloadBody = isNubanCountry 
          ? { accountNumber: accNumber, bankCode: selectedInst.code }
          : { 
              accountNumber: accNumber, 
              institutionCode: selectedInst.code,
              countryCode: regionData[newType === "Bank" ? bankCountry : momoCountry]?.code
            };

      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', 
        body: JSON.stringify(payloadBody)
      });
      
      const payload = await res.json();
      if (!res.ok) {
          setAllowManualName(true);
          throw new Error(payload.error || payload.message || "Failed to resolve account. Please type the name manually.");
      }
      
      const resolvedName = payload.accountName || payload.data?.accountName || payload.data?.account_name;
      setNewName(resolvedName);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsResolvingAccount(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg("");
    
    if (!activeAccount?.id) { setErrorMsg("You must be logged in to save recipients."); return; }
    if (!newName.trim() || !newDetails.trim()) { setErrorMsg("Please fill in all required fields."); return; }
    
    const isNubanCountry = newType === "Bank" && bankCountry === "Nigeria";
    if (isNubanCountry && isResolvingAccount) { setErrorMsg("Please wait for account verification to complete."); return; }

    if (newType === "Email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newDetails.trim())) { setErrorMsg("Please enter a valid email address."); return; }

    if (newType === "Bank") {
      if (!bankCountry || !bankName) { setErrorMsg("Please select a valid Bank Country and Bank Name."); return; }
      if (bankCountry === "United States" && (!routingNumber.trim() || !/^\d{9}$/.test(routingNumber.trim()))) { setErrorMsg("A valid 9-digit routing number is required for US banks."); return; }
      if (!/^\d+$/.test(newDetails.trim().replace(/\s/g, ''))) { setErrorMsg("Account number must contain only numbers."); return; }
    }

    if (newType === "Mobile money") {
      if (!momoCountry || !momoNetwork) { setErrorMsg("Please select a valid Country and Network."); return; }
      if (!/^\+?\d{8,15}$/.test(newDetails.trim().replace(/[\s-]/g, ''))) { setErrorMsg("Please enter a valid phone number."); return; }
    }

    if (newType === "Wallet") {
      if (!token || !network) { setErrorMsg("Please select a Token and Network."); return; }
      const address = newDetails.trim(); let isValid = false;

      if (network === "Ethereum (ERC20)" || network === "Binance Smart Chain (BEP20)" || network === "Polygon") {
        isValid = /^0x[a-fA-F0-9]{40}$/.test(address); if (!isValid) setErrorMsg(`Invalid ${network} address. It must start with '0x' and be exactly 42 characters long.`);
      } else if (network === "Tron (TRC20)") {
        isValid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address); if (!isValid) setErrorMsg("Invalid Tron address. It must start with a capital 'T' and be 34 characters long.");
      } else if (network === "Solana") {
        isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address); if (!isValid) setErrorMsg("Invalid Solana address.");
      } else if (network === "Stellar") {
        isValid = /^G[A-Z0-9]{55}$/.test(address); if (!isValid) setErrorMsg("Invalid Stellar address.");
      } else {
        isValid = /^[a-zA-Z0-9]+$/.test(address); if (!isValid) setErrorMsg("Please enter a valid wallet address.");
      }
      if (!isValid) return; 
    }

    const payload = {
      name: newName.trim(), type: newType, details: newDetails.trim().replace(/\s/g, ''),
      email: newType === "Email" ? newDetails.trim() : undefined,
      walletAddress: newType === "Wallet" ? newDetails.trim() : undefined,
      ...(newType === "Bank" && { beneficiaryType, bankCountry, bankName, accountTypeOption: bankCountry === "United States" ? accountTypeOption : undefined, routingNumber: bankCountry === "United States" ? routingNumber.trim() : undefined }),
      ...(newType === "Mobile money" && { beneficiaryType, momoCountry, momoNetwork }),
      ...(newType === "Wallet" && { token, network })
    };

    try {
      const method = editingId ? 'PATCH' : 'POST';
      const endpoint = editingId ? `${API_BASE}/users/${activeAccount.id}/recipients/${editingId}` : `${API_BASE}/users/${activeAccount.id}/recipients`;

      const res = await fetch(endpoint, { 
        method, 
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', 
        body: JSON.stringify(payload) 
      });
      
      if (res.ok) {
        toast.success(`Recipient ${editingId ? 'updated' : 'saved'} successfully!`, { style: { background: '#1A1A1A', color: '#fff', borderRadius: '12px' } });
        closeModal(); loadRecipients(); window.dispatchEvent(new Event('bingtellar_recipients_updated'));
      } else {
        const errorData = await res.json(); setErrorMsg(errorData.error || "Failed to save recipient to cloud.");
      }
    } catch (err) { console.error("Save error", err); setErrorMsg("Network error. Please try again."); }
  };

  // 🌟 THE FIX 2: Defensive State Loading to Prevent Modal Crash
  const handleEdit = (recipient: Recipient) => {
    setEditingId(String(recipient.id)); 
    setNewName(recipient.name);
    setNewType(recipient.type || (recipient.email ? "Email" : "Wallet"));
    setNewDetails(recipient.details || recipient.email || recipient.walletAddress || ""); 
    setErrorMsg("");
    
    if (recipient.type === "Bank") {
      setBeneficiaryType(recipient.beneficiaryType || "Individual"); 
      const safeCountry = BANK_COUNTRIES.includes(recipient.bankCountry || "") ? recipient.bankCountry! : BANK_COUNTRIES[0];
      setBankCountry(safeCountry);
      setBankName(recipient.bankName || "");
      setAccountTypeOption(recipient.accountTypeOption || "Checking / Current Account"); 
      setRoutingNumber(recipient.routingNumber || "");
    } else if (recipient.type?.toLowerCase().includes("mobile")) {
      setBeneficiaryType(recipient.beneficiaryType || "Individual"); 
      const safeCountry = MOMO_COUNTRIES.includes(recipient.momoCountry || "") ? recipient.momoCountry! : MOMO_COUNTRIES[0];
      setMomoCountry(safeCountry);
      setMomoNetwork(recipient.momoNetwork || "");
    } else if (recipient.type === "Wallet") {
      setToken(recipient.token || CRYPTO_TOKENS[0]); setNetwork(recipient.network || CRYPTO_NETWORKS[0]);
    }
    
    setOpenDropdownId(null); setIsModalOpen(true);
  };

  const handleDeleteRequest = (id: string | number) => { setRecipientToDelete(String(id)); setOpenDropdownId(null); };

  // 🌟 THE FIX 3: True Error-Handled Delete Execution
  const confirmDelete = async () => {
    if (!recipientToDelete || !activeAccount?.id) return;
    try {
      const res = await fetch(`${API_BASE}/users/${activeAccount.id}/recipients/${recipientToDelete}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include' 
      });
      
      // Strict guard prevents UI from updating if backend fails
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || "Failed to delete recipient from the server.");
      }

      toast.success("Recipient removed from address book", { style: { background: '#1A1A1A', color: '#fff', borderRadius: '12px' } });
      
      // Only remove from UI after confirming successful backend deletion
      setRecipients(prev => prev.filter(r => String(r.id) !== recipientToDelete)); 
      setRecipientToDelete(null); 
      window.dispatchEvent(new Event('bingtellar_recipients_updated'));
      
    } catch (error: any) {
      console.error("Delete request failed", error);
      toast.error(error.message || "Failed to delete recipient.", { style: { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '12px' } });
      setRecipientToDelete(null); 
    }
  };

  const closeModal = () => {
    setNewName(""); setNewType("Email"); setNewDetails(""); setEditingId(null); setErrorMsg("");
    setBankCountry(BANK_COUNTRIES[0]); setBankName(""); setRoutingNumber("");
    setMomoCountry(MOMO_COUNTRIES[0]); setMomoNetwork("");
    setIsModalOpen(false);
  };

  const handlePay = (recipient: Recipient) => { if (onInitiatePay) onInitiatePay(recipient); };

  const filteredRecipients = recipients.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || (r.details || r.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const resolvedType = r.type || (r.email ? "Email" : "Wallet");
    const matchesTab = activeTab === 'All' || resolvedType?.toLowerCase() === activeTab.toLowerCase();
    return matchesSearch && matchesTab;
  });

  const isNubanModalCountry = newType === "Bank" && bankCountry === "Nigeria";

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12 px-1 sm:px-0 relative">

      <h1 className="text-[22px] font-bold text-[#1A1A1A] mb-4">Recipients</h1>

      {/* 🌟 STRIPE-LIKE FLUID HEADER */}
      {/* Forced to always be a single row, no wrapping allowed */}
      <div className="flex flex-row items-center justify-between gap-3 md:gap-4 mb-8 w-full">
        
        {/* TABS: Kept scrollable but restricted to ~45% width so they never overpower the controls */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0 shrink-0 max-w-[45%] md:max-w-[55%]">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 px-2 text-[13px] md:text-[14px] font-medium relative whitespace-nowrap transition-colors ${activeTab === tab ? 'text-[#1A1A1A]' : 'text-[#A3A3A3] hover:text-[#757575]'}`}>
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1A1A1A] rounded-t-full" />}
            </button>
          ))}
        </div>

        {/* CONTROLS: Flex-1 ensures this block takes all remaining space, min-w-0 allows it to compress */}
        <div className="flex flex-row items-center gap-2 sm:gap-3 flex-1 justify-end min-w-0 pb-3 sm:pb-0">
          
          {/* SEARCH BOX: The "Squishy" Element. Shrinks dynamically down to 100px when squeezed */}
          <div className="relative w-full max-w-[260px] min-w-[100px] shrink transition-all">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400"><Search size={16} /></div>
            {/* Shortened placeholder to prevent text cutoff when heavily squeezed */}
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 bg-[#F9F9F8] rounded-full pl-10 pr-4 text-[13px] text-[#1A1A1A] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 transition-shadow" />
          </div>

          {/* ADD BUTTON: Rigid shape, responds by dropping "Recipient" text on tiny mobile views if needed */}
          <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="flex items-center gap-1.5 sm:gap-2 h-10 px-4 sm:px-5 rounded-full bg-black text-white text-[13px] font-bold hover:bg-gray-800 transition-colors justify-center shrink-0 whitespace-nowrap shadow-sm">
            <Plus size={16} /> 
            <span className="hidden sm:inline">Add Recipient</span>
            <span className="inline sm:hidden">Add</span>
          </button>
        </div>
      </div>

      <div className="relative mt-4">
        {isFetching || isDBFetching ? (
          <RecipientsSkeleton />
        ) : filteredRecipients.length === 0 ? (
          <div className="relative w-full h-[300px] overflow-hidden rounded-[24px]">
            <div className="absolute top-0 left-0 w-full flex flex-col gap-3 opacity-30 pointer-events-none z-0">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex gap-4 w-full"><div className="h-10 bg-[#F5F5F4] rounded-lg w-1/5" /><div className="h-10 bg-[#F5F5F4] rounded-lg w-1/5" /><div className="h-10 bg-[#F5F5F4] rounded-lg w-1/5" /><div className="h-10 bg-[#F5F5F4] rounded-lg w-1/5" /><div className="h-10 bg-[#F5F5F4] rounded-lg w-1/5" /></div>
              ))}
            </div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center text-center w-full px-4">
              <h4 className="text-[15px] font-bold text-[#1A1A1A] mb-2">{activeTab === 'All' ? 'No saved recipient yet' : `No saved ${activeTab.toLowerCase()} recipient yet`}</h4>
              <p className="text-[13px] text-[#757575] mb-6 max-w-[280px]">Add and organize your recipients, such as team members, vendors, or personal connections.</p>
              <div className="flex items-center gap-3">
                <button className="px-5 py-2.5 bg-[#F5F5F4] text-[#1A1A1A] text-[13px] font-medium rounded-full hover:bg-[#E8E8E8] transition-colors">Learn more</button>
                <button onClick={() => setIsModalOpen(true)} className="px-5 py-2.5 bg-[#F5F5F4] text-[#1A1A1A] text-[13px] font-medium rounded-full hover:bg-[#E8E8E8] transition-colors">Add recipient</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-visible pb-24">
            {/* 🌟 FIX 1: Added table-fixed to force the table to obey the parent width */}
            <table className="w-full text-left border-collapse whitespace-nowrap table-fixed">
              <thead>
                <tr className="border-b border-[#F0F0EF]">
                  {/* 🌟 FIX 2: Applied percentage & pixel widths so it knows exactly how to squeeze */}
                  <th className="py-4 pr-4 font-medium text-[13px] text-[#757575] w-[35%] lg:w-[30%]">Name</th>
                  <th className="hidden md:table-cell py-4 px-2 font-medium text-[13px] text-[#757575] w-[15%]">Account type</th>
                  <th className="hidden sm:table-cell py-4 px-2 font-medium text-[13px] text-[#757575] w-[25%] lg:w-[25%]">Account details</th>
                  <th className="hidden lg:table-cell py-4 px-2 font-medium text-[13px] text-[#757575] w-[15%]">Date Saved</th>
                  <th className="py-4 px-2 font-medium text-[13px] text-[#757575] text-center w-[80px]">Pay prompt</th>
                  <th className="py-4 pl-2 font-medium text-[13px] text-[#757575] text-right w-[60px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipients.map((recipient) => {
                  const resolvedType = recipient.type || (recipient.email ? "Email" : "Wallet");
                  const resolvedDetails = recipient.details || recipient.email || recipient.walletAddress;
                  const isDropdownOpen = openDropdownId === String(recipient.id);

                  return (
                    <tr key={recipient.id} className="border-b border-[#F0F0EF] hover:bg-[#F9F9F8] transition-colors group relative">
                      {/* 🌟 FIX 3: Replaced max-w constraints on spans with 'truncate block' so they dynamically clamp */}
                      <td className="py-5 pr-4 text-[14px] font-medium text-[#1A1A1A] truncate">
                        <div className="flex items-center gap-3 truncate">
                          <div className="w-8 h-8 bg-[#F5F5F4] text-[#757575] rounded-full flex items-center justify-center font-bold text-[12px] shrink-0">{recipient.name.charAt(0).toUpperCase()}</div>
                          <span className="truncate block">{recipient.name}</span>
                        </div>
                      </td>
                      <td className="hidden md:table-cell py-5 px-2 text-[14px] font-medium text-[#1A1A1A] truncate"><span className="text-[#757575] capitalize truncate block">{resolvedType}</span></td>
                      <td className="hidden sm:table-cell py-5 px-2 text-[14px] font-medium text-[#1A1A1A] truncate"><span className="truncate block">{resolvedDetails}</span></td>
                      <td className="hidden lg:table-cell py-5 px-2 text-[14px] font-medium text-[#1A1A1A] truncate">{recipient.dateAdded ? new Date(recipient.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "N/A"}</td>
            
                      <td className="py-5 px-4">
                        <div className="flex justify-center">
                          <button onClick={() => handlePay(recipient)} className="w-[24px] h-[24px] bg-black rounded-full flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all shadow-sm shrink-0" title={`Pay via ${resolvedType}`}><ArrowUpRight size={14} /></button>
                        </div>
                      </td>
                      <td className="py-5 pl-4 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isDropdownOpen ? null : String(recipient.id)); }} className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-full transition-colors shrink-0"><MoreHorizontal size={20} /></button>
                        {isDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }} />
                            <div className="absolute right-4 top-14 w-36 bg-white border border-[#E8E8E8] rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-50 py-1.5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(recipient); }} className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-[#1A1A1A] hover:bg-[#F9F9F8] transition-colors">Edit details</button>
                              <div className="h-[1px] bg-[#F0F0EF] my-0.5" />
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteRequest(recipient.id); }} className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors">Delete recipient</button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recipientToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] w-full max-w-sm shadow-xl border border-[#F0F0EF] p-6 text-center animate-in zoom-in-95 duration-200">
            <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-2">Delete Recipient?</h2>
            <p className="text-[14px] text-[#757575] mb-8 leading-relaxed">Are you sure you want to remove this recipient? This action cannot be undone.</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setRecipientToDelete(null)} className="flex-1 h-11 bg-[#F5F5F4] text-[#1A1A1A] font-bold text-[13px] rounded-full hover:bg-[#E8E8E8] transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 h-11 bg-red-600 text-white font-bold text-[13px] rounded-full hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] rounded-t-[24px] sm:rounded-b-[24px] animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 relative">
            
            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden absolute top-0 z-30">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
            </div>

            <div className="flex justify-between items-center px-6 pt-8 pb-4 sm:p-6 shrink-0 rounded-t-[24px] bg-white z-20">
              <h2 className="text-[18px] font-bold text-[#1A1A1A]">
                {editingId ? "Edit Recipient" : "Add New Recipient"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-black transition-colors"><X size={20} /></button>
            </div>
            
            <div className="px-6 pb-2 overflow-y-auto scrollbar-hide flex-1 z-10">
              <form id="recipient-form" onSubmit={handleSave} className="space-y-6 pb-2">
                
                <CustomSelect 
                  label="Account Type" value={newType} disabled={!!editingId}
                  options={["Email", "Bank", "Mobile money", "Wallet"]}
                  onChange={(val) => { setNewType(val); setErrorMsg(""); }}
                />

                {newType === "Bank" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CustomSelect 
                      label="Bank Country" value={bankCountry} options={BANK_COUNTRIES} searchable={true}
                      onChange={(val) => { setBankCountry(val); setBankName(""); setErrorMsg(""); }}
                    />
                    
                    <CustomSelect 
                      label="Bank Name" value={bankName} options={dynamicInstitutions.map(b => b.name)} searchable={true}
                      onChange={(val) => { setBankName(val); setErrorMsg(""); }}
                    />

                    <CustomSelect label="Beneficiary Type" value={beneficiaryType} options={["Individual", "Business"]} onChange={(val) => setBeneficiaryType(val)} />

                    {bankCountry === "United States" && (
                      <>
                        <CustomSelect label="Account Variant" value={accountTypeOption} options={["Checking / Current Account", "Savings Account"]} onChange={(val) => setAccountTypeOption(val)} />
                        <div>
                          <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">Routing Number</label>
                          <input required type="text" maxLength={9} value={routingNumber} onChange={(e) => { setRoutingNumber(e.target.value); setErrorMsg(""); }} className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] outline-none focus:border-black transition-colors" placeholder="9-digit routing" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {newType === "Mobile money" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CustomSelect 
                      label="Mobile Money Country" value={momoCountry} options={MOMO_COUNTRIES} searchable={true}
                      onChange={(val) => { setMomoCountry(val); setMomoNetwork(""); setErrorMsg(""); }}
                    />
                    
                    <CustomSelect 
                      label="Mobile Money Network" value={momoNetwork} options={dynamicInstitutions.map(b => b.name)} searchable={true}
                      onChange={(val) => { setMomoNetwork(val); setErrorMsg(""); }}
                    />

                    <CustomSelect label="Beneficiary Type" value={beneficiaryType} options={["Individual", "Business"]} onChange={(val) => setBeneficiaryType(val)} />
                  </div>
                )}

                {newType === "Wallet" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CustomSelect label="Token" value={token} options={CRYPTO_TOKENS} onChange={(val) => { setToken(val); setErrorMsg(""); }} />
                    <CustomSelect label="Network" value={network} options={CRYPTO_NETWORKS} onChange={(val) => { setNetwork(val); setErrorMsg(""); }} />
                  </div>
                )}

                <div className="animate-in fade-in duration-500">
                  <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">
                    {newType === "Email" ? "Email Address" : newType === "Wallet" ? "Wallet Address" : newType === "Mobile money" ? "Phone Number" : "Account Number"}
                  </label>
                  <input 
                    required type={newType === "Email" ? "email" : "text"} value={newDetails} 
                    onChange={(e) => { 
                      const val = (newType === "Bank" || newType === "Mobile money") ? e.target.value.replace(/\D/g, '') : e.target.value;
                      setNewDetails(val); setErrorMsg(""); 
                    }} 
                    className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] outline-none focus:border-black transition-colors" 
                    placeholder={newType === "Email" ? "acme@example.com" : newType === "Wallet" ? "0x..." : newType === "Mobile money" ? "+254 700 000 000" : "0123456789"} 
                  />
                </div>

                <div className="animate-in fade-in duration-500 relative">
                  <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">
                    {newType === "Email" ? "Full Name" : newType === "Wallet" ? "Wallet Nickname / Label" : "Account Name"}
                  </label>
                  <input 
                    required type="text" value={newName} 
                    disabled={(isNubanModalCountry && !allowManualName) || isResolvingAccount}
                    onChange={(e) => { setNewName(e.target.value); setErrorMsg(""); }} 
                    className={`w-full bg-[#F9F9F8] border p-3.5 rounded-xl text-[14px] outline-none transition-colors pr-10
                       ${isResolvingAccount ? "border-blue-300 bg-blue-50 text-blue-600 font-medium animate-pulse" : "border-[#E8E7E1] focus:border-black"}
                       ${isNubanModalCountry && !isResolvingAccount && newName && !allowManualName ? "bg-green-50 text-gray-700 font-bold border-green-200" : ""}
                       ${isNubanModalCountry && !isResolvingAccount && !newName && !allowManualName ? "text-gray-400 cursor-not-allowed" : ""}
                    `}
                    placeholder={isResolvingAccount ? "Verifying account details..." : newType === "Wallet" ? "e.g. My Savings Wallet" : "e.g. Acme Corp"} 
                  />
                  {isResolvingAccount && <Loader2 className="absolute right-4 bottom-3.5 animate-spin text-blue-500" size={18} />}
                  {isNubanModalCountry && !isResolvingAccount && newName && !allowManualName && <Check className="absolute right-4 bottom-3.5 text-green-600" size={18} />}
                </div>

                {newType === "Wallet" && (
                  <div className="bg-[#FFF8E6] border border-[#FFE082] p-4 rounded-xl animate-in fade-in duration-500">
                    <p className="text-[12.5px] text-[#B77900] leading-relaxed font-medium"><span className="font-bold">Caution:</span> Please verify the token, wallet address and network carefully before sending funds. Blink will not be liable for errors.</p>
                  </div>
                )}
              </form>
            </div>

            {errorMsg && (
              <div className="px-6 pb-4 shrink-0 bg-white z-20 relative">
                <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2">
                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-[13px] font-medium text-red-800 leading-snug flex-1">{errorMsg}</p>
                  <button onClick={() => setErrorMsg("")} className="text-red-400 hover:text-red-700 transition-colors shrink-0"><X size={16} /></button>
                </div>
              </div>
            )}
            
            <div className="p-6 pb-8 sm:pb-6 border-t border-[#F0F0EF] shrink-0 bg-white sm:rounded-b-[24px] z-20">
               <button type="submit" form="recipient-form" disabled={isResolvingAccount} className="w-full bg-black text-white h-12 rounded-xl font-bold text-[14px] hover:bg-gray-800 hover:scale-[1.01] active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingId ? "Save Changes" : "Save Recipient"}
                </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
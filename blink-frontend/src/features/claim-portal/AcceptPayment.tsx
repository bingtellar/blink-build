import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Check, X, ChevronDown, Landmark, Smartphone, Wallet, RefreshCw, QrCode, Link2, Search, CircleDollarSign, Loader2, ChevronLeft
} from "lucide-react";
import { FIAT_CURRENCIES } from "../../utils/constants";
import { EscrowPayment } from "./ClaimPage"; 

// 🌟 THE FIX: Standardized API routing for Vercel/Netlify deployments
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface AcceptPaymentProps {
  paymentData: EscrowPayment;
  apy?: number;
  onSuccess: (updatedData: EscrowPayment) => void;
}

const METHODS = {
  bank: { id: "bank", label: "To Bank account", icon: Landmark },
  mobile_money: { id: "mobile_money", label: "To Mobile money", icon: Smartphone },
  moneygram: { id: "moneygram", label: "Moneygram Point", icon: RefreshCw },
  pix: { id: "pix", label: "To PIX", icon: QrCode },
  external_wallet: { id: "external_wallet", label: "To External wallet", icon: Wallet },
};

const CURRENCY_METHODS: Record<string, string[]> = {
  NGN: ["bank", "external_wallet"],
  KES: ["bank", "mobile_money", "external_wallet"],
  GHS: ["bank", "mobile_money", "external_wallet"],
  USD: ["bank", "moneygram", "external_wallet"],
  UGX: ["bank", "mobile_money", "external_wallet"],
  RWF: ["bank", "mobile_money", "external_wallet"],
  ZAR: ["bank", "external_wallet"],
  // GLOBAL CORRIDORS
  EUR: ["bank", "external_wallet"],
  GBP: ["bank", "external_wallet"],
  AUD: ["bank", "external_wallet"],
  HKD: ["bank", "external_wallet"],
  INR: ["bank", "external_wallet"],
  SGD: ["bank", "external_wallet"],
  KRW: ["bank", "external_wallet"],
  ARS: ["bank", "external_wallet"],
  AED: ["bank", "external_wallet"],
  CNY: ["bank", "external_wallet"],
  CDF: ["mobile_money", "external_wallet"],
  ZMW: ["mobile_money", "external_wallet"],
  BWP: ["mobile_money", "external_wallet"],
  EGP: ["mobile_money", "bank", "external_wallet"]
};

// Map currencies to their anchor Switch routing country
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  NGN: 'NG', KES: 'KE', GHS: 'GH', USD: 'US', UGX: 'UG',
  RWF: 'RW', ZAR: 'ZA', EUR: 'FR', GBP: 'GB', AUD: 'AU',
  HKD: 'HK', INR: 'IN', SGD: 'SG', KRW: 'KR', ARS: 'AR',
  AED: 'AE', CNY: 'CN', CDF: 'CD', ZMW: 'ZM', BWP: 'BW', EGP: 'EG'
};

// European Nations for EUR dynamic routing
const EURO_COUNTRIES = [
  { code: 'AD', name: 'Andorra', flag: '🇦🇩' }, { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' }, { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷' }, { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' }, { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮' }, { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' }, { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺' }, { code: 'IS', name: 'Iceland', flag: '🇮🇸' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪' }, { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻' }, { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹' }, { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹' }, { code: 'MC', name: 'Monaco', flag: '🇲🇨' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' }, { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' }, { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴' }, { code: 'SM', name: 'San Marino', flag: '🇸🇲' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰' }, { code: 'SI', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' }, { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' }, { code: 'VA', name: 'Vatican City', flag: '🇻🇦' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' }
];

const PROVIDERS: Record<string, {name: string, code?: string}[]> = {
  NGN: [{ name: "Access Bank", code: "044" }, { name: "Guaranty Trust Bank", code: "058" }, { name: "Zenith Bank", code: "057" }],
  KES: [{name: "KCB Bank"}, {name: "Equity Bank"}],
  mobile_money: [{name: "M-Pesa"}, {name: "Airtel Money"}, {name: "MTN Mobile Money"}, {name: "Vodafone Cash"}],
  external_wallet: [{name: "Stellar"}, {name: "Ethereum (ERC20)"}, {name: "Solana"}, {name: "Polygon"}, {name: "Base"}],
};

export const AcceptPayment = ({ paymentData, apy = 13.00, onSuccess }: AcceptPaymentProps) => {
  const [currentStep, setCurrentStep] = useState<"form" | "success">("form");
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [isLoadingClaim, setIsLoadingClaim] = useState(false);

  const [email, setEmail] = useState("");
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  // Country variable
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [payoutMethod, setPayoutMethod] = useState<string | null>(null);

  const [paymentInfo, setPaymentInfo] = useState({
    providerName: "", providerCode: "", accountNumber: "", accountName: "", cryptoAddress: "",
  });
  
  const [accountError, setAccountError] = useState("");
  const [isResolvingName, setIsResolvingName] = useState(false); 
  const [hasResolvedName, setHasResolvedName] = useState(false); 

  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");

  const [otp, setOtp] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [otpError, setOtpError] = useState("");
  const [isShaking, setIsShaking] = useState(false);

  const [copied, setCopied] = useState(false);
  const [transactionDate, setTransactionDate] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());

  // 🌟 STRICT SPLIT ORACLE STATES
  const [fiatConfig, setFiatConfig] = useState<any>(null);
  const [nigerianBanks, setNigerianBanks] = useState<{name: string, code?: string}[]>(PROVIDERS.NGN);
  const [nonNgInstitutions, setNonNgInstitutions] = useState<{name: string, code?: string}[]>([]);
  const isMounted = useRef(true);

  // ==========================================
  // 1A. FETCH NG BANKS ON MOUNT (Unchanged Logic)
  // ==========================================
  useEffect(() => {
    isMounted.current = true;
    const fetchOracles = async () => {
      try {
        const [configRes, banksRes] = await Promise.all([
          fetch(`${API_BASE}/fiat/config`).catch(() => null),
          fetch(`${API_BASE}/fiat/banks/ng`).catch(() => null)
        ]);

        if (configRes && configRes.ok && isMounted.current) {
          setFiatConfig((await configRes.json()).config);
        }

        if (banksRes && banksRes.ok) {
          const banksData = await banksRes.json();
          const bArray = banksData.data || banksData;
          if (Array.isArray(bArray) && bArray.length > 0 && isMounted.current) {
            setNigerianBanks(bArray.map((b: any) => ({ name: b.name || b.bankName, code: b.code || b.bankCode })));
          }
        }
      } catch (err) { console.warn("Oracle fetch failed.", err); }
    };
    fetchOracles();
    return () => { isMounted.current = false; };
  }, []);

  // ==========================================
  // 1B. FETCH NON-NG INSTITUTIONS DYNAMICALLY
  // ==========================================
  useEffect(() => {
    if (!currencyCode || !payoutMethod) return;
    if (payoutMethod === "external_wallet" || payoutMethod === "moneygram" || payoutMethod === "pix") return;
    if (currencyCode === "NGN" && payoutMethod === "bank") return; // Skip because NG banks are already loaded!
    if (currencyCode === "EUR" && !selectedCountry) return; // 🌟 Wait for EUR country selection

    const fetchDynamicInstitutions = async () => {
      try {
        // 🌟 Use selectedCountry if EUR, otherwise fallback to the map
        const country = currencyCode === "EUR" ? selectedCountry : (CURRENCY_TO_COUNTRY[currencyCode] || "KE");
        const channel = payoutMethod === "bank" ? "BANK_ACCOUNT" : "MOBILE_MONEY";
        
        const res = await fetch(`${API_BASE}/fiat/institutions?country=${country}&channel=${channel}&currency=${currencyCode}`);
        const payload = await res.json();
        
        let bankArray: any[] = [];
        if (Array.isArray(payload)) bankArray = payload;
        else if (Array.isArray(payload.data)) bankArray = payload.data;
        else if (payload.data && Array.isArray(payload.data.data)) bankArray = payload.data.data;
        else if (payload.data && Array.isArray(payload.data.institutions)) bankArray = payload.data.institutions;
        else if (payload.data && Array.isArray(payload.data.banks)) bankArray = payload.data.banks;
        
        if (res.ok && bankArray.length > 0) {
          const formatted = bankArray.map((b: any) => ({ 
            name: String(b.name || b.institutionName || b.bankName || '').trim(), 
            code: String(b.code || b.institutionCode || b.bankCode || '').trim() 
          })).filter((b: any) => b.name !== '');

          if (isMounted.current && formatted.length > 0) setNonNgInstitutions(formatted);
          else if (isMounted.current) setNonNgInstitutions([]);
        } else {
          if (isMounted.current) setNonNgInstitutions([]);
        }
      } catch (err) {
        if (isMounted.current) setNonNgInstitutions([]);
      }
    };
    fetchDynamicInstitutions();
  }, [currencyCode, payoutMethod]);

  const selectedCurrency = FIAT_CURRENCIES.find((c) => c.code === currencyCode);
  const availableMethods = currencyCode ? CURRENCY_METHODS[currencyCode] : [];

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "None";
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59`);
    if (isNaN(d.getTime())) return "None";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const isCompleted = paymentData.status === "claim_completed" || paymentData.status === "completed";
  const isCancelled = paymentData.status === "claim_canceled" || paymentData.status === "claim_expired";

  let isLocked = false;
  let claimableDisplay = "Claimable Now";

  if (paymentData.claimableAfter && !isCompleted && !isCancelled) {
    const unlockTime = new Date(paymentData.claimableAfter).getTime();
    if (now.getTime() < unlockTime) {
      isLocked = true;
      claimableDisplay = formatDateTime(paymentData.claimableAfter);
    }
  }

  const expiryDisplay = paymentData.dueDate ? formatDateTime(paymentData.dueDate) : "None";

  // ==========================================
  // 2. MATHEMATICAL ENGINE & FEES
  // ==========================================
  // 🛡️ THE FIX: We no longer estimate. This is the cryptographic truth from Soroban.
  const finalYieldEarned = paymentData.estimatedYield || 0;

  const totalUsdcPayout = paymentData.amount + finalYieldEarned;

  const exchangeRate = useMemo(() => {
    if (payoutMethod === 'external_wallet') return 1;
    if (fiatConfig && currencyCode && fiatConfig[currencyCode]) return fiatConfig[currencyCode].rateToFiat || fiatConfig[currencyCode].rateToUsdc;
    const fallback = FIAT_CURRENCIES.find(c => c.code === currencyCode);
    return fallback ? fallback.withdrawalRate : 1;
  }, [currencyCode, fiatConfig, payoutMethod]);

  const railFee = useMemo(() => {
    if (payoutMethod === "bank" && currencyCode === "NGN") return 50.00;
    if (payoutMethod === "mobile_money" && currencyCode === "KES") return 50.00;
    if (payoutMethod === "mobile_money" && currencyCode === "GHS") return 1.00;
    if (payoutMethod === "external_wallet" && paymentInfo.providerName !== "Stellar") return 1.50; 
    return 0.00;
  }, [payoutMethod, currencyCode, paymentInfo.providerName]);

  const amounts = useMemo(() => {
    if (payoutMethod === 'external_wallet') {
      const net = Math.max(0, totalUsdcPayout - railFee);
      return { gross: totalUsdcPayout, fee: railFee, net, symbol: 'USDC' };
    } else {
      const grossFiat = totalUsdcPayout * exchangeRate;
      const netFiat = Math.max(0, grossFiat - railFee);
      return { gross: grossFiat, fee: railFee, net: netFiat, symbol: currencyCode };
    }
  }, [totalUsdcPayout, exchangeRate, railFee, payoutMethod, currencyCode]);

  const formattedCreatedDate = useMemo(() => {
    return new Date(paymentData.dateCreated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [paymentData.dateCreated]);

  const dynamicTimeInEscrow = useMemo(() => {
    const diffMs = now.getTime() - new Date(paymentData.dateCreated).getTime();
    const diffHrs = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const diffMins = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    return `${diffHrs}h ${diffMins}m`;
  }, [now, paymentData.dateCreated]);

  const renderProviderList = () => {
    let list: {name: string, code?: string}[] = [];
    
    // 🌟 STRICT SEPARATION FOR DROPDOWN
    if (payoutMethod === "external_wallet") list = PROVIDERS.external_wallet || [];
    else if (currencyCode === "NGN" && payoutMethod === "bank") list = nigerianBanks;
    else if (nonNgInstitutions.length > 0) list = nonNgInstitutions;
    else if (currencyCode && PROVIDERS[currencyCode]) list = PROVIDERS[currencyCode];
    
    return list.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()));
  };

  const validateCryptoAddress = (address: string, net: string) => {
    if (!address) return true;
    if (net.includes("ERC20") || net.includes("Polygon") || net.includes("Base")) return /^0x[a-fA-F0-9]{40}$/.test(address);
    if (net === "Stellar") return address.startsWith("G") && address.length === 56;
    if (net === "Solana") return address.length >= 32 && address.length <= 44 && !address.startsWith("0x");
    return address.length > 20;
  };

  const isFormValid = useMemo(() => {
    if (!isEmailVerified || !currencyCode || !payoutMethod) return false;
    if (currencyCode === 'EUR' && !selectedCountry) return false; // MUST select a country for EUR
    if (payoutMethod === "bank" || payoutMethod === "mobile_money") {
      return paymentInfo.providerName.length > 2 && paymentInfo.accountNumber.length > 5 && paymentInfo.accountName.length > 2 && accountError === "";
    }
    if (payoutMethod === "external_wallet") return validateCryptoAddress(paymentInfo.cryptoAddress, paymentInfo.providerName) && paymentInfo.cryptoAddress.length > 10;
    if (payoutMethod === "pix" || payoutMethod === "moneygram") return paymentInfo.accountName.length > 2 && paymentInfo.accountNumber.length > 2; 
    return false;
  }, [isEmailVerified, currencyCode, payoutMethod, paymentInfo, accountError, selectedCountry]);

  useEffect(() => {
    if (isOtpModalOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [isOtpModalOpen]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOtpModalOpen && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isOtpModalOpen, resendTimer]);

  // ==========================================
  // 3. ACCOUNT RESOLUTION WITH PROOF OF INTENT
  // ==========================================
  useEffect(() => {
    const resolveDestination = async () => {
      // SCENARIO A: Nigerian NUBAN Logic
      if (payoutMethod === "bank" && currencyCode === "NGN" && paymentInfo.providerCode && paymentInfo.accountNumber.length === 10) {
        setIsResolvingName(true); setAccountError(""); setHasResolvedName(false);
        try {
          const res = await fetch(`${API_BASE}/fiat/banks/resolve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountNumber: paymentInfo.accountNumber,
              bankCode: paymentInfo.providerCode,
              claimId: paymentData.id
            })
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || "Failed to resolve NUBAN");
          
          setPaymentInfo(prev => ({ ...prev, accountName: payload.accountName }));
          setHasResolvedName(true);
        } catch (err: any) {
          setAccountError("Could not verify NUBAN automatically. Please type it.");
          setHasResolvedName(false);
        } finally { setIsResolvingName(false); }
      }
      
      // SCENARIO B: Non-NG Countries & Mobile Money (The Universal API)
      else if ((payoutMethod === "bank" || payoutMethod === "mobile_money") && currencyCode !== "NGN" && paymentInfo.providerCode && paymentInfo.accountNumber.length >= 6) {
        setIsResolvingName(true); setAccountError(""); setHasResolvedName(false);
        try {
          // 🌟 Use selectedCountry if EUR, otherwise fallback to the map
          const country = currencyCode === "EUR" ? selectedCountry : (CURRENCY_TO_COUNTRY[currencyCode!] || "KE");
          
          const res = await fetch(`${API_BASE}/institutions/lookup`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountNumber: paymentInfo.accountNumber,
              institutionCode: paymentInfo.providerCode,
              countryCode: country,
              claimId: paymentData.id
            })
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || payload.message || "Failed to resolve account");
          
          const resolvedName = payload.accountName || payload.data?.account_name || payload.data?.accountName;
          setPaymentInfo(prev => ({ ...prev, accountName: resolvedName }));
          setHasResolvedName(true);
        } catch (err: any) {
          setAccountError("Could not verify account automatically. Please type it.");
          setHasResolvedName(false);
        } finally { setIsResolvingName(false); }
      } 
      
      // Reset logic
      else if (paymentInfo.accountNumber.length < 6) {
        if (hasResolvedName) {
          setPaymentInfo((prev) => ({ ...prev, accountName: "" })); 
          setHasResolvedName(false); 
        }
      }
    };
    
    resolveDestination();
  }, [paymentInfo.accountNumber, paymentInfo.providerCode, paymentInfo.providerName, payoutMethod, currencyCode, paymentData.id]);

  const validateEmailFormat = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (val.trim().toLowerCase() === paymentData.recipientEmail.toLowerCase()) {
      setIsEmailVerified(true); setEmailError("");
    } else {
      setIsEmailVerified(false);
      if (validateEmailFormat(val)) setEmailError("This email is not authorised for this payment");
      else setEmailError("");
    }
  };

  const handleAccountNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (payoutMethod === "bank" || payoutMethod === "mobile_money") val = val.replace(/\D/g, '');
    setPaymentInfo({ ...paymentInfo, accountNumber: val });

    if (val.length === 0) { setAccountError(""); return; }

    if (payoutMethod === "bank") {
      if (currencyCode === "NGN" && val.length > 0 && val.length !== 10) setAccountError("Nigerian bank accounts must be exactly 10 digits");
      else if (val.length < 8) setAccountError("Account number is too short");
      else if (val.length > 15) setAccountError("Account number is too long");
      else setAccountError("");
    } else if (payoutMethod === "mobile_money") {
      if (val.length < 9) setAccountError("Mobile number is incomplete");
      else if (val.length > 12) setAccountError("Mobile number is too long");
      else setAccountError("");
    } else {
      setAccountError("");
    }
  };

  // =======================================================================
  // 4. SUBMISSION & SETTLEMENT PIPELINE
  // =======================================================================
  const handleClaimInitiate = async () => {
    if (isLocked) return;
    setIsLoadingClaim(true);
    
    try {
      const otpRes = await fetch(`${API_BASE}/escrows/${paymentData.id}/send-recipient-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!otpRes.ok) throw new Error("Failed to dispatch withdrawal verification code.");

      await fetch(`${API_BASE}/escrows/${paymentData.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStatus: 'claim_pending',
          note: `Recipient submitted withdrawal destination for: ${payoutMethod}`
        })
      });
      
      setOtp(""); setOtpError(""); setResendTimer(60); setIsOtpModalOpen(true); 
    } catch (err: any) {
      console.error("Failed to initiate claim", err);
    } finally {
      setIsLoadingClaim(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError("");
    setIsVerifyingOtp(true);
    
    try {
      const otpRes = await fetch(`${API_BASE}/escrows/${paymentData.id}/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
      });
      
      // FIX: Actually parse and display the TRUE backend error!
      if (!otpRes.ok) {
        const errData = await otpRes.json().catch(() => ({}));
        throw new Error(errData.error || "Incorrect security code. Please try again.");
      }

      const linkRes = await fetch(`${API_BASE}/escrows/${paymentData.id}/generate-link`, { method: "POST" });
      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error("Failed to generate secure claim token.");
      
      const secureToken = linkData.link.split('/claim/')[1];

     // FIX: Compile the Omni-Payload for the Backend Controller
      const settlementPayload = {
        encrypted_token: secureToken,
        paymentMethod: payoutMethod,
        fiatCurrency: currencyCode,
        fiatAmount: amounts.net,
        exchangeRate: exchangeRate,
        railFee: amounts.fee,
        recipient_wallet: payoutMethod === "external_wallet" ? paymentInfo.cryptoAddress : import.meta.env.VITE_TREASURY_ADDRESS,
        recipientDetails: {
          // 🛡️ BINGTELLAR FIX: Cleanly separate the Bank Name and the Bank Code!
          bankName: paymentInfo.providerName, // Send the string (e.g., "OPay")
          bankCode: paymentInfo.providerCode, // Send the code (e.g., "090267")
          accountNumber: paymentInfo.accountNumber,
          phoneNumber: payoutMethod === "mobile_money" ? paymentInfo.accountNumber : undefined,
          accountName: paymentInfo.accountName,
          network: payoutMethod === "external_wallet" ? paymentInfo.providerName : undefined,
          walletAddress: paymentInfo.cryptoAddress,
          email: email // Send the verified email for extra API compliance
        }
      };

      // 🛡️ Generate a highly unique cryptographic key for this settlement execution
      const idempotencyKey = crypto.randomUUID();

      const processRes = await fetch(`${API_BASE}/escrows/${paymentData.id}/process`, {
        method: "POST", 
        headers: { 
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey // 🛡️ Inject the Idempotency Shield
        },
        body: JSON.stringify(settlementPayload)
      });
      
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error || processData.message || "Blockchain settlement failed.");

      // SSOT SYNC: Fire a global event in case the user has their dashboard open in another tab!
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));

      setTransactionDate(new Date()); 
      setCurrentStep("success");

    } catch (err: any) {
      setOtpError(err.message || "An unexpected error occurred.");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400); 
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer === 0) { 
      setResendTimer(60); 
      setOtpError(""); 
      setOtp(""); 
      try {
        await fetch(`${API_BASE}/escrows/${paymentData.id}/send-recipient-otp`, { 
          method: "POST",
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error("Failed to resend OTP email", e);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFormattedDate = (date: Date | null) => {
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; hours = hours ? hours : 12; 
    const formattedHours = String(hours).padStart(2, '0');
    return `${day} - ${month} - ${year}, ${formattedHours}:${minutes} ${ampm}`;
  };

  if (currentStep === "success") {
    return (
      <div className="w-full min-h-screen bg-[#F5F4F0] flex flex-col font-sans p-6 md:p-12 relative">
        <div className="w-full flex justify-between items-center mb-8 max-w-[1200px] mx-auto">
          <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Blink</h1>
          <button 
            onClick={() => onSuccess({ ...paymentData, status: "claim_completed" })} 
            className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors"
          >
            <X size={20} className="text-[#111827]" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center pb-4 md:pb-8">
          <div className="bg-white w-full max-w-[520px] rounded-[16px] border border-[#E5E7EB] shadow-sm p-8 md:p-10 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-12 h-12 bg-[#D1FADF] rounded-full flex items-center justify-center mb-5">
              <Check size={24} strokeWidth={4} className="text-[#059669]" />
            </div>
            
            <h2 className="text-[15px] sm:text-[18px] md:text-[20px] font-bold text-[#111827] mb-3 tracking-tight">
              You've successfully claimed ${totalUsdcPayout.toFixed(2)}
            </h2>
            <p className="text-[13px] text-[#4B5563] max-w-[420px] leading-relaxed mb-8">
              We'll notify you as soon as the payout is complete. It may take 48 hours for International Bank cash out. Please take a break and wait for the payment to land. 
            </p>

            <div className="bg-[#F9FAFB] w-full max-w-[440px] rounded-[8px] p-5 text-left mb-8 border border-[#F3F4F6]">
              <div className="flex gap-4 relative">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 bg-[#111827] rounded-full flex items-center justify-center z-10">
                    <Check size={10} strokeWidth={4} className="text-white" />
                  </div>
                  <div className="w-[1px] h-10 bg-[#111827] absolute top-4 left-[7px]"></div>
                </div>
                <div className="pb-6">
                  <p className="text-[13px] font-bold text-[#111827]">Claim and fund payout request created</p>
                  <p className="text-[11px] font-medium text-[#6B7280] mt-0.5 uppercase tracking-wider">
                    {getFormattedDate(transactionDate)}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 relative">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-3.5 h-3.5 bg-transparent border-[2px] border-[#111827] rounded-full z-10"></div>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#111827]">Payout processing</p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-[440px] space-y-3">
              <button 
                onClick={() => copyToClipboard('https://ourblink.cash/signup')}
                className="w-full py-3.5 rounded-[8px] bg-[#111827] text-white font-medium text-[14px] hover:bg-black transition-all"
              >
                {copied ? "Link Copied!" : "Share the blink love with friends"}
              </button>
              <a 
                href="mailto:support@ourblink.cash"
                className="w-full py-3.5 rounded-[8px] bg-white border border-[#E5E7EB] text-[#111827] font-medium text-[14px] hover:bg-[#F9FAFB] transition-all flex items-center justify-center"
              >
                Contact support
              </a>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen lg:h-screen lg:overflow-hidden bg-[#F5F4F0] flex justify-center py-4 md:py-10 px-4 md:px-12 font-sans overflow-x-hidden">
      <div className="w-full max-w-[1300px] flex flex-col lg:flex-row gap-8 lg:gap-12 items-start h-full lg:min-h-0">
        
        <div className="w-full lg:w-[260px] flex flex-col flex-shrink-0 pt-2 lg:h-full lg:overflow-y-auto no-scrollbar">
          <div className="flex md:hidden fixed top-0 left-0 right-0 w-full justify-between items-center px-4 pt-6 pb-4 bg-[#F5F4F0] z-40">
            <button onClick={() => window.history.back()} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors">
              <ChevronLeft size={18} className="text-[#111827]" strokeWidth={2.5} />
            </button>
            <button onClick={() => window.location.reload()} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors">
              <X size={16} className="text-[#111827]" strokeWidth={2.5} />
            </button>
          </div>
          
          <div className="block md:hidden w-full h-[60px] mb-2"></div>

          <h1 className="hidden md:block text-[32px] font-bold text-[#111827] tracking-tight mb-12">Blink</h1>
          
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-3 mb-6 md:mb-8">
            <div className="w-12 h-12 bg-[#FEF3C7] rounded-full flex items-center justify-center border border-[#FDE68A]">
              <Link2 size={20} className="text-[#111827]" />
            </div>
            <span className="text-[16px] md:text-[14px] font-bold text-[#111827]">Payment ready</span>
          </div>

          <div className="mb-10 md:mb-12 text-center md:text-left flex flex-col gap-1.5 md:gap-2">
            <h2 className="text-[20px] md:text-[22px] font-bold text-[#111827] tracking-tight">
              You've got ${totalUsdcPayout.toFixed(2)}
            </h2>
            <p className="text-[14px] font-medium md:font-normal text-[#111827] md:text-[#4B5563]">From {paymentData.senderName}</p>
          </div>

          <div className="hidden md:flex flex-col space-y-0">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-[#D1FADF] flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-[#059669]"></div>
                </div>
                <div className="w-[1px] h-10 bg-[#E5E7EB] my-1"></div>
              </div>
              <span className="text-[13px] font-bold text-[#111827] mt-0.5">Link Verified</span>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center mt-0.5 transition-colors ${isOtpModalOpen ? 'bg-[#D1FADF]' : 'bg-[#F3F4F6]'}`}>
                  <div className={`w-2 h-2 rounded-full transition-colors ${isOtpModalOpen ? 'bg-[#059669]' : 'bg-[#D1D5DB]'}`}></div>
                </div>
                <div className="w-[1px] h-10 bg-[#E5E7EB] my-1"></div>
              </div>
              <span className={`text-[13px] font-semibold mt-0.5 transition-colors ${isOtpModalOpen ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>Verify identity</span>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full flex items-center justify-center mt-0.5 bg-[#F3F4F6]">
                  <div className="w-2 h-2 rounded-full bg-[#D1D5DB]"></div>
                </div>
              </div>
              <span className="text-[13px] font-semibold mt-0.5 text-[#9CA3AF]">Receive funds</span>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-transparent md:bg-white rounded-none md:rounded-[12px] border-0 md:border md:border-[#656464] shadow-none md:shadow-[0px_2px_12px_rgba(0,0,0,0.02)] relative w-full flex flex-col p-0 md:p-12 lg:p-14 lg:h-[98vh] lg:min-h-0 overflow-visible md:overflow-hidden">  
        
          <button onClick={() => window.location.reload()} className="hidden md:flex absolute top-6 right-6 w-8 h-8 rounded-full bg-[#F3F4F6] items-center justify-center hover:bg-[#E5E7EB] transition-colors z-20">
            <X size={14} className="text-[#111827]" />
          </button>

          <div className="flex flex-col xl:flex-row gap-8 items-start flex-1 lg:min-h-0 h-full w-full">
            
            <div className="flex-1 w-full max-w-[600px] bg-white rounded-[16px] border border-[#E5E7EB] flex flex-col self-stretch lg:h-full">
              
              <div className="p-6 md:p-8 pb-4 flex-shrink-0 border-b border-transparent">
                <h3 className="text-[15px] font-medium text-[#111827] m-0">
                  To get money, enter beneficiary details and destination
                </h3>
              </div>

              <div className="flex-1 lg:overflow-y-auto custom-scrollbar flex flex-col px-6 md:px-8 pb-6 md:pb-8">
                
                <div className="flex-grow pt-2">
                  <div className="mb-6">
                    <label className="text-[13px] font-medium text-[#111827] block mb-2">Email Address</label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={handleEmailChange}
                        disabled={isEmailVerified}
                        placeholder="Enter Your Email address"
                        className={`w-full border rounded-[8px] p-3.5 text-[14px] outline-none transition-colors ${
                          isEmailVerified ? 'bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]' :
                          emailError ? 'border-red-400 bg-white focus:border-red-500' : 'border-[#E5E7EB] bg-white focus:border-[#111827]'
                        }`}
                      />
                      {isEmailVerified && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-[#D1FADF] px-2.5 py-1 rounded-[6px] animate-in zoom-in duration-200">
                          <Check size={12} strokeWidth={3} className="text-[#059669]" />
                          <span className="text-[11px] font-bold text-[#059669] uppercase tracking-wide">Verified</span>
                        </div>
                      )}
                    </div>
                    {emailError && <p className="text-red-500 text-[12px] mt-2 font-medium">{emailError}</p>}
                  </div>

                  <div className="mb-10 relative z-50">
                    <div 
                      className={`w-full border rounded-[8px] p-2.5 pl-4 flex items-center justify-between cursor-pointer transition-colors ${isEmailVerified ? 'border-[#E5E7EB] bg-[#FAFAFA] hover:border-[#D1D5DB]' : 'border-[#E5E7EB] bg-[#FAFAFA] opacity-50 pointer-events-none'}`}
                      onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                    >
                      <div className="flex items-center gap-3">
                        {selectedCurrency ? (
                          <>
                            <img src={selectedCurrency.flagUrl} alt={selectedCurrency.code} className="w-7 h-7 rounded-full object-cover shadow-sm" />
                            <div className="flex flex-col justify-center">
                              <p className="text-[11px] text-[#9CA3AF] font-medium leading-tight mb-0.5">What currency do you want</p>
                              <p className="text-[14px] font-medium text-[#111827] leading-snug">{selectedCurrency.name}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                              <CircleDollarSign size={18} className="text-[#9CA3AF]" />
                            </div>
                            <div className="flex flex-col justify-center">
                              <p className="text-[11px] text-[#9CA3AF] font-medium leading-tight mb-0.5">What currency do you want</p>
                              <p className="text-[14px] font-medium text-[#9CA3AF] leading-snug">Select currency</p>
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronDown size={18} className="text-[#9CA3AF] mr-2" />
                    </div>

                    {isCurrencyDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setIsCurrencyDropdownOpen(false)} />
                        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#E5E7EB] rounded-[8px] shadow-lg z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="p-3 border-b border-[#E5E7EB] flex items-center gap-2">
                            <Search size={16} className="text-[#9CA3AF]" />
                            <input 
                              type="text" 
                              placeholder="Search currency..." 
                              value={currencySearch}
                              onChange={(e) => setCurrencySearch(e.target.value)}
                              className="w-full text-[13px] outline-none"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-[240px] overflow-y-auto py-2">
                            {FIAT_CURRENCIES.filter(c => c.name.toLowerCase().includes(currencySearch.toLowerCase()) || c.code.toLowerCase().includes(currencySearch.toLowerCase())).map((curr) => (
                              <div 
                                key={curr.code} 
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                                onClick={() => {
                                  setCurrencyCode(curr.code);
                                  setSelectedCountry(null); // 
                                  setPayoutMethod(null);
                                  setPaymentInfo({ providerName: "", providerCode: "", accountNumber: "", accountName: "", cryptoAddress: "" });
                                  setIsCurrencyDropdownOpen(false);
                                  setCurrencySearch("");
                                  setHasResolvedName(false);
                                }}
                              >
                                <img src={curr.flagUrl} alt={curr.code} className="w-6 h-6 rounded-full object-cover shadow-sm" />
                                <span className="text-[14px] font-medium text-[#111827]">{curr.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>


                  {/* 🌟 NEW: Dynamic European Country Selector */}
                  {currencyCode === 'EUR' && (
                    <div className="mb-10 relative animate-in fade-in slide-in-from-top-2 duration-300 z-40">
                      <div 
                        className={`w-full border rounded-[8px] p-2.5 pl-4 flex items-center justify-between cursor-pointer transition-colors border-[#E5E7EB] bg-[#FAFAFA] hover:border-[#D1D5DB]`}
                        onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                      >
                        <div className="flex items-center gap-3">
                          {selectedCountry ? (
                            <>
                              <span className="text-[20px]">{EURO_COUNTRIES.find(c => c.code === selectedCountry)?.flag}</span>
                              <div className="flex flex-col justify-center">
                                <p className="text-[11px] text-[#9CA3AF] font-medium leading-tight mb-0.5">Which European country?</p>
                                <p className="text-[14px] font-medium text-[#111827] leading-snug">{EURO_COUNTRIES.find(c => c.code === selectedCountry)?.name}</p>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col justify-center">
                              <p className="text-[11px] text-[#9CA3AF] font-medium leading-tight mb-0.5">Which European country?</p>
                              <p className="text-[14px] font-medium text-[#9CA3AF] leading-snug">Select country</p>
                            </div>
                          )}
                        </div>
                        <ChevronDown size={18} className="text-[#9CA3AF] mr-2" />
                      </div>

                      {isCountryDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setIsCountryDropdownOpen(false)} />
                          <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#E5E7EB] rounded-[8px] shadow-lg z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-3 border-b border-[#E5E7EB] flex items-center gap-2">
                              <Search size={16} className="text-[#9CA3AF]" />
                              <input 
                                type="text" 
                                placeholder="Search country..." 
                                value={countrySearch}
                                onChange={(e) => setCountrySearch(e.target.value)}
                                className="w-full text-[13px] outline-none"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-[240px] overflow-y-auto py-2">
                              {EURO_COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).map((c) => (
                                <div 
                                  key={c.code} 
                                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                                  onClick={() => {
                                    setSelectedCountry(c.code);
                                    setPayoutMethod(null);
                                    setPaymentInfo({ providerName: "", providerCode: "", accountNumber: "", accountName: "", cryptoAddress: "" });
                                    setIsCountryDropdownOpen(false);
                                    setCountrySearch("");
                                  }}
                                >
                                  <span className="text-[18px]">{c.flag}</span>
                                  <span className="text-[14px] font-medium text-[#111827]">{c.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 🌟 MODIFY THIS LINE to hide withdrawal methods until a EUR country is picked */}
                  <div className={`transition-all duration-300 ${(!currencyCode || (currencyCode === 'EUR' && !selectedCountry)) ? 'hidden' : 'block'}`}>
                    <h3 className="text-[14px] font-medium text-[#111827] mb-3">Withdrawal method</h3>
                    
                    <div className="bg-[#FAFAFA] rounded-[12px] p-5 mb-8 border border-[#F3F4F6]">
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        {availableMethods.map((methodId) => {
                          const method = (METHODS as any)[methodId];
                          const isSelected = payoutMethod === methodId;
                          const Icon = method.icon;
                          return (
                            <div 
                              key={methodId}
                              onClick={() => {
                                setPayoutMethod(methodId);
                                setPaymentInfo({ providerName: "", providerCode: "", accountNumber: "", accountName: "", cryptoAddress: "" });
                                setAccountError("");
                                setHasResolvedName(false);
                              }}
                              className={`border rounded-[8px] p-3.5 flex items-center gap-2 cursor-pointer transition-all bg-white ${
                                isSelected ? 'border-[#60A5FA] ring-1 ring-[#60A5FA]' : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                              }`}
                            >
                              <Icon size={16} className={isSelected ? 'text-[#1E3A8A]' : 'text-[#9CA3AF]'} />
                              <span className={`text-[13px] font-medium ${isSelected ? 'text-[#1E3A8A]' : 'text-[#6B7280]'}`}>{method.label}</span>
                            </div>
                          );
                        })}
                      </div>

                      {payoutMethod && (
                        <div className="space-y-3 animate-in slide-in-from-top-4 duration-300">
                          {(payoutMethod === "bank" || payoutMethod === "mobile_money" || payoutMethod === "external_wallet") && (
                            <>
                              <div className="relative z-30">
                                <div 
                                  className={`w-full border rounded-[8px] p-3.5 text-[14px] flex items-center justify-between cursor-pointer transition-colors bg-white ${
                                    isProviderDropdownOpen ? 'border-[#111827]' : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                                  }`}
                                  onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
                                >
                                  <span className={paymentInfo.providerName ? 'text-[#111827]' : 'text-[#9CA3AF]'}>
                                    {paymentInfo.providerName || `Choose ${payoutMethod === 'bank' ? 'bank' : payoutMethod === 'external_wallet' ? 'network' : 'provider'} `}
                                  </span>
                                  <ChevronDown size={16} className="text-[#9CA3AF]" />
                                </div>

                                {isProviderDropdownOpen && (
                                  <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsProviderDropdownOpen(false)} />
                                    <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#E5E7EB] rounded-[8px] shadow-lg z-40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                      <div className="p-3 border-b border-[#E5E7EB] flex items-center gap-2">
                                        <Search size={16} className="text-[#9CA3AF]" />
                                        <input 
                                          type="text" 
                                          placeholder="Search..." 
                                          value={providerSearch}
                                          onChange={(e) => setProviderSearch(e.target.value)}
                                          className="w-full text-[13px] outline-none"
                                          autoFocus
                                        />
                                      </div>
                                      <div className="max-h-[200px] overflow-y-auto py-1">
                                        {renderProviderList().map((provider) => (
                                          <div 
                                            key={provider.name}
                                            className="px-4 py-2.5 text-[13px] hover:bg-[#F9FAFB] cursor-pointer text-[#111827]"
                                            onClick={() => {
                                              setPaymentInfo({...paymentInfo, providerName: provider.name, providerCode: provider.code || "", accountName: "", cryptoAddress: ""});
                                              setIsProviderDropdownOpen(false);
                                              setProviderSearch("");
                                              setHasResolvedName(false);
                                            }}
                                          >
                                            {provider.name}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              {payoutMethod !== "external_wallet" && (
                                <>
                                  <div>
                                    <input 
                                      type="text" 
                                      value={paymentInfo.accountNumber}
                                      onChange={handleAccountNumberChange}
                                      placeholder="Account number"
                                      className={`w-full border rounded-[8px] p-3.5 text-[14px] outline-none transition-colors bg-white ${
                                        accountError ? 'border-red-400 focus:border-red-500' : 'border-[#E5E7EB] focus:border-[#111827]'
                                      }`}
                                    />
                                    {accountError && <p className="text-red-500 text-[12px] mt-1.5 font-medium px-1">{accountError}</p>}
                                  </div>

                                  <div className="relative z-10">
                                    <input 
                                      type="text" 
                                      value={paymentInfo.accountName}
                                      onChange={(e) => setPaymentInfo({...paymentInfo, accountName: e.target.value})}
                                      placeholder="Account holder name"
                                      disabled={isResolvingName || hasResolvedName}
                                      className={`w-full border rounded-[8px] p-3.5 text-[14px] outline-none transition-colors ${
                                        isResolvingName ? 'bg-[#F9FAFB] border-[#E5E7EB] text-[#9CA3AF]' : 
                                        hasResolvedName ? 'bg-[#F9FAFB] border-[#E5E7EB] text-[#111827] font-medium cursor-not-allowed' : 
                                        'border-[#E5E7EB] bg-white focus:border-[#111827]'
                                      }`}
                                    />
                                    {isResolvingName && (
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 size={16} className="animate-spin text-[#9CA3AF]" />
                                      </div>
                                    )}
                                    {hasResolvedName && !isResolvingName && (
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#F3F4F6] p-1 rounded-full animate-in zoom-in duration-200">
                                        <Check size={12} strokeWidth={3} className="text-[#9CA3AF]" />
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* 🌟 THE FIX: Upgraded External Wallet Verifier */}
                              {payoutMethod === "external_wallet" && (
                                <div className="space-y-3">
                                  <div className="relative">
                                    <input 
                                      type="text" 
                                      value={paymentInfo.cryptoAddress} 
                                      onChange={(e) => setPaymentInfo({...paymentInfo, cryptoAddress: e.target.value})} 
                                      placeholder={`Enter ${paymentInfo.providerName || 'External'} Wallet Address`} 
                                      className={`w-full border rounded-[8px] p-3.5 text-[14px] outline-none transition-colors bg-white pr-10 ${
                                        paymentInfo.cryptoAddress 
                                          ? (validateCryptoAddress(paymentInfo.cryptoAddress, paymentInfo.providerName) 
                                              ? 'border-[#34A853] focus:border-[#34A853] ring-1 ring-[#34A853]' 
                                              : 'border-red-400 focus:border-red-500 ring-1 ring-red-400')
                                          : 'border-[#E5E7EB] focus:border-[#111827]'
                                      }`}
                                    />
                                    
                                    {paymentInfo.cryptoAddress && (
                                       <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-in zoom-in duration-200">
                                          {validateCryptoAddress(paymentInfo.cryptoAddress, paymentInfo.providerName) ? (
                                             <div className="bg-[#D1FADF] p-1 rounded-full"><Check size={14} strokeWidth={3} className="text-[#059669]" /></div>
                                          ) : (
                                             <div className="bg-red-100 p-1 rounded-full"><X size={14} strokeWidth={3} className="text-red-600" /></div>
                                          )}
                                       </div>
                                    )}
                                  </div>

                                  {/* Dynamic Verifier Prompts */}
                                  {paymentInfo.cryptoAddress && (
                                     validateCryptoAddress(paymentInfo.cryptoAddress, paymentInfo.providerName) ? (
                                       <div className="bg-[#E8F5E9] border border-[#C6F6D5] rounded-[8px] p-3 flex items-start gap-2 animate-in fade-in duration-300 shadow-sm">
                                          <Check size={16} className="text-[#34A853] shrink-0 mt-0.5" />
                                          <p className="text-[#059669] text-[12px] font-medium leading-relaxed">
                                             Valid {paymentInfo.providerName} address confirmed. Your funds will be routed to this network securely.
                                          </p>
                                       </div>
                                     ) : (
                                       <div className="bg-red-50 border border-red-200 rounded-[8px] p-3 flex items-start gap-2 animate-in fade-in duration-300 shadow-sm">
                                          <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                                          <p className="text-red-600 text-[12px] font-medium leading-relaxed">
                                             This address does not match the {paymentInfo.providerName} network format or is incomplete. Please check and try again.
                                          </p>
                                       </div>
                                     )
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {(payoutMethod === "moneygram" || payoutMethod === "pix") && (
                            <>
                              <input 
                                type="text" 
                                value={paymentInfo.accountName}
                                onChange={(e) => setPaymentInfo({...paymentInfo, accountName: e.target.value})}
                                placeholder={payoutMethod === 'pix' ? "PIX Key Name" : "Receiver Full Name"}
                                className="w-full border border-[#E5E7EB] rounded-[8px] p-3.5 text-[14px] outline-none focus:border-[#111827] transition-colors bg-white"
                              />
                              <input 
                                type="text" 
                                value={paymentInfo.accountNumber}
                                onChange={(e) => setPaymentInfo({...paymentInfo, accountNumber: e.target.value})}
                                placeholder={payoutMethod === 'pix' ? "PIX Key" : "ID/Phone Number"}
                                className="w-full border border-[#E5E7EB] rounded-[8px] p-3.5 text-[14px] outline-none focus:border-[#111827] transition-colors bg-white"
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {payoutMethod && (
                  <div className="mt-auto pt-6 pb-2 animate-in fade-in duration-300">
                    <div className="space-y-2.5 mb-6 border-t border-[#F3F4F6] pt-4">
                      <div className="flex justify-between text-[13px] font-medium text-[#4B5563]">
                        <span>Principal amount</span>
                        <span>{paymentData.amount.toFixed(2)} USDC</span>
                      </div>
                      {finalYieldEarned > 0 && (
                        <div className="flex justify-between text-[13px] font-medium text-[#059669]">
                          <span>Yield bonus (from Sender)</span>
                          <span>+{finalYieldEarned.toFixed(2)} USDC</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[13px] font-medium text-[#4B5563]">
                        <span>Gross Conversion</span>
                        <span className="text-[#111827]">{amounts.symbol} {amounts.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-[13px] font-medium text-amber-600">
                        <span>Rail Fee</span>
                        <span>-{amounts.symbol} {amounts.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[15px] font-bold text-[#111827] pt-2 border-t border-[#E5E7EB]">
                        <span>You'll receive</span>
                        <span className="text-green-600">{amounts.symbol} {amounts.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <button
                      disabled={!isFormValid || isLoadingClaim || isLocked}
                      onClick={handleClaimInitiate}
                      className={`w-full py-3.5 rounded-[8px] font-medium text-[14px] transition-all flex items-center justify-center ${
                        isFormValid && !isLoadingClaim && !isLocked
                          ? "bg-[#111827] text-white hover:bg-black active:scale-[0.98]"
                          : "bg-[#111827] text-white opacity-40 cursor-not-allowed"
                      }`}
                    >
                      {isLoadingClaim ? (
                        <Loader2 size={18} className="animate-spin text-white" />
                      ) : isLocked ? (
                        "Currently Time-Locked"
                      ) : (
                        `Claim to ${(METHODS as any)[payoutMethod]?.label.replace('To ', '')}`
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full xl:w-[260px] bg-white border border-[#E5E7EB] rounded-[16px] p-6 shadow-[0px_2px_8px_rgba(0,0,0,0.02)] flex-shrink-0">
              <h3 className="text-[13px] font-medium text-[#111827] mb-5">Transaction info</h3>
              
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Amount</span>
                  <span className="font-semibold text-[#111827]">${paymentData.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Created</span>
                  <span className="font-semibold text-[#111827]">{formattedCreatedDate}</span>
                </div>


                
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Claimable</span>
                  <span className={`font-semibold ${claimableDisplay === "Claimable Now" ? "text-[#059669]" : "text-amber-600"}`}>
                    {claimableDisplay}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Expires On</span>
                  <span className="font-semibold text-[#111827]">{expiryDisplay}</span>
                </div>

                <div className="flex justify-between items-center text-[13px] pt-2 border-t border-[#F3F4F6]">
                  <span className="text-[#4B5563]">Yield earned</span>
                  <span className="font-semibold text-[#059669]">
                    ${finalYieldEarned.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Live market APY</span>
                  <span className="font-semibold text-[#059669] bg-[#D1FADF] px-1.5 py-0.5 rounded">{apy}%</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#4B5563]">Time in escrow</span>
                  <span className="font-semibold text-[#111827]">{dynamicTimeInEscrow}</span>
                </div>
              </div>
            </div>

          </div>

          <style dangerouslySetInnerHTML={{ __html: `
            .custom-scrollbar::-webkit-scrollbar {
              width: 5px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #E5E7EB;
              border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #D1D5DB;
            }
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-4px); }
              40% { transform: translateX(4px); }
              60% { transform: translateX(-4px); }
              80% { transform: translateX(4px); }
            }
            .animate-shake {
              animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
            }
          ` }} />

          {/* OTP MODAL OVERLAY */}
          {isOtpModalOpen && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-[400px] rounded-[20px] shadow-2xl p-8 text-center relative animate-in zoom-in-95 duration-300">
                
                <button onClick={() => setIsOtpModalOpen(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-[#E5E7EB] transition-colors shadow-sm">
                  <X size={16} className="text-[#111827]" />
                </button>

                <div className="w-12 h-8 border border-[#111827] rounded-[4px] bg-[#E8FAED] flex items-center justify-center mx-auto mb-6 mt-4">
                  <span className="text-[#111827] font-bold text-[16px] leading-none mt-1">***</span>
                </div>

                <h3 className="text-[20px] font-bold text-[#111827] mb-2 tracking-tight">Verify OTP Code</h3>
                <p className="text-[13px] font-medium text-[#4B5563] mb-4">Please enter the OTP that was sent to your email</p>
                <p className="text-[14px] font-semibold text-[#111827] mb-8">{email}</p>

                <div className="mb-6">
                  <div className={isShaking ? "animate-shake" : ""}>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, ''));
                        if (otpError) setOtpError(""); 
                      }}
                      placeholder="enter the 6-digit verification OTP here"
                      className={`w-full border rounded-[8px] p-3.5 text-[10px] text-center outline-none transition-colors tracking-[0.2em] font-normal ${
                        otpError 
                          ? "border-red-500 focus:border-red-500 bg-red-50" 
                          : "border-[#E5E7EB] focus:border-[#111827]"
                      }`}
                    />
                  </div>
                  {otpError ? (
                    <p className="text-red-500 text-[12px] mt-2 font-medium">{otpError}</p>
                  ) : (
                    <p className="text-[#6B7280] text-[11px] mt-2"></p>
                  )}
                </div>

                <button
                  disabled={otp.length !== 6 || isVerifyingOtp}
                  onClick={handleVerifyOtp}
                  className={`w-full py-3.5 rounded-[8px] font-medium text-[14px] transition-all flex items-center justify-center mb-6 ${
                    otp.length === 6 && !isVerifyingOtp
                      ? "bg-[#111827] text-white hover:bg-black active:scale-[0.98]"
                      : "bg-[#111827] text-white opacity-40 cursor-not-allowed"
                  }`}
                >
                  {isVerifyingOtp ? <Loader2 size={18} className="animate-spin text-white" /> : "Verify code"}
                </button>

                <p className="text-[13px] font-medium text-[#4B5563]">
                  Didn't get code?{" "}
                  <button 
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0}
                    className={`font-bold ml-1 transition-colors ${
                      resendTimer > 0 
                        ? "text-[#9CA3AF] cursor-not-allowed" 
                        : "text-[#111827] underline hover:text-black"
                    }`}
                  >
                    {resendTimer > 0 ? `Resend in 0:${resendTimer.toString().padStart(2, '0')}` : "Resend OTP"}
                  </button>
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
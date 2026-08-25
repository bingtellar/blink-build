import { useState, useMemo, useEffect, ReactElement } from "react";
import {
  ChevronLeft,
  ArrowUpRight,
  Check,
  Loader2,
  ChevronDown,
  Search,
  User,
  X,
  Users,
} from "lucide-react";
import { api } from "../../lib/api"; 

type Step = "SEARCH" | "AMOUNT" | "SUCCESS";
type SplitType = "EQUAL" | "CUSTOM";

interface Recipient {
  id: string;
  name: string;
  contact: string;
  type: "email" | "phone" | "x_handle";
}

interface RequestpaymentEmailPhoneProps {
  onClose: () => void;
}

const getCurrencyDetails = (curr: string) => {
  switch (curr) {
    case "USDC": return { symbol: "$", color: "bg-[#2775CA]", rate: 1 };
    case "NGN": return { symbol: "₦", color: "bg-[#34A853]", rate: 1401 };
    case "GHS": return { symbol: "₵", color: "bg-[#FBBC05]", rate: 13.5 };
    case "KES": return { symbol: "KSh", color: "bg-[#EA4335]", rate: 130 };
    default: return { symbol: "$", color: "bg-[#2775CA]", rate: 1 };
  }
};

// --- VALIDATION REGEX ---
const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone: string) => {
  return /^\+[1-9]\d{9,14}$/.test(phone);
};

const isValidXHandle = (handle: string) => {
  return /^@[a-zA-Z0-9_]{1,15}$/.test(handle); 
};

// --- REUSABLE NUMBER FORMATTER ---
const formatAmountString = (val: string) => {
  let rawValue = val.replace(/,/g, "");
  const validChars = rawValue.replace(/[^0-9.]/g, "");
  const parts = validChars.split(".");
  let formatted = parts[0];
  if (parts.length > 1) {
    formatted += "." + parts.slice(1).join("");
  }
  const splitForCommas = formatted.split(".");
  if (splitForCommas[0]) {
    const intPart = splitForCommas[0].replace(/^0+(?=\d)/, "");
    splitForCommas[0] = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  return splitForCommas.join(".");
};

export const RequestpaymentEmailPhone = ({
  onClose
}: RequestpaymentEmailPhoneProps): ReactElement => {
  
  // --- STATE ---
  const [addressBook, setAddressBook] = useState<Recipient[]>([]);
  const [step, setStep] = useState<Step>("SEARCH");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });

  // Step 1: Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);

  // Step 2: Form State
  const [splitType, setSplitType] = useState<SplitType>("EQUAL");
  const [amount, setAmount] = useState(""); 
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({}); 
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("USDC");
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [generatedRef, setGeneratedRef] = useState("");

  useEffect(() => {
    const fetchAddressBook = async () => {
      try {
        const res = await api.get('/users/addressbook');
        if (Array.isArray(res.data)) {
          setAddressBook(res.data);
        }
      } catch (error) {
        setAddressBook([]);
      }
    };
    fetchAddressBook();
  }, []);

  // 🌟 BULLETPROOF CLOSE HANDLER: Prevents page reloads and resets stale state
  const handleSafeClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setStep("SEARCH");
    setSearchQuery("");
    setSelectedRecipients([]);
    setAmount("");
    setCustomAmounts({});
    setNote("");
    setIsCurrencyDropdownOpen(false);
    onClose();
  };

  // --- HANDLERS (STEP 1) ---
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return addressBook.filter(
      (user) =>
        !selectedRecipients.find((r) => r.id === user.id) &&
        (user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.contact.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [searchQuery, selectedRecipients, addressBook]);

  const handleSelectRecipient = (recipient: Recipient) => {
    if (selectedRecipients.length < 20) {
      setSelectedRecipients([...selectedRecipients, recipient]);
      setSearchQuery("");
    }
  };

  const handleRemoveRecipient = (id: string) => {
    setSelectedRecipients(selectedRecipients.filter((r) => r.id !== id));
    if (customAmounts[id]) {
      const newAmounts = { ...customAmounts };
      delete newAmounts[id];
      setCustomAmounts(newAmounts);
    }
  };

  const handleAddCustomRecipient = () => {
    const isEmail = isValidEmail(searchQuery);
    const isPhone = isValidPhone(searchQuery);
    const isXHandle = isValidXHandle(searchQuery);

    if ((isEmail || isPhone || isXHandle) && selectedRecipients.length < 20) {
      handleSelectRecipient({
        id: Date.now().toString(),
        name: isEmail ? "Email account" : isPhone ? "Phone contact" : "X Account", 
        contact: searchQuery,
        type: isEmail ? "email" : isPhone ? "phone" : "x_handle", 
      });
    }
  };

  const isCustomInputValid = isValidEmail(searchQuery) || isValidPhone(searchQuery) || isValidXHandle(searchQuery);

  // --- HANDLERS (STEP 2) ---
  const handleSplitTypeChange = (type: SplitType) => {
    if (type === "CUSTOM" && splitType === "EQUAL" && amount) {
      const prefilled: Record<string, string> = {};
      selectedRecipients.forEach((r) => (prefilled[r.id] = amount));
      setCustomAmounts(prefilled);
    }
    setSplitType(type);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatAmountString(e.target.value));
  };

  const handleCustomAmountChange = (id: string, val: string) => {
    setCustomAmounts((prev) => ({ ...prev, [id]: formatAmountString(val) }));
  };

  // --- VALIDATION & MATH ---
  const numericAmount = parseFloat(amount.replace(/,/g, "")) || 0;

  const isAmountValid =
    splitType === "EQUAL"
      ? !isNaN(numericAmount) && numericAmount > 0
      : selectedRecipients.length > 0 &&
        selectedRecipients.every((r) => {
          const num = parseFloat((customAmounts[r.id] || "0").replace(/,/g, ""));
          return !isNaN(num) && num > 0;
        });

  const totalRequestedNum =
    splitType === "EQUAL"
      ? numericAmount * selectedRecipients.length
      : selectedRecipients.reduce((sum, r) => sum + (parseFloat((customAmounts[r.id] || "0").replace(/,/g, "")) || 0), 0);

  const handleSendRequest = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!isAmountValid || selectedRecipients.length === 0) return;
    setIsLoading(true);
    
    try {
      const rate = getCurrencyDetails(currency).rate;
      const baseUsdcEquivalent = totalRequestedNum / rate;

      const payload = {
          amount: baseUsdcEquivalent.toString(),
          fiatAmount: currency === "USDC" ? undefined : totalRequestedNum.toString(),
          fiatCurrency: currency,
          note: note,
          splitType,
          recipients: selectedRecipients.map(r => ({ id: r.id, name: r.name, contact: r.contact })),
          customAmounts: customAmounts
      };

      const res = await api.post('/requests/bulk', payload);
      setGeneratedRef(res.data.reference);
      
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      
      // 🌟 AGENTIC FEEDBACK LOOP
      window.dispatchEvent(new CustomEvent('agentic_transaction_success', {
        detail: {
          type: 'request',
          data: {
            amount: totalRequestedNum,
            currency: currency,
            recipientsCount: selectedRecipients.length,
            link: `${window.location.origin}/pay?pay_req=${res.data.reference}`
          }
        }
      }));

      setStep("SUCCESS");
    } catch (error: any) {
      console.error("Failed to send request", error);
      setToast({ show: true, message: error.response?.data?.error || "Failed to create request." });
      setTimeout(() => setToast({ show: false, message: "" }), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  // --- FORMATTING ---
  const currentCurrency = getCurrencyDetails(currency);
  const formattedDate = new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).replace(/\//g, " - ");
  const paymentLink = `${window.location.origin}/pay?pay_req=${generatedRef}`;

  const totalRequestedFormatted = totalRequestedNum.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const handleShareLink = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Payment Request", url: paymentLink });
      } else {
        await navigator.clipboard.writeText(paymentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Failed to share", err);
    }
  };

  // 🌟 SMART X HELPER
  const handleShareOnX = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const xRecipients = selectedRecipients.filter(r => r.type === "x_handle");
    let mentionText = '';
    
    if (xRecipients.length === 1) {
      const cleanHandle = xRecipients[0].contact.replace(/^@+/, '');
      mentionText = `@${cleanHandle} `;
    }

    const tweetText = `Hey ${mentionText}I just sent you a payment request for ${currentCurrency.symbol}${totalRequestedFormatted} on Blink!\n\nPay securely here:\n${paymentLink}`;
    const xIntentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    
    window.open(xIntentUrl, '_blank', 'noopener,noreferrer');
  };

  // 🌟 SMART WHATSAPP HELPER (DEEP LINKING)
  const handleShareOnWhatsApp = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const phoneRecipients = selectedRecipients.filter(r => r.type === "phone");
    const message = `Hey, I just sent you a payment request for ${currentCurrency.symbol}${totalRequestedFormatted} on Blink!\n\nPay securely here:\n${paymentLink}`;
    
    let waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    if (phoneRecipients.length === 1) {
      const cleanNumber = phoneRecipients[0].contact.replace(/\D/g, ''); 
      waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    }
    
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const hasXHandle = selectedRecipients.some(r => r.type === "x_handle");
  const hasPhone = selectedRecipients.some(r => r.type === "phone");

  return (
    <div className="w-full h-full bg-white flex flex-col pt-8 px-6 pb-12 overflow-y-auto animate-in fade-in relative">
      
      {/* TOAST NOTIFICATION */}
      {toast.show && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-3.5 rounded-full text-[13px] font-bold shadow-2xl z-[150] animate-in slide-in-from-top-5 fade-in duration-300 flex items-center gap-3">
          <div className="w-5 h-5 bg-[#34A853] rounded-full flex items-center justify-center">
            <Check size={12} className="text-white" strokeWidth={3} />
          </div>
          {toast.message}
        </div>
      )}

      <div className="max-w-[480px] w-full mx-auto relative z-10">
        {/* SHARED BACK BUTTON FOR STEP 1 & 2 */}
        {step !== "SUCCESS" && (
          <button
            type="button"
            onClick={(e) => {
              if (step === "AMOUNT") {
                e.preventDefault();
                setStep("SEARCH");
              } else {
                handleSafeClose(e);
              }
            }}
            className="w-8 h-8 border border-[#E8E8E8] rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors mb-10 cursor-pointer"
          >
            <ChevronLeft size={16} className="text-[#1A1A1A]" />
          </button>
        )}

        {/* STEP 1: SEARCH & SELECT RECIPIENT */}
        {step === "SEARCH" && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <h1 className="text-[18px] font-bold text-[#1A1A1A] mb-8 text-center sm:text-left">
              Request money from friends
            </h1>

            <div className="flex items-start gap-4 mb-8">
              <div className="w-10 h-10 rounded-full bg-[#FF573A] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <ArrowUpRight size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-1">
                  Send payment request to Email or Phone
                </h3>
                <p className="text-[13px] text-[#757575] leading-relaxed pr-4">
                  You can request multiple payments from up to 20 people. They
                  don't need an account to pay.
                </p>
              </div>
            </div>

            <div className="relative mb-6">
              <div className="absolute left-4 top-[15px] text-gray-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, email, mobile or @handle" 
                className="w-full border border-[#D1D4D7] rounded-full py-3.5 pl-11 pr-4 bg-white outline-none focus:border-black transition-colors text-[14px] text-[#1A1A1A] placeholder-gray-400"
              />

              {searchQuery.trim().length > 0 && (
                <div className="absolute top-[110%] left-0 w-full bg-white border border-[#E8E8E8] rounded-[16px] shadow-lg max-h-[220px] overflow-y-auto z-20 py-2">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => handleSelectRecipient(user)}
                        className="px-5 py-3 hover:bg-[#F9F9F9] cursor-pointer flex flex-col transition-colors"
                      >
                        <span className="text-[14px] font-bold text-[#1A1A1A]">
                          {user.name}
                        </span>
                        <span className="text-[12px] text-[#757575]">
                          {user.contact}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div
                      onClick={handleAddCustomRecipient}
                      className={`px-5 py-3 flex flex-col transition-colors ${
                        isCustomInputValid
                          ? "hover:bg-[#F9F9F9] cursor-pointer"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span className="text-[14px] font-bold text-[#1A1A1A]">
                        Add "{searchQuery}"
                      </span>
                      <span className="text-[12px] text-[#757575]">
                        {isCustomInputValid
                          ? "Click to add this contact"
                          : "Please enter a valid email, phone number, or X @handle"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedRecipients.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedRecipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex items-center gap-2 bg-[#F5F5F4] border border-[#E8E8E8] rounded-full pl-3 pr-1.5 py-1.5 animate-in zoom-in-95 duration-200"
                  >
                    <span className="text-[13px] font-medium text-[#1A1A1A] max-w-[150px] truncate">
                      {recipient.name !== "Email account" &&
                      recipient.name !== "Phone contact" && 
                      recipient.name !== "X Account"
                        ? recipient.name
                        : recipient.contact}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(recipient.id)}
                      className="w-5 h-5 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                      <X size={12} className="text-[#1A1A1A]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-[#FAFAFA] border border-[#E8E8E8] rounded-[16px] p-5 flex gap-4 mb-8 items-start">
              <div className="w-6 h-6 rounded-full bg-[#FBBC05] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[#1A1A1A] font-bold text-[12px]">!</span>
              </div>
              <p className="text-[13px] text-[#1A1A1A] leading-relaxed">
                Use a plus (+) sign and country code for phone numbers.
                <br />
                Use the @ symbol for X (Twitter) handles.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-[#E8E8E8] pt-6">
              <button
                type="button"
                disabled={selectedRecipients.length === 0}
                onClick={(e) => { e.preventDefault(); setStep("AMOUNT"); }}
                className={`px-8 py-2.5 rounded-full font-bold text-[13px] transition-all ${
                  selectedRecipients.length > 0
                    ? "bg-[#1A1A1A] text-white hover:bg-black"
                    : "bg-[#F5F5F4] text-[#A3A3A3] cursor-not-allowed"
                }`}
              >
                Next
              </button>

              <div className="flex items-center gap-2 text-[#757575] text-[13px] font-medium">
                <Users size={16} />
                <span>{selectedRecipients.length}/20</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DEFINE AMOUNT & DETAILS */}
        {step === "AMOUNT" && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <h1 className="text-[18px] font-bold text-[#1A1A1A] mb-8 text-center sm:text-left">
              Request money from friends
            </h1>

            <div className="flex items-start gap-4 mb-8">
              <div className="w-10 h-10 rounded-full bg-[#FF573A] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <ArrowUpRight size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#1A1A1A] mb-1">
                  Send payment request to Email or Phone
                </h3>
                <p className="text-[13px] text-[#757575] leading-relaxed">
                  You can request multiple payments from up to 20 people. They
                  don't need an account to pay.
                </p>
              </div>
            </div>

            {selectedRecipients.length > 1 && (
              <div className="bg-[#F5F5F4] p-1 rounded-[12px] flex items-center mb-6">
                <button
                  type="button"
                  onClick={() => handleSplitTypeChange("EQUAL")}
                  className={`flex-1 py-2.5 text-[12px] font-bold rounded-[10px] transition-all ${
                    splitType === "EQUAL"
                      ? "bg-white shadow-sm text-[#1A1A1A]"
                      : "text-[#757575] hover:text-[#1A1A1A]"
                  }`}
                >
                  Same amount
                </button>
                <button
                  type="button"
                  onClick={() => handleSplitTypeChange("CUSTOM")}
                  className={`flex-1 py-2.5 text-[12px] font-bold rounded-[10px] transition-all ${
                    splitType === "CUSTOM"
                      ? "bg-white shadow-sm text-[#1A1A1A]"
                      : "text-[#757575] hover:text-[#1A1A1A]"
                  }`}
                >
                  Different amounts
                </button>
              </div>
            )}

            {splitType === "EQUAL" && (
              <>
                <div className="space-y-3 mb-8">
                  {selectedRecipients.map((recipient) => (
                    <div key={recipient.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#E8F0FE] rounded-full flex items-center justify-center relative shrink-0">
                        <User size={18} className="text-[#2775CA]" />
                        <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                          <ArrowUpRight size={10} className="text-[#1A1A1A]" />
                        </div>
                      </div>
                      <div className="truncate pr-4">
                        <h4 className="text-[13px] font-bold text-[#1A1A1A] truncate">
                          {recipient.type === "email" && recipient.name === "Email account"
                            ? recipient.contact
                            : recipient.type === "x_handle" && recipient.name === "X Account"
                            ? recipient.contact
                            : recipient.name}
                        </h4>
                        <p className="text-[12px] text-[#757575] truncate">
                          {recipient.contact}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[13px] font-medium text-[#1A1A1A] mb-2 block">
                      Amount
                    </label>
                    <div className="w-full flex items-center justify-between border border-[#D1D4D7] rounded-[12px] p-3 bg-white focus-within:border-black transition-colors">
                      <input
                        type="text"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0"
                        className="bg-transparent outline-none text-[15px] font-medium w-full text-[#1A1A1A]"
                      />

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)
                          }
                          className="flex items-center gap-2 bg-[#F9F9F9] hover:bg-gray-100 transition-colors px-3 py-1.5 rounded-full border border-[#E8E8E8]"
                        >
                          <div
                            className={`w-5 h-5 ${currentCurrency.color} rounded-full flex items-center justify-center text-white font-bold text-[11px]`}
                          >
                            {currentCurrency.symbol}
                          </div>
                          <span className="font-bold text-[12px] text-[#1A1A1A]">
                            {currency}
                          </span>
                          <ChevronDown size={14} className="text-gray-500" />
                        </button>

                        {isCurrencyDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setIsCurrencyDropdownOpen(false)}
                            />
                            <div className="absolute top-[110%] right-0 w-[120px] bg-white border border-[#E8E8E8] rounded-[12px] shadow-xl p-1.5 z-30 animate-in fade-in slide-in-from-top-2">
                              {["USDC", "NGN", "GHS", "KES"].map((c) => (
                                <div
                                  key={c}
                                  onClick={() => {
                                    setCurrency(c);
                                    setIsCurrencyDropdownOpen(false);
                                  }}
                                  className="p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer text-[12px] font-medium flex items-center gap-3 transition-colors"
                                >
                                  <div
                                    className={`w-5 h-5 ${
                                      getCurrencyDetails(c).color
                                    } rounded-full flex items-center justify-center text-white font-bold text-[11px]`}
                                  >
                                    {getCurrencyDetails(c).symbol}
                                  </div>
                                  {c}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {amount && selectedRecipients.length > 1 && (
                      <p className="text-[12px] text-[#757575] mt-2 ml-1 animate-in fade-in">
                        Each person will be requested to pay{" "}
                        <span className="font-bold text-[#1A1A1A]">
                          {currentCurrency.symbol}
                          {amount}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {splitType === "CUSTOM" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-[#E8E8E8]">
                  <span className="text-[13px] font-bold text-[#1A1A1A]">
                    Set amounts for each person
                  </span>

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)
                      }
                      className="flex items-center gap-2 bg-white transition-colors px-3 py-1.5 rounded-full border border-[#D1D4D7] hover:border-black"
                    >
                      <div
                        className={`w-5 h-5 ${currentCurrency.color} rounded-full flex items-center justify-center text-white font-bold text-[11px]`}
                      >
                        {currentCurrency.symbol}
                      </div>
                      <span className="font-bold text-[12px] text-[#1A1A1A]">
                        {currency}
                      </span>
                      <ChevronDown size={14} className="text-gray-500" />
                    </button>

                    {isCurrencyDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setIsCurrencyDropdownOpen(false)}
                        />
                        <div className="absolute top-[110%] right-0 w-[120px] bg-white border border-[#E8E8E8] rounded-[12px] shadow-xl p-1.5 z-30 animate-in fade-in slide-in-from-top-2">
                          {["USDC", "NGN", "GHS", "KES"].map((c) => (
                            <div
                              key={c}
                              onClick={() => {
                                setCurrency(c);
                                setIsCurrencyDropdownOpen(false);
                              }}
                              className="p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer text-[12px] font-medium flex items-center gap-3 transition-colors"
                            >
                              <div
                                className={`w-5 h-5 ${
                                  getCurrencyDetails(c).color
                                } rounded-full flex items-center justify-center text-white font-bold text-[11px]`}
                              >
                                {getCurrencyDetails(c).symbol}
                              </div>
                              {c}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedRecipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex items-center justify-between gap-3 bg-[#FAFAFA] p-3 rounded-[16px] border border-[#E8E8E8]"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shrink-0 border border-[#E8E8E8]">
                          <User size={16} className="text-[#2775CA]" />
                        </div>
                        <div className="truncate pr-2">
                          <h4 className="text-[13px] font-bold text-[#1A1A1A] truncate">
                            {recipient.type === "email" && recipient.name === "Email account"
                              ? recipient.contact
                              : recipient.type === "x_handle" && recipient.name === "X Account"
                              ? recipient.contact
                              : recipient.name}
                          </h4>
                          <p className="text-[11px] text-[#757575] truncate">
                            {recipient.contact}
                          </p>
                        </div>
                      </div>

                      <div className="w-[110px] shrink-0 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] font-medium text-[13px]">
                          {currentCurrency.symbol}
                        </span>
                        <input
                          type="text"
                          value={customAmounts[recipient.id] || ""}
                          onChange={(e) =>
                            handleCustomAmountChange(
                              recipient.id,
                              e.target.value
                            )
                          }
                          placeholder="0"
                          className="w-full border border-[#D1D4D7] rounded-[10px] py-2 pl-7 pr-3 text-[13px] font-bold text-[#1A1A1A] outline-none focus:border-black transition-colors"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <label className="text-[13px] font-medium text-[#1A1A1A] mb-2 block">
                Add a note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What is this payment for?"
                className="w-full h-[100px] resize-none border border-[#D1D4D7] rounded-[12px] p-4 bg-white outline-none focus:border-black transition-colors text-[13px] text-[#1A1A1A] placeholder-[#A3A3A3]"
              />
            </div>

            <div className="flex items-center justify-end gap-6 mt-10 border-t border-[#E8E8E8] pt-6">
              <button
                type="button"
                onClick={handleSafeClose}
                className="text-[13px] font-bold text-[#1A1A1A] hover:text-gray-500 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isAmountValid || isLoading}
                onClick={handleSendRequest}
                className={`flex items-center justify-center px-6 py-3.5 rounded-[12px] font-bold text-[13px] transition-all shadow-sm ${
                  isAmountValid
                    ? "bg-[#1A1A1A] text-white hover:bg-black active:scale-[0.98]"
                    : "bg-[#F5F5F4] text-[#A3A3A3] cursor-not-allowed shadow-none"
                }`}
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : null}
                {isLoading
                  ? "Sending..."
                  : `Request ${currentCurrency.symbol}${totalRequestedFormatted}`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS VIEW */}
        {step === "SUCCESS" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300 pt-10">
            <div className="w-16 h-16 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-6 shadow-sm border-[4px] border-white">
              <Check size={28} strokeWidth={3.5} className="text-[#34A853]" />
            </div>

            <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-3">
              You've successfully created a request
            </h2>

            <p className="text-[13px] text-[#757575] mb-8 leading-relaxed max-w-[340px]">
              Whoosh. We've notified your friend you requested money. By sharing
              link, you accept that some of your details will be shared.
            </p>

            <div className="w-full max-w-[380px] bg-[#F5F5F4] rounded-[16px] p-6 mb-8 text-left relative shadow-sm border border-[#E8E8E8]">
              <div className="absolute left-[35px] top-[40px] bottom-[40px] w-[1px] bg-[#D1D4D7] z-0" />

              <div className="flex items-start gap-4 mb-8 relative z-10">
                <div className="w-6 h-6 bg-[#1A1A1A] rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[3px] border-[#F5F5F4]">
                  <Check size={12} strokeWidth={4} className="text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#1A1A1A]">
                    Request created
                  </p>
                  <p className="text-[11px] text-[#757575] mt-0.5">
                    {formattedDate}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 relative z-10">
                <div className="w-6 h-6 bg-white border-2 border-[#1A1A1A] rounded-full shrink-0 border-[3px] border-[#F5F5F4]" />
                <div className="flex items-center gap-6">
                  <p className="text-[13px] font-medium text-[#1A1A1A]">
                    {currentCurrency.symbol}0 contributed
                  </p>
                  <p className="text-[13px] font-medium text-[#757575]">
                    {currentCurrency.symbol}
                    {totalRequestedFormatted} remaining
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-[380px] space-y-3">
              {(hasXHandle || hasPhone) && (
                <div className="flex items-center gap-3 w-full">
                  {hasXHandle && (
                    <button
                      type="button"
                      onClick={handleShareOnX}
                      className="flex-1 bg-[#1A1A1A] text-white rounded-[12px] h-[52px] font-bold text-[13px] hover:bg-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      X
                    </button>
                  )}

                  {hasPhone && (
                    <button
                      type="button"
                      onClick={handleShareOnWhatsApp}
                      className="flex-1 bg-[#25D366] text-white rounded-[12px] h-[52px] font-bold text-[13px] hover:bg-[#20bd5a] transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      WhatsApp
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleShareLink}
                className={`w-full flex items-center justify-center gap-2 rounded-[12px] h-[52px] font-bold text-[13px] transition-all active:scale-[0.98] shadow-sm ${
                  copied
                    ? "bg-[#34A853] hover:bg-green-600 text-white border-none"
                    : "bg-white hover:bg-[#F9F9F9] text-[#1A1A1A] border border-[#D1D4D7]"
                }`}
              >
                {copied && <Check size={16} strokeWidth={3} className="animate-in zoom-in" />}
                {copied ? "Link Copied!" : "Copy Link"}
              </button>

              <button
                type="button"
                onClick={handleSafeClose}
                className="w-full py-2 text-[13px] font-semibold text-gray-500 hover:text-black transition-colors mt-2 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
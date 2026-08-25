import { useState, useEffect, ReactElement } from "react";
import { 
  ChevronLeft, 
  ArrowUpRight, 
  Check,
  Loader2,
  ScanLine,
  ChevronDown
} from "lucide-react";
import { TransactionData } from "./MainDashboard";
import { api } from "../../lib/api";
import { useStore } from "../../store/useStore";

type Step = "SETUP" | "SUCCESS";

// 🌟 CLEANUP: All prop-drilling removed!
interface RequestPaymentFlowProps {
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

export const RequestPaymentFlow = ({
  onClose
}: RequestPaymentFlowProps): ReactElement => {
  
  // 🌟 ZUSTAND: Pull active account for context
  const activeAccount = useStore((state) => state.activeAccount);

  const [step, setStep] = useState<Step>("SETUP");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });
  
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("USDC");
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

  const [generatedRef, setGeneratedRef] = useState("");

  // 🌟 DYNAMIC PAYMENT LINK: Uses the exact Postgres reference
  const paymentLink = `${window.location.origin}/pay?pay_req=${generatedRef}`;
  
  const triggerToast = (msg: string) => {
    setToast({ show: true, message: msg });
    setTimeout(() => setToast({ show: false, message: "" }), 4000);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/,/g, '');
    const validChars = rawValue.replace(/[^0-9.]/g, '');
    const parts = validChars.split('.');
    let formatted = parts[0];
    if (parts.length > 1) {
      formatted += '.' + parts.slice(1).join('');
    }

    const splitForCommas = formatted.split('.');
    if (splitForCommas[0]) {
      const intPart = splitForCommas[0].replace(/^0+(?=\d)/, '');
      splitForCommas[0] = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    setAmount(splitForCommas.join('.'));
  };

  const numericAmount = parseFloat(amount.replace(/,/g, '')) || 0;

  // 🌟 PRODUCTION API HOOK: Directly hits your Postgres Database
  const handleSendRequest = async () => {
    if (!numericAmount || numericAmount <= 0) return;
    setIsLoading(true);

    try {
      const rate = getCurrencyDetails(currency).rate;
      const usdcEquivalent = numericAmount / rate;

      const payload = {
        amount: usdcEquivalent.toString(),
        fiatAmount: currency === "USDC" ? undefined : numericAmount.toString(),
        fiatCurrency: currency,
        note: note
      };

      // Calls the dedicated open-link endpoint we are about to add
      const res = await api.post('/requests/open', payload);
      setGeneratedRef(res.data.reference);

      // Force UI Sync to pull the newly created transactions from the backend!
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      
      setStep("SUCCESS");
    } catch (error: any) {
      console.error("Failed to create open request", error);
      setToast({ show: true, message: error.response?.data?.error || "Failed to create request." });
      setTimeout(() => setToast({ show: false, message: "" }), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Payment Request',
          text: `Please pay ${amount} ${currency} using this link:`,
          url: paymentLink,
        });
      } else {
        await navigator.clipboard.writeText(paymentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Failed to share/copy", err);
    }
  };

  const isFormValid = !isNaN(numericAmount) && numericAmount > 0;
  const currentCurrency = getCurrencyDetails(currency);

  const formattedDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(/\//g, ' - ');

  return (
    <div className="w-full h-full bg-white flex flex-col pt-8 px-6 pb-12 overflow-y-auto animate-in fade-in relative">
      
      {toast.show && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-3.5 rounded-full text-[13px] font-bold shadow-2xl z-[150] animate-in slide-in-from-top-5 fade-in duration-300 flex items-center gap-3">
          <div className="w-5 h-5 bg-[#34A853] rounded-full flex items-center justify-center">
            <Check size={12} className="text-white" strokeWidth={3} />
          </div>
          {toast.message}
        </div>
      )}

      {step === "SETUP" && (
        <div className="max-w-[440px] w-full mx-auto relative z-10">
          <button 
            onClick={onClose}
            className="w-8 h-8 border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors mb-8"
          >
            <ChevronLeft size={16} className="text-gray-600" />
          </button>

          <h1 className="text-[20px] font-bold text-[#1A1A1A] mb-6">
            Request payment from anyone
          </h1>

          <div className="flex items-start gap-3 mb-8">
            <div className="w-8 h-8 rounded-full bg-[#FF573A] flex items-center justify-center shrink-0">
              <ArrowUpRight size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-[#1A1A1A] mb-1">
                Receive money from anyone without their email
              </h3>
              <p className="text-[12px] text-[#757575] leading-relaxed">
                You can share this unique link to customers via text, social channels, whatsapp etc to get paid from anywhere in the world. zero stress.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-[13px] font-medium text-[#1A1A1A] mb-2 block">
                Amount
              </label>
              <div className="w-full flex items-center justify-between border border-gray-200 rounded-[12px] p-3 bg-white focus-within:border-gray-400 transition-colors">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  className="bg-transparent outline-none text-[15px] font-medium w-full text-[#1A1A1A]"
                />
                
                <div className="relative shrink-0">
                  <button 
                    onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                    className="flex items-center gap-2 bg-[#F9F9F9] hover:bg-gray-100 transition-colors px-3 py-1.5 rounded-full border border-gray-100"
                  >
                    <div className={`w-5 h-5 ${currentCurrency.color} rounded-full flex items-center justify-center text-white font-bold text-[11px] transition-colors`}>
                      {currentCurrency.symbol}
                    </div>
                    <span className="font-bold text-[12px] text-[#1A1A1A]">{currency}</span>
                    <ChevronDown size={14} className="text-gray-500" />
                  </button>

                  {isCurrencyDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setIsCurrencyDropdownOpen(false)} />
                      <div className="absolute top-[110%] right-0 w-[120px] bg-white border border-gray-100 rounded-[12px] shadow-xl p-1.5 z-30 animate-in fade-in slide-in-from-top-2">
                        {["USDC", "NGN", "GHS", "KES"].map((c) => (
                          <div 
                            key={c} 
                            onClick={() => { setCurrency(c); setIsCurrencyDropdownOpen(false); }}
                            className="p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer text-[12px] font-medium flex items-center gap-3 transition-colors"
                          >
                            <div className={`w-5 h-5 ${getCurrencyDetails(c).color} rounded-full flex items-center justify-center text-white font-bold text-[11px]`}>
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
            </div>

            <div>
              <label className="text-[13px] font-medium text-[#1A1A1A] mb-2 block">
                Add a note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What is this payment for?"
                className="w-full h-[100px] resize-none border border-gray-200 rounded-[12px] p-3 bg-white outline-none focus:border-gray-400 transition-colors text-[13px] text-[#1A1A1A] placeholder-gray-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 mt-8">
            <button 
              onClick={onClose}
              className="text-[13px] font-bold text-[#1A1A1A] hover:text-gray-600 transition-colors px-2"
            >
              Cancel
            </button>
            <button
              disabled={!isFormValid || isLoading}
              onClick={handleSendRequest}
              className={`flex items-center justify-center w-[160px] py-3 rounded-[12px] font-bold text-[13px] transition-all ${
                isFormValid 
                  ? "bg-[#1A1A1A] text-white hover:bg-black active:scale-[0.98]" 
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : "Send request now"}
            </button>
          </div>
        </div>
      )}

      {step === "SUCCESS" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-[440px] mx-auto w-full text-center animate-in zoom-in-95 duration-300">
          
          <div className="w-14 h-14 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-6">
            <Check size={28} strokeWidth={3} className="text-[#34A853]" />
          </div>

          <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">
            You've successfully created a request
          </h2>
          
          <p className="text-[13px] text-[#757575] mb-6 leading-relaxed">
            Whoosh. Start getting paid. By sharing link, you accept that some of your details will be shared.
          </p>

          <div className="mb-8 flex flex-col items-center">
            <div className="w-[120px] h-[120px] bg-white border border-gray-200 rounded-[16px] p-2.5 shadow-sm flex items-center justify-center mb-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(paymentLink)}`}
                alt="Payment QR Code"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
              <ScanLine size={12} />
              <span>Scan to pay</span>
            </div>
          </div>

          <div className="w-full bg-[#F5F5F4] rounded-[16px] p-5 mb-8 text-left relative">
            
            <div className="absolute left-[31px] top-[35px] bottom-[35px] w-[2px] bg-gray-200 z-0" />

            <div className="flex items-start gap-4 mb-8 relative z-10">
              <div className="w-6 h-6 bg-[#1A1A1A] rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm border-[3px] border-[#F5F5F4]">
                <Check size={12} strokeWidth={4} className="text-white" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#1A1A1A]">Request created</p>
                <p className="text-[11px] text-[#757575] mt-0.5">{formattedDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 relative z-10">
              <div className="w-6 h-6 bg-white border-2 border-[#1A1A1A] rounded-full shrink-0 border-[3px] border-[#F5F5F4]" />
              <div className="flex items-center gap-6">
                <p className="text-[13px] font-medium text-[#1A1A1A]">{currentCurrency.symbol}0 collected</p>
                <p className="text-[13px] font-medium text-[#757575]">{currentCurrency.symbol}{amount} remaining</p>
              </div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button 
              onClick={handleShareLink}
              className="w-full bg-[#1A1A1A] hover:bg-black text-white rounded-[12px] py-3.5 font-bold text-[13px] transition-all active:scale-[0.98] flex justify-center items-center gap-2"
            >
              {copied ? (
                <>
                  <Check size={16} /> Link Copied!
                </>
              ) : (
                <>
                   Share Link
                </>
              )}
            </button>
            <button 
              onClick={onClose}
              className="w-full bg-white hover:bg-gray-50 text-[#1A1A1A] border border-gray-200 rounded-[12px] py-3.5 font-bold text-[13px] transition-all active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
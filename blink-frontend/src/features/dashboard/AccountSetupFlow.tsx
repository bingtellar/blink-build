import React, { useState, useEffect } from "react";
import { 
  Building2, 
  FileText, 
  ChevronDown, 
  Loader2, 
  CheckCircle2, 
  Copy,
  ArrowRight,
  X,
  User,
  MapPin,
  CreditCard,
  AlertCircle,
  Clock,
  Search // 🌟 ADDED: Imported Search icon for the custom dropdown
} from "lucide-react";
import { AccountData } from "./MainDashboard";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// 🌟 UNIFIED COUNTRY DATA: Perfectly synced with UserProfile & SignupFlow
const COUNTRY_DATA = [
  { name: "Albania", code: "+355", flag: "🇦🇱" },
  { name: "Algeria", code: "+213", flag: "🇩🇿" },
  { name: "Andorra", code: "+376", flag: "🇦🇩" },
  { name: "Angola", code: "+244", flag: "🇦🇴" },
  { name: "Antarctica", code: "+672", flag: "🇦🇶" },
  { name: "Antigua and Barbuda", code: "+1-268", flag: "🇦🇬" },
  { name: "Argentina", code: "+54", flag: "🇦🇷" },
  { name: "Armenia", code: "+374", flag: "🇦🇲" },
  { name: "Australia", code: "+61", flag: "🇦🇺" },
  { name: "Austria", code: "+43", flag: "🇦🇹" },
  { name: "Azerbaijan", code: "+994", flag: "🇦🇿" },
  { name: "Bahamas", code: "+1-242", flag: "🇧🇸" },
  { name: "Bahrain", code: "+973", flag: "🇧🇭" },
  { name: "Bangladesh", code: "+880", flag: "🇧🇩" },
  { name: "Barbados", code: "+1-246", flag: "🇧🇧" },
  { name: "Belgium", code: "+32", flag: "🇧🇪" },
  { name: "Belize", code: "+501", flag: "🇧🇿" },
  { name: "Benin", code: "+229", flag: "🇧🇯" },
  { name: "Bermuda", code: "+1-441", flag: "🇧🇲" },
  { name: "Bhutan", code: "+975", flag: "🇧🇹" },
  { name: "Bolivia", code: "+591", flag: "🇧🇴" },
  { name: "Bosnia and Herzegovina", code: "+387", flag: "🇧🇦" },
  { name: "Botswana", code: "+267", flag: "🇧🇼" },
  { name: "Brazil", code: "+55", flag: "🇧🇷" },
  { name: "Brunei", code: "+673", flag: "🇧🇳" },
  { name: "Bulgaria", code: "+359", flag: "🇧🇬" },
  { name: "Burkina Faso", code: "+226", flag: "🇧🇫" },
  { name: "Burundi", code: "+257", flag: "🇧🇮" },
  { name: "Cambodia", code: "+855", flag: "🇰🇭" },
  { name: "Cameroon", code: "+237", flag: "🇨🇲" },
  { name: "Canada", code: "+1", flag: "🇨🇦" },
  { name: "Cape Verde", code: "+238", flag: "🇨🇻" },
  { name: "Central African Republic", code: "+236", flag: "🇨🇫" },
  { name: "Chad", code: "+235", flag: "🇹🇩" },
  { name: "Chile", code: "+56", flag: "🇨🇱" },
  { name: "China", code: "+86", flag: "🇨🇳" },
  { name: "Colombia", code: "+57", flag: "🇨🇴" },
  { name: "Comoros", code: "+269", flag: "🇰🇲" },
  { name: "Democratic Republic of the Congo", code: "+243", flag: "🇨🇩" },
  { name: "Costa Rica", code: "+506", flag: "🇨🇷" },
  { name: "Cote d'Ivoire", code: "+225", flag: "🇨🇮" },
  { name: "Croatia", code: "+385", flag: "🇭🇷" },
  { name: "Cyprus", code: "+357", flag: "🇨🇾" },
  { name: "Czech Republic", code: "+420", flag: "🇨🇿" },
  { name: "Denmark", code: "+45", flag: "🇩🇰" },
  { name: "Djibouti", code: "+253", flag: "🇩🇯" },
  { name: "Dominica", code: "+1-767", flag: "🇩🇲" },
  { name: "Dominican Republic", code: "+1-809", flag: "🇩🇴" },
  { name: "Ecuador", code: "+593", flag: "🇪🇨" },
  { name: "Egypt", code: "+20", flag: "🇪🇬" },
  { name: "El Salvador", code: "+503", flag: "🇸🇻" },
  { name: "Equatorial Guinea", code: "+240", flag: "🇬🇶" },
  { name: "Eritrea", code: "+291", flag: "🇪🇷" },
  { name: "Estonia", code: "+372", flag: "🇪🇪" },
  { name: "Ethiopia", code: "+251", flag: "🇪🇹" },
  { name: "Fiji", code: "+679", flag: "🇫🇯" },
  { name: "Finland", code: "+358", flag: "🇫🇮" },
  { name: "France", code: "+33", flag: "🇫🇷" },
  { name: "Gabon", code: "+241", flag: "🇬🇦" },
  { name: "Gambia", code: "+220", flag: "🇬🇲" },
  { name: "Georgia", code: "+995", flag: "🇬🇪" },
  { name: "Germany", code: "+49", flag: "🇩🇪" },
  { name: "Ghana", code: "+233", flag: "🇬🇭" },
  { name: "Greece", code: "+30", flag: "🇬🇷" },
  { name: "Greenland", code: "+299", flag: "🇬🇱" },
  { name: "Grenada", code: "+1-473", flag: "🇬🇩" },
  { name: "Guatemala", code: "+502", flag: "🇬🇹" },
  { name: "Guinea", code: "+224", flag: "🇬🇳" },
  { name: "Guinea-Bissau", code: "+245", flag: "🇬🇼" },
  { name: "Guyana", code: "+592", flag: "🇬🇾" },
  { name: "Haiti", code: "+509", flag: "🇭🇹" },
  { name: "Honduras", code: "+504", flag: "🇭🇳" },
  { name: "Hong Kong", code: "+852", flag: "🇭🇰" },
  { name: "Hungary", code: "+36", flag: "🇭🇺" },
  { name: "Iceland", code: "+354", flag: "🇮🇸" },
  { name: "India", code: "+91", flag: "🇮🇳" },
  { name: "Indonesia", code: "+62", flag: "🇮🇩" },
  { name: "Ireland", code: "+353", flag: "🇮🇪" },
  { name: "Israel", code: "+972", flag: "🇮🇱" },
  { name: "Italy", code: "+39", flag: "🇮🇹" },
  { name: "Jamaica", code: "+1-876", flag: "🇯🇲" },
  { name: "Japan", code: "+81", flag: "🇯🇵" },
  { name: "Jordan", code: "+962", flag: "🇯🇴" },
  { name: "Kazakhstan", code: "+7", flag: "🇰🇿" },
  { name: "Kenya", code: "+254", flag: "🇰🇪" },
  { name: "Kuwait", code: "+965", flag: "🇰🇼" },
  { name: "Kyrgyzstan", code: "+996", flag: "🇰🇬" },
  { name: "Laos", code: "+856", flag: "🇱🇦" },
  { name: "Latvia", code: "+371", flag: "🇱🇻" },
  { name: "Lesotho", code: "+266", flag: "🇱🇸" },
  { name: "Liberia", code: "+231", flag: "🇱🇷" },
  { name: "Liechtenstein", code: "+423", flag: "🇱🇮" },
  { name: "Lithuania", code: "+370", flag: "🇱🇹" },
  { name: "Luxembourg", code: "+352", flag: "🇱🇺" },
  { name: "Macedonia", code: "+389", flag: "🇲🇰" },
  { name: "Madagascar", code: "+261", flag: "🇲🇬" },
  { name: "Malawi", code: "+265", flag: "🇲🇼" },
  { name: "Malaysia", code: "+60", flag: "🇲🇾" },
  { name: "Maldives", code: "+960", flag: "🇲🇻" },
  { name: "Mali", code: "+223", flag: "🇲🇱" },
  { name: "Malta", code: "+356", flag: "🇲🇹" },
  { name: "Marshall Islands", code: "+692", flag: "🇲🇭" },
  { name: "Mauritania", code: "+222", flag: "🇲🇷" },
  { name: "Mauritius", code: "+230", flag: "🇲🇺" },
  { name: "Mexico", code: "+52", flag: "🇲🇽" },
  { name: "Micronesia", code: "+691", flag: "🇫🇲" },
  { name: "Moldova", code: "+373", flag: "🇲🇩" },
  { name: "Mongolia", code: "+976", flag: "🇲🇳" },
  { name: "Morocco", code: "+212", flag: "🇲🇦" },
  { name: "Mozambique", code: "+258", flag: "🇲🇿" },
  { name: "Namibia", code: "+264", flag: "🇳🇦" },
  { name: "Nepal", code: "+977", flag: "🇳🇵" },
  { name: "Netherlands", code: "+31", flag: "🇳🇱" },
  { name: "New Zealand", code: "+64", flag: "🇳🇿" },
  { name: "Nicaragua", code: "+505", flag: "🇳🇮" },
  { name: "Niger", code: "+227", flag: "🇳🇪" },
  { name: "Nigeria", code: "+234", flag: "🇳🇬" },
  { name: "Norway", code: "+47", flag: "🇳🇴" },
  { name: "Oman", code: "+968", flag: "🇴🇲" },
  { name: "Pakistan", code: "+92", flag: "🇵🇰" },
  { name: "Panama", code: "+507", flag: "🇵🇦" },
  { name: "Papua New Guinea", code: "+675", flag: "🇵🇬" },
  { name: "Paraguay", code: "+595", flag: "🇵🇾" },
  { name: "Peru", code: "+51", flag: "🇵🇪" },
  { name: "Philippines", code: "+63", flag: "🇵🇭" },
  { name: "Poland", code: "+48", flag: "🇵🇱" },
  { name: "Portugal", code: "+351", flag: "🇵🇹" },
  { name: "Qatar", code: "+974", flag: "🇶🇦" },
  { name: "Romania", code: "+40", flag: "🇷🇴" },
  { name: "Rwanda", code: "+250", flag: "🇷🇼" },
  { name: "Samoa", code: "+685", flag: "🇼🇸" },
  { name: "San Marino", code: "+378", flag: "🇸🇲" },
  { name: "Sao Tome", code: "+239", flag: "🇸🇹" },
  { name: "Saudi Arabia", code: "+966", flag: "🇸🇦" },
  { name: "Senegal", code: "+221", flag: "🇸🇳" },
  { name: "Serbia", code: "+381", flag: "🇷🇸" },
  { name: "Seychelles", code: "+248", flag: "🇸🇨" },
  { name: "Sierra Leone", code: "+232", flag: "🇸🇱" },
  { name: "Singapore", code: "+65", flag: "🇸🇬" },
  { name: "Slovakia", code: "+421", flag: "🇸🇰" },
  { name: "Slovenia", code: "+386", flag: "🇸🇮" },
  { name: "Solomon Islands", code: "+677", flag: "🇸🇧" },
  { name: "South Africa", code: "+27", flag: "🇿🇦" },
  { name: "Spain", code: "+34", flag: "🇪🇸" },
  { name: "Sri Lanka", code: "+94", flag: "🇱🇰" },
  { name: "Sudan", code: "+249", flag: "🇸🇩" },
  { name: "Suriname", code: "+597", flag: "🇸🇷" },
  { name: "Swaziland", code: "+268", flag: "🇸🇿" },
  { name: "Sweden", code: "+46", flag: "🇸🇪" },
  { name: "Switzerland", code: "+41", flag: "🇨🇭" },
  { name: "Syria", code: "+963", flag: "🇸🇾" },
  { name: "Taiwan", code: "+886", flag: "🇹🇼" },
  { name: "Tajikistan", code: "+992", flag: "🇹🇯" },
  { name: "Tanzania", code: "+255", flag: "🇹🇿" },
  { name: "Thailand", code: "+66", flag: "🇹🇭" },
  { name: "Togo", code: "+228", flag: "🇹🇬" },
  { name: "Tonga", code: "+676", flag: "🇹🇴" },
  { name: "Trinidad and Tobago", code: "+1-868", flag: "🇹🇹" },
  { name: "Tunisia", code: "+216", flag: "🇹🇳" },
  { name: "Turkey", code: "+90", flag: "🇹🇷" },
  { name: "Turkmenistan", code: "+993", flag: "🇹🇲" },
  { name: "Uganda", code: "+256", flag: "🇺🇬" },
  { name: "Ukraine", code: "+380", flag: "🇺🇦" },
  { name: "United Arab Emirates", code: "+971", flag: "🇦🇪" },
  { name: "United Kingdom", code: "+44", flag: "🇬🇧" },
  { name: "United States", code: "+1", flag: "🇺🇸" },
  { name: "Uruguay", code: "+598", flag: "🇺🇾" },
  { name: "Uzbekistan", code: "+998", flag: "🇺🇿" },
  { name: "Vanuatu", code: "+678", flag: "🇻🇺" },
  { name: "Vietnam", code: "+84", flag: "🇻🇳" },
  { name: "Zambia", code: "+260", flag: "🇿🇲" },
  { name: "Zimbabwe", code: "+263", flag: "🇿🇼" }
];

interface AccountSetupFlowProps {
  activeAccount: AccountData;
  onComplete: () => void;
  onClose?: () => void;
}

type FlowStep = "kyc" | "kyb" | "pending" | "provisioning" | "success";

export const AccountSetupFlow = ({ activeAccount, onComplete, onClose }: AccountSetupFlowProps) => {
  const [currentView, setCurrentView] = useState<FlowStep>(() => {
    if (activeAccount?.kycStatus === 'pending') return 'pending';
    if (activeAccount?.isReady || activeAccount?.kycStatus === 'approved') return 'success';
    return 'kyc';
  });
  
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [formData, setFormData] = useState({
    fullName: activeAccount?.name || "",
    businessName: activeAccount?.businessName || "",
    registrationNumber: "",
    country: "Nigeria", // Default to Nigeria
    bvn: "",
    nin: "",
    documentUrl: "" 
  });

  const isBusiness = activeAccount?.type?.toLowerCase() === "business";

  // 🌟 ADDED: Custom Country Dropdown State
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchTerm, setCountrySearchTerm] = useState("");

  // =========================================================================
  // 🌟 THE MAGIC POLLER: SECURE ENTERPRISE VERSION
  // =========================================================================
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (currentView === "pending" && activeAccount?.id) {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/users/${activeAccount.id}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
          });

          if (res.ok) {
            const me = await res.json();
            
            if (me.kycStatus === "approved" || me.isReady) {
              setCurrentView("provisioning");
              setTimeout(() => setCurrentView("success"), 4500);
            } else if (me.kycStatus === "rejected") {
              setCurrentView("kyc");
              setErrorMessage("Your application was rejected by compliance. Please upload clearer documents.");
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 5000); 
    }

    return () => clearInterval(pollInterval);
  }, [currentView, activeAccount?.id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeAccount?.walletAddress || activeAccount?.muxedAddress || activeAccount?.muxedId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrorMessage(""); 
  };

  // =========================================================================
  // 🌟 PRODUCTION CLOUDINARY UPLOAD
  // =========================================================================
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File is too large. Maximum size is 10MB.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const sigRes = await fetch(`${API_BASE}/upload/cloudinary-signature`, { 
        method: "POST",
        credentials: "include" 
      });
      
      if (!sigRes.ok) throw new Error("Failed to secure upload link");
      
      const { timestamp, signature, cloudName, apiKey } = await sigRes.json();

      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("api_key", apiKey);
      uploadData.append("timestamp", timestamp.toString());
      uploadData.append("signature", signature);
      uploadData.append("folder", "bingtellar_kyc_docs");
      uploadData.append("type", "authenticated");

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: uploadData,
      });

      const responseData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(responseData.error?.message || "Cloud upload failed");

      setFormData(prev => ({ ...prev, documentUrl: responseData.secure_url }));

    } catch (error: any) {
      console.error("Upload Error:", error);
      setErrorMessage("Failed to securely upload document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitVerificationToBackend = async (payload: any) => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE}/users/${activeAccount.id}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit verification");
      }

      setCurrentView("pending");

    } catch (error: any) {
      console.error("Verification Error:", error);
      setErrorMessage(error.message || "A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKycSubmit = () => {
    if (isBusiness) {
      setCurrentView("kyb"); 
    } else {
      if (formData.country === "Nigeria" && (!formData.bvn && !formData.nin)) {
        setErrorMessage("Please provide either your BVN or NIN for Nigerian verification.");
        return;
      }
      
      submitVerificationToBackend({
        businessName: formData.fullName, 
        country: formData.country,
        bvn: formData.bvn,
        nin: formData.nin,
        documentUrl: formData.documentUrl
      });
    }
  };

  const handleKybSubmit = () => {
    if (!formData.businessName || !formData.registrationNumber) {
      setErrorMessage("Please fill in all required business details.");
      return;
    }

    submitVerificationToBackend({
      businessName: formData.businessName,
      registrationNumber: formData.registrationNumber,
      country: formData.country,
      documentUrl: formData.documentUrl
    });
  };

  const renderContent = () => {
    // =========================================================================
    // 🌟 STEP 1: INDIVIDUAL KYC
    // =========================================================================
    if (currentView === "kyc") {
      return (
        <>
          <div className="px-6 sm:px-10 pt-24 sm:pt-10 pb-6 sm:pb-8 flex justify-between items-center border-b border-[#F0F0EF] shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center border border-amber-100 shadow-sm">
                  <User size={16} className="text-amber-500" />
                </div>
                <h1 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">Personal Information</h1>
              </div>
              <p className="text-[13px] sm:text-[14px] text-[#757575] max-w-sm leading-relaxed">
                To comply with global financial regulations, please verify your personal identity.
              </p>
            </div>
            <div className="hidden sm:block text-[14px] font-bold text-[#A3A3A3] bg-[#F5F4F0] px-4 py-2 rounded-full border border-[#E8E7E1]">
              Step <span className="text-black">1</span> / {isBusiness ? "2" : "1"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 custom-scrollbar">
            <div className="space-y-8">
              
              {errorMessage && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-[13px] font-medium flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} /> {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                    <User size={15} className="text-[#A3A3A3]" /> Full Name
                  </label>
                  <input 
                    type="text" 
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] outline-none focus:border-black focus:bg-white transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 block">Account Alias</label>
                  <input 
                    type="text" 
                    defaultValue={activeAccount?.businessName || activeAccount?.alias || ""}
                    readOnly
                    className="w-full bg-[#F5F4F0] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] text-gray-500 outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              {/* 🌟 THE FIX: Custom Searchable Dropdown for KYC */}
              <div className="relative z-40">
                <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                  <MapPin size={15} className="text-[#A3A3A3]" /> Country of Residency
                </label>
                
                <div 
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] cursor-pointer flex items-center justify-between shadow-inner transition-colors focus-within:border-black"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[16px] leading-none">
                      {COUNTRY_DATA.find(c => c.name === formData.country)?.flag || "🇳🇬"}
                    </span>
                    <span className="text-[#1A1A1A] font-medium">{formData.country}</span>
                  </div>
                  <ChevronDown 
                    size={16} 
                    className={`text-gray-400 transition-transform duration-200 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} 
                  />
                </div>

                {isCountryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsCountryDropdownOpen(false)} />
                    <div className="absolute top-[100%] left-0 right-0 mt-2 bg-white border border-[#E8E8E8] rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      
                      <div className="p-2 border-b border-[#E8E8E8] bg-[#F9F9F9]">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text" 
                            autoFocus
                            placeholder="Search country..." 
                            value={countrySearchTerm}
                            onChange={(e) => setCountrySearchTerm(e.target.value)}
                            className="w-full bg-white border border-[#E8E8E8] rounded-lg py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-black transition-colors"
                          />
                        </div>
                      </div>
                      
                      <div className="max-h-[220px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                        {COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).length > 0 ? (
                          COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).map(country => (
                            <div 
                              key={country.name}
                              onClick={() => {
                                handleInputChange("country", country.name);
                                setIsCountryDropdownOpen(false);
                                setCountrySearchTerm(""); 
                              }}
                              className={`flex items-center gap-3 px-3 py-2.5 hover:bg-[#F5F5F4] rounded-lg cursor-pointer transition-colors ${formData.country === country.name ? 'bg-[#F9F9F9]' : ''}`}
                            >
                              <span className="text-[18px] leading-none">{country.flag}</span>
                              <span className={`text-[13px] ${formData.country === country.name ? 'font-bold text-black' : 'text-[#1A1A1A]'}`}>
                                {country.name}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-[12px] text-gray-500 italic">
                            No country found matching "{countrySearchTerm}"
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {formData.country === "Nigeria" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in slide-in-from-top-2 fade-in duration-300 relative z-30">
                  <div>
                    <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                      <CreditCard size={15} className="text-[#A3A3A3]" /> BVN
                    </label>
                    <input 
                      type="text" 
                      value={formData.bvn}
                      onChange={(e) => handleInputChange("bvn", e.target.value.replace(/\D/g, ''))}
                      placeholder="11-digit BVN"
                      maxLength={11}
                      className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] outline-none focus:border-black focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                      <CreditCard size={15} className="text-[#A3A3A3]" /> NIN
                    </label>
                    <input 
                      type="text" 
                      value={formData.nin}
                      onChange={(e) => handleInputChange("nin", e.target.value.replace(/\D/g, ''))}
                      placeholder="11-digit NIN"
                      maxLength={11}
                      className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] outline-none focus:border-black focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>
              )}

              <div className="relative z-30">
                <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                  <FileText size={15} className="text-[#A3A3A3]" /> Government ID Upload
                </label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/jpeg, image/png, application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isSubmitting}
                  />
                  <div 
                    className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all group shadow-inner ${
                      formData.documentUrl 
                        ? 'bg-green-50 border-green-200' 
                        : isSubmitting 
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-[#FAFAFA] border-[#E8E7E1] group-hover:bg-white group-hover:border-[#D1D1D1]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={24} className="mx-auto text-blue-500 mb-3 animate-spin" />
                        <p className="text-[13px] font-bold text-blue-700">Uploading Document...</p>
                      </>
                    ) : formData.documentUrl ? (
                      <>
                        <CheckCircle2 size={24} className="mx-auto text-green-500 mb-3" />
                        <p className="text-[13px] font-bold text-green-700">Document Uploaded Successfully</p>
                      </>
                    ) : (
                      <>
                        <FileText size={24} className="mx-auto text-gray-400 group-hover:text-[#3B82F6] mb-3 transition-colors" />
                        <p className="text-[13px] font-bold text-[#3B82F6]">Click to upload document</p>
                        <p className="text-[12px] text-[#A3A3A3] mt-1.5">PDF, JPG, or PNG</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-6 border-t border-[#F0F0EF] bg-white mt-auto shrink-0 flex gap-4 relative z-50">
            <button 
              onClick={handleKycSubmit} 
              disabled={isSubmitting}
              className="flex-1 bg-black text-white h-12 sm:h-13 rounded-xl font-bold text-[14px] flex items-center justify-center shadow-lg hover:bg-gray-800 transition-all disabled:opacity-70 disabled:cursor-not-allowed gap-2"
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : (
                <>{isBusiness ? "Continue to Business Details" : "Submit Verification"} <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        </>
      );
    }

    // =========================================================================
    // 🌟 STEP 2: BUSINESS KYB
    // =========================================================================
    if (currentView === "kyb") {
      return (
        <div className="animate-in slide-in-from-right-8 fade-in duration-500 h-full flex flex-col">
          <div className="px-6 sm:px-10 pt-24 sm:pt-10 pb-6 sm:pb-8 flex justify-between items-center border-b border-[#F0F0EF] shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100 shadow-sm">
                  <Building2 size={16} className="text-blue-500" />
                </div>
                <h1 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">Business Information</h1>
              </div>
              <p className="text-[13px] sm:text-[14px] text-[#757575] max-w-lg leading-relaxed">
                Provide your company's registration details to unlock enterprise settlement limits.
              </p>
            </div>
            <div className="hidden sm:block text-[14px] font-bold text-[#A3A3A3] bg-[#F5F4F0] px-4 py-2 rounded-full border border-[#E8E7E1]">
              Step <span className="text-black">2</span> / 2
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 custom-scrollbar">
            <div className="space-y-8">
              
              {errorMessage && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-[13px] font-medium flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} /> {errorMessage}
                </div>
              )}

              <div>
                <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                  <Building2 size={15} className="text-[#A3A3A3]" /> Legal Business Name
                </label>
                <input 
                  type="text" 
                  value={formData.businessName}
                  onChange={(e) => handleInputChange("businessName", e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] outline-none focus:border-black focus:bg-white transition-all shadow-inner"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 block">Registration Number</label>
                  <input 
                    type="text" 
                    value={formData.registrationNumber}
                    onChange={(e) => handleInputChange("registrationNumber", e.target.value)}
                    placeholder="e.g. RC-123456"
                    className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] outline-none focus:border-black focus:bg-white transition-all shadow-inner"
                  />
                </div>
                
                {/* 🌟 THE FIX: Custom Searchable Dropdown for KYB */}
                <div className="relative z-40">
                  <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 block">Country of Incorporation</label>
                  
                  <div 
                    onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                    className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-3.5 text-[14px] cursor-pointer flex items-center justify-between shadow-inner transition-colors focus-within:border-black"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[16px] leading-none">
                        {COUNTRY_DATA.find(c => c.name === formData.country)?.flag || "🇳🇬"}
                      </span>
                      <span className="text-[#1A1A1A] font-medium">{formData.country}</span>
                    </div>
                    <ChevronDown 
                      size={16} 
                      className={`text-gray-400 transition-transform duration-200 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} 
                    />
                  </div>

                  {isCountryDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsCountryDropdownOpen(false)} />
                      <div className="absolute top-[100%] left-0 right-0 mt-2 bg-white border border-[#E8E8E8] rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                        
                        <div className="p-2 border-b border-[#E8E8E8] bg-[#F9F9F9]">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                              type="text" 
                              autoFocus
                              placeholder="Search country..." 
                              value={countrySearchTerm}
                              onChange={(e) => setCountrySearchTerm(e.target.value)}
                              className="w-full bg-white border border-[#E8E8E8] rounded-lg py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-black transition-colors"
                            />
                          </div>
                        </div>
                        
                        <div className="max-h-[220px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                          {COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).length > 0 ? (
                            COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).map(country => (
                              <div 
                                key={country.name}
                                onClick={() => {
                                  handleInputChange("country", country.name);
                                  setIsCountryDropdownOpen(false);
                                  setCountrySearchTerm(""); 
                                }}
                                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-[#F5F5F4] rounded-lg cursor-pointer transition-colors ${formData.country === country.name ? 'bg-[#F9F9F9]' : ''}`}
                              >
                                <span className="text-[18px] leading-none">{country.flag}</span>
                                <span className={`text-[13px] ${formData.country === country.name ? 'font-bold text-black' : 'text-[#1A1A1A]'}`}>
                                  {country.name}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-[12px] text-gray-500 italic">
                              No country found matching "{countrySearchTerm}"
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="relative z-30">
                <label className="text-[13px] font-bold text-[#1A1A1A] mb-2.5 flex items-center gap-2">
                  <FileText size={15} className="text-[#A3A3A3]" /> Corporate Document
                </label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/jpeg, image/png, application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isSubmitting}
                  />
                  <div 
                    className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all group shadow-inner ${
                      formData.documentUrl 
                        ? 'bg-blue-50 border-blue-200' 
                        : isSubmitting 
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-[#FAFAFA] border-[#E8E7E1] group-hover:bg-white group-hover:border-[#D1D1D1]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={24} className="mx-auto text-blue-500 mb-3 animate-spin" />
                        <p className="text-[13px] font-bold text-blue-700">Uploading Certificate...</p>
                      </>
                    ) : formData.documentUrl ? (
                      <>
                        <CheckCircle2 size={24} className="mx-auto text-blue-500 mb-3" />
                        <p className="text-[13px] font-bold text-blue-700">Certificate Uploaded Successfully</p>
                      </>
                    ) : (
                      <>
                        <FileText size={24} className="mx-auto text-gray-400 group-hover:text-[#3B82F6] mb-3 transition-colors" />
                        <p className="text-[13px] font-bold text-[#3B82F6]">Click to upload Certificate</p>
                        <p className="text-[12px] text-[#A3A3A3] mt-1.5">CAC, MemArt, or Tax Certificate</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-6 border-t border-[#F0F0EF] bg-white mt-auto shrink-0 flex gap-4 relative z-50">
            <button 
              onClick={() => setCurrentView("kyc")} 
              disabled={isSubmitting}
              className="px-6 bg-white text-[#1A1A1A] border border-[#E8E7E1] h-12 sm:h-13 rounded-xl font-bold text-[14px] hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              Back
            </button>
            <button 
              onClick={handleKybSubmit} 
              disabled={isSubmitting}
              className="flex-1 sm:flex-none sm:px-12 bg-black text-white h-12 sm:h-13 rounded-xl font-bold text-[14px] flex items-center justify-center shadow-lg hover:bg-gray-800 transition-all sm:ml-auto gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : (
                <>Submit Verification <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      );
    }

    // =========================================================================
    // 🌟 STEP 3: PENDING REVIEW
    // =========================================================================
    if (currentView === "pending") {
      return (
        <div className="animate-in fade-in duration-500 h-full flex flex-col">
          <div className="px-6 sm:px-10 pt-24 sm:pt-10 pb-6 sm:pb-8 border-b border-[#F0F0EF] shrink-0 flex items-center gap-4">
             <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center border border-amber-200 shadow-sm shrink-0">
                <Clock size={20} className="text-amber-500" />
             </div>
             <div>
               <h1 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">Application Under Review</h1>
               <p className="text-[13px] sm:text-[14px] text-[#757575] max-w-sm mt-0.5">Your documents are being securely verified.</p>
             </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-[#FAFAFA] overflow-y-auto">
            <div className="bg-white border border-[#EAEAEA] p-8 rounded-2xl shadow-sm max-w-sm w-full relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-[shimmer_2s_infinite]"></div>
               
               <FileText size={48} className="text-gray-300 mx-auto mb-6" />
               <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-2">Compliance Review</h3>
               <p className="text-[13px] text-[#757575] leading-relaxed mb-6">
                 Your identity and business details have been transmitted to our compliance team. Verification typically takes 1-2 hours.
               </p>
               <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-amber-600 bg-amber-50 py-2 px-4 rounded-lg">
                 <Loader2 size={14} className="animate-spin" /> Verification processing
               </div>
            </div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // 🌟 STEP 4: PROVISIONING / LOADING
    // =========================================================================
    if (currentView === "provisioning") {
      return (
        <div className="animate-in fade-in duration-500 h-full flex flex-col">
          <div className="px-6 sm:px-10 pt-24 sm:pt-10 pb-6 sm:pb-8 border-b border-[#F0F0EF] shrink-0">
             <h1 className="text-[18px] sm:text-[20px] font-bold text-[#1A1A1A]">Verification Complete</h1>
             <p className="text-[13px] sm:text-[14px] text-[#757575] max-w-sm mt-1">Please wait while we secure your account.</p>
          </div>

          <div className="flex-1 flex flex-col justify-center p-6 sm:p-10 bg-[#FAFAFA] overflow-y-auto">
            <div className="space-y-2 text-center">
              <h2 className="text-[20px] sm:text-[22px] font-bold text-[#1A1A1A]">Setting up your secure vaults...</h2>
              <p className="text-[13px] sm:text-[14px] text-[#757575] max-w-sm mx-auto leading-relaxed">
                This usually takes a few seconds. We're funding your gas reserves and establishing your USDC trustline on the Stellar blockchain.
              </p>
            </div>

            <div className="w-full max-w-sm mx-auto space-y-3 mt-8 sm:mt-10 text-left">
              {[
                { label: "Identity Verified", icon: CheckCircle2, status: "done" },
                { label: "Funding Network Gas (XLM)", icon: Loader2, status: "loading" },
                { label: "Establishing USDC Trustline", icon: null, status: "pending" }
              ].map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3.5 p-3.5 sm:p-4 border rounded-xl shadow-sm transition-opacity ${item.status === 'done' ? 'bg-white border-green-100' : item.status === 'loading' ? 'bg-white border-[#D1D1D1]' : 'bg-[#FAFAFA] border-[#E8E7E1] opacity-60'}`}>
                  {item.status === 'done' ? (
                    <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                  ) : item.status === 'loading' ? (
                    <Loader2 size={18} className="animate-spin text-[#1A1A1A] shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                  )}
                  <span className={`text-[12px] sm:text-[13px] font-bold ${item.status === 'pending' ? 'text-[#8B8B8B]' : 'text-[#1A1A1A]'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // 🌟 STEP 5: SUCCESS
    // =========================================================================
    return (
      <div className="animate-in zoom-in-95 duration-500 h-full flex flex-col">
        <div className="px-6 sm:px-10 pt-24 sm:pt-10 pb-6 sm:pb-8 flex justify-between items-center border-b border-[#F0F0EF] bg-green-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center border border-green-200 shadow-sm">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <h1 className="text-[18px] sm:text-[20px] font-bold text-green-700">Account Activated</h1>
            </div>
            <p className="text-[13px] sm:text-[14px] text-green-700/80 max-w-sm leading-relaxed">
              Your {isBusiness ? "business" : "identity"} is verified. Your gas reserves are funded and your USDC Vault is ready.
            </p>
          </div>
           <div className="hidden sm:block text-[14px] font-bold text-green-700 bg-white px-4 py-2 rounded-full border border-green-200">
              Complete ✅
            </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 sm:py-10 custom-scrollbar">
          <div className="space-y-8 sm:space-y-10">
            <h3 className="text-[16px] sm:text-[18px] font-bold text-[#1A1A1A]">Your Onchain Vault Details</h3>
            
            <div className="space-y-8">
              <div>
                <label className="text-[11px] sm:text-[12px] font-bold text-[#A3A3A3] uppercase mb-2.5 block tracking-wider">Deposit Network</label>
                <div className="bg-[#FAFAFA] border border-[#E8E7E1] p-4 rounded-xl flex items-center gap-3.5 text-[14px] sm:text-[15px] font-bold shadow-inner">
                  <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center text-white text-[11px] font-mono">S</div>
                  Stellar (USDC)
                </div>
              </div>
              
              <div>
                <label className="text-[11px] sm:text-[12px] font-bold text-[#A3A3A3] uppercase mb-2.5 flex items-center justify-between tracking-wider">
                  <span>Virtual Deposit Address</span>
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase text-[10px] font-bold">Active</span>
                </label>
                <div className="bg-[#FAFAFA] border border-[#E8E7E1] p-4 rounded-xl flex justify-between items-center group shadow-inner">
                  <span className="text-[12px] sm:text-[13px] font-mono text-[#1A1A1A] truncate mr-4 sm:mr-5 font-medium tracking-tight select-all">
                    {activeAccount?.walletAddress || activeAccount?.muxedAddress || activeAccount?.muxedId || "Loading Address..."}
                  </span>
                  <button 
                    onClick={handleCopy} 
                    className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-colors shrink-0 border border-[#E8E7E1] shadow-sm"
                  >
                    {copied ? <CheckCircle2 size={15} className="text-green-600" /> : <Copy size={15} />}
                  </button>
                </div>
                <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 flex items-start gap-2.5">
                  <span className="text-[16px] sm:text-[18px]">⚠️</span>
                  <div>
                     <p className="text-[12px] sm:text-[13px] font-bold">Important</p>
                     <p className="text-[11px] sm:text-[12px] mt-0.5">Send only Stellar USDC (not XLM or USDC from other networks) to this address. Funds sent otherwise may be lost.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-10 py-6 border-t border-[#F0F0EF] bg-white mt-auto shrink-0">
          <button 
            onClick={onComplete} 
            className="w-full bg-black text-white h-12 sm:h-14 rounded-xl font-bold text-[14px] shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
          >
            Access My Dashboard <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-start pt-0 sm:pt-20 relative bg-[#F5F4F0]">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
      
      <div className="absolute top-0 left-0 w-full px-6 py-6 sm:px-10 sm:py-8 flex justify-between items-center z-50 pointer-events-none">
        <div className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#1A1A1A] pointer-events-auto">
          Blink <span className="text-blue-600 text-[18px] sm:text-[20px] font-medium ml-1">Setup</span>
        </div>
        {onClose && (currentView === "kyc" || currentView === "kyb" || currentView === "pending") && (
          <button 
            onClick={onClose} 
            className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors pointer-events-auto shadow-sm"
          >
            <X size={20} className="text-[#1A1A1A]" strokeWidth={1.5} />
          </button>
        )}
      </div>
      
      <div className="w-full max-w-[600px] h-[100dvh] sm:h-[85vh] sm:max-h-[750px] bg-white sm:border border-[#E8E7E1] sm:rounded-[24px] flex flex-col relative overflow-hidden z-10 animate-in slide-in-from-bottom-4 duration-500">
        {renderContent()}
      </div>
      
    </div>
  );
};
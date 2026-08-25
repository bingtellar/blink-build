import { useState, useEffect } from "react";
import { 
  ShieldCheck, Plus, AlertCircle, FileEdit, X, ChevronDown, CheckCircle2, Loader2, ArrowLeft, Search, Check // 🌟 ADDED Check
} from "lucide-react";
import { useStore } from "../../store/useStore";
import { AccountSetupFlow } from "./AccountSetupFlow"; 
import { api } from "../../lib/api";

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

export const UserProfile = ({ onLogout }: { onLogout?: () => void }) => {
  const activeAccount = useStore((state) => state.activeAccount) as any;
  const setActiveAccount = useStore((state) => state.setActiveAccount) as any;
  const accounts = useStore((state) => state.accounts) as any[];
  const setAccounts = useStore((state) => state.setAccounts) as any;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showKYCFlow, setShowKYCFlow] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [liveKycStatus, setLiveKycStatus] = useState<string | null>(activeAccount?.kycStatus || null);
  const [liveIsReady, setLiveIsReady] = useState<boolean | string | number>(activeAccount?.isReady || false);

  // 🌟 FIX: Explicitly tell TypeScript about the 'services' array
  const [formData, setFormData] = useState<{
    firstName: string; lastName: string; dob: string; country: string; dialCode: string; phone: string; services: string[];
  }>({
    firstName: "", lastName: "", dob: "", country: "Nigeria", dialCode: "+234", phone: "", services: []
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Custom Country Dropdown State
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchTerm, setCountrySearchTerm] = useState("");


  // 🌟 ADDED: Custom Services Dropdown State
  const [isServicesDropdownOpen, setIsServicesDropdownOpen] = useState(false);

  // =====================================================================
  // 🛡️ SECURE LIVE DB SYNC & AUTO-HEALING
  // =====================================================================
  useEffect(() => {
    const fetchLiveProfile = async () => {
      if (!activeAccount?.id) return;
      try {
        const response = await api.get(`/users/${activeAccount.id}`);
        const liveMe = response.data.user || response.data; 
        
        // 🌟 THE FIX: Auto-heal the activeAccount with data that MainDashboard dropped (like Email)
        const healedAccount = {
          ...activeAccount,
          ...liveMe,
          name: liveMe.name || `${liveMe.firstName || ''} ${liveMe.lastName || ''}`.trim() || activeAccount.name
        };

        setLiveKycStatus(healedAccount.kycStatus);
        setLiveIsReady(healedAccount.isReady);
        
        // Push healed data to global state
        setActiveAccount(healedAccount);

        // 🌟 CRITICAL: Sync the healed data back to localStorage to prevent data loss on refresh
        const storedStr = localStorage.getItem("bingtellar_user");
        if (storedStr) {
           const storedUser = JSON.parse(storedStr);
           localStorage.setItem("bingtellar_user", JSON.stringify({ ...storedUser, ...healedAccount }));
        }

      } catch (err) {
        console.error("Failed to sync live profile status:", err);
      }
    };

    fetchLiveProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  const isVerified = 
    liveIsReady === true || liveIsReady === "true" || liveIsReady === 1 || 
    liveKycStatus?.toLowerCase() === 'approved';

  const isPendingKYC = liveKycStatus?.toLowerCase() === 'pending';

  // =====================================================================
  // 🌟 EDIT MODAL HYDRATION FIX
  // =====================================================================
  useEffect(() => {
    if (activeAccount && isEditModalOpen) {
      // Prioritize backend fields over split name strings
      const fName = activeAccount.firstName || (activeAccount.name || "").split(" ")[0] || "";
      const lName = activeAccount.lastName || (activeAccount.name || "").split(" ").slice(1).join(" ") || "";

      // Smart extraction of existing country and phone
      const currentCountry = activeAccount.country || "Nigeria";
      const matchedData = COUNTRY_DATA.find(c => c.name === currentCountry) || COUNTRY_DATA[0];
      
      let rawPhone = activeAccount.phone || "";
      // Strip dial code from input if it was saved concatenated
      if (rawPhone.startsWith(matchedData.code)) {
         rawPhone = rawPhone.slice(matchedData.code.length);
      }



      setFormData({
        firstName: fName, 
        lastName: lName, 
        dob: activeAccount.dob || "", 
        country: currentCountry,      
        dialCode: matchedData.code, 
        phone: rawPhone,
        services: activeAccount.services || [] // 🌟 ADDED: Hydrate services
      });
    }
  }, [activeAccount, isEditModalOpen]);

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setErrors({});
  };

/*
  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCountry = e.target.value;
    const matchedData = COUNTRY_DATA.find(c => c.name === selectedCountry);
    setFormData({
      ...formData, country: selectedCountry, dialCode: matchedData?.code || ""
    });
    if (errors.country) setErrors(prev => ({ ...prev, country: "" }));
  };
*/


  // =====================================================================
  // 🌟 PRODUCTION READY SAVE HANDLER
  // =====================================================================
  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    if (!activeAccount?.id) return;

    setIsSaving(true);
    setErrors({});

    try {
      // Securely concatenate dial code + phone (dropping leading zero if user typed it)
      let finalPhone = "";
      if (formData.phone) {
         finalPhone = `${formData.dialCode}${formData.phone.replace(/^0/, '')}`;
      }

      const response = await api.put(`/users/${activeAccount.id}/profile`, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        dob: formData.dob,
        country: formData.country,
        phone: finalPhone,
        services: formData.services // 🌟 ADDED: Send to backend
      });

      const backendUser = response.data.user || response.data;
      const updatedName = `${formData.firstName} ${formData.lastName}`.trim();

      // Merge all state perfectly
      const updatedAccount = { 
        ...activeAccount, 
        ...backendUser, 
        name: updatedName, 
        firstName: formData.firstName,
        lastName: formData.lastName,
        country: formData.country, 
        phone: finalPhone, 
        dob: formData.dob,
        services: formData.services // 🌟 ADDED: Update global state
      };
      
      const updatedAccounts = accounts.map((acc: any) => 
        acc.id === activeAccount.id ? updatedAccount : acc
      );
      
      // 1. Update Global State
      setActiveAccount(updatedAccount);
      setAccounts(updatedAccounts);

      // 2. 🌟 CRITICAL FIX: Persist to localStorage so changes survive page refreshes!
      const storedStr = localStorage.getItem("bingtellar_user");
      const baseStored = storedStr ? JSON.parse(storedStr) : {};
      localStorage.setItem("bingtellar_user", JSON.stringify({ ...baseStored, ...updatedAccount }));

      handleCloseModal();
    } catch (error: any) {
      console.error("Save error:", error);
      const backendError = error.response?.data?.error || "Failed to update profile. Please try again.";
      setErrors({ form: backendError });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="w-full h-full bg-white flex flex-col pt-4 animate-in fade-in duration-300">
        <div className="max-w-[680px] w-full mx-auto md:mx-0">
          
          <div className="mb-8">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Profile</h1>
          </div>

          <div className="bg-[#F9F9F9] border border-[#F0F0EF] rounded-[16px] p-6 mb-8 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="shrink-0 flex items-center justify-center">
                <svg width="49" height="48" viewBox="0 0 49 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <ellipse cx="24.5" cy="24" rx="24.5" ry="24" fill="url(#paint0_linear_6308_4143)"/>
                  <defs>
                    <linearGradient id="paint0_linear_6308_4143" x1="24.5" y1="0" x2="24.5" y2="48" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FF5323"/>
                      <stop offset="0.5" stopColor="#FF7512"/>
                      <stop offset="1" stopColor="#FE8F05"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div>
                <h2 className="text-[15px] font-bold text-[#1A1A1A] capitalize">{activeAccount?.name || "Account Name"}</h2>
                <p className="text-[13px] text-[#757575] mt-0.5">{activeAccount?.email || "No email linked"}</p>
                
                {/* 🌟 ADDED: Display selected services as tags */}
                {activeAccount?.services && activeAccount.services.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {activeAccount.services.map((s: string) => (
                      <span key={s} className="bg-white border border-[#E8E8E8] text-[#757575] px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase shadow-sm">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E8E8E8] rounded-md text-[11px] font-semibold text-[#1A1A1A] hover:bg-white transition-colors shadow-sm"
            >
              <FileEdit size={12} />
              Edit
            </button>
          </div>

          {/* 🌟 IDENTITY DOCUMENTS SECTION */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Identity Documents</h3>
            </div>
            
            {isVerified ? (
              <div className="bg-[#FFFFFF] border border-[#E2E2E2] rounded-[12px] p-4 flex items-center gap-3 shadow-sm animate-in fade-in">
                <div className="w-8 h-8 bg-[#34A853] rounded-md flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 size={18} className="text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Account Verified and Ready</span>
                  <span className="text-[12px] text-[#34A853] font-medium mt-0.5">You have full access to all features.</span>
                </div>
              </div>
            ) : isPendingKYC ? (
              <div className="bg-[#FFF9F2] border border-[#FDE68A] rounded-[12px] p-4 flex items-center gap-3 shadow-sm animate-in fade-in">
                <div className="w-8 h-8 bg-[#D97706] rounded-md flex items-center justify-center shrink-0 shadow-sm">
                  <Loader2 size={16} className="text-white animate-spin" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#D97706]">Verification under review</span>
                  <span className="text-[12px] text-[#D97706]/80 mt-0.5">Your documents are pending admin approval.</span>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => setShowKYCFlow(true)}
                className="bg-white border border-[#F0F0EF] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm cursor-pointer hover:border-[#D1D1D1] hover:bg-[#FAFAFA] transition-all group animate-in fade-in"
              >
                <div className="w-8 h-8 bg-[#1A1A1A] rounded-md flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Plus size={16} className="text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#1A1A1A] group-hover:text-[#2775CA] transition-colors">
                    Verify your account to unlock full access
                  </span>
                  <span className="text-[12px] text-[#757575] mt-0.5">
                    Add documents to increase limits and send payments.
                  </span>
                </div>
                <div className="hidden sm:block ml-auto text-[12px] font-semibold text-[#2775CA] group-hover:underline underline-offset-2">
                  Start now &rarr;
                </div>
              </div>
            )}
          </div>

          <div className="mb-8">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-3">Legal</h3>
            <div className="bg-white border border-[#F0F0EF] rounded-[16px] overflow-hidden shadow-sm">
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors border-b border-[#F0F0EF]">
                <div className="w-7 h-7 flex items-center justify-center bg-[#F5F5F4] rounded-md shrink-0">
                  <ShieldCheck size={14} className="text-[#1A1A1A]" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Privacy</span>
              </button>
              <button className="w-full flex items-center gap-3 p-4 hover:bg-[#F9F9F9] transition-colors">
                <div className="w-7 h-7 flex items-center justify-center bg-[#F5F5F4] rounded-md shrink-0">
                  <AlertCircle size={14} className="text-[#1A1A1A]" />
                </div>
                <span className="text-[13px] font-medium text-[#1A1A1A]">Terms</span>
              </button>
            </div>
          </div>

          <div className="h-[1px] bg-[#F0F0EF] w-full mb-8" />

          <div>
            <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-1">Logout</h3>
            <p className="text-[12px] text-[#757575] mb-4">
              You will be logged out of your account and have to log back in
            </p>
            <button 
              onClick={onLogout}
              className="px-5 py-2 bg-white border border-[#E8E8E8] rounded-md text-[12px] font-semibold text-[#1A1A1A] hover:bg-[#FFF4F4] hover:text-[#FF4B4B] hover:border-[#FFE8E8] transition-all shadow-sm"
            >
              Logout
            </button>
          </div>

        </div>
      </div>

      {/* 🌟 ACCOUNT SETUP MODAL */}
      {showKYCFlow && (
        <div className="fixed inset-0 z-[9999] bg-[#F5F4EF] animate-in slide-in-from-bottom-4 duration-300 flex flex-col overflow-hidden">
          <div className="w-full h-[64px] bg-white px-6 flex items-center justify-between border-b border-[#E8E8E8] shrink-0 shadow-sm relative z-[10000]">
            <button 
              onClick={() => setShowKYCFlow(false)}
              className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A] hover:text-[#757575] transition-colors"
            >
              <ArrowLeft size={18} /> Back to Profile
            </button>
            <span className="text-[14px] font-semibold text-[#757575]">Account Verification</span>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full relative z-[9999] bg-[#F5F4EF]">
            <AccountSetupFlow 
              activeAccount={activeAccount} 
              onComplete={() => setShowKYCFlow(false)} 
              onClose={() => setShowKYCFlow(false)} 
            />
          </div>
        </div>
      )}

      {/* 🌟 EDIT PROFILE MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={handleCloseModal} 
          />
          
          <div className="relative w-full max-w-[480px] max-h-[85vh] m-auto bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            
            <div className="flex items-center justify-between p-6 sm:p-8 pb-4 shrink-0">
              <h2 className="text-[18px] font-bold text-[#1A1A1A]">Tell us about yourself</h2>
              <button 
                onClick={handleCloseModal} 
                className="w-8 h-8 bg-[#F5F5F4] hover:bg-[#E8E8E8] rounded-full flex items-center justify-center transition-colors text-[#757575]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-6 sm:px-8 pt-2 pb-4 overflow-y-auto flex-1 space-y-5">
              
              <div>
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 block">Email</label>
                <input 
                  type="email" 
                  value={activeAccount?.email || ""}
                  disabled
                  className="w-full border border-[#E8E8E8] bg-[#F9F9F9] text-[#A3A3A3] rounded-xl px-4 py-3 text-[13px] outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 block">Legal first name</label>
                <input 
                  type="text" 
                  placeholder="Enter first name"
                  value={formData.firstName}
                  onChange={(e) => {
                    setFormData({...formData, firstName: e.target.value});
                    if (errors.firstName) setErrors({...errors, firstName: ""});
                  }}
                  className={`w-full border ${errors.firstName ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl px-4 py-3 text-[13px] outline-none transition-colors`}
                />
                {errors.firstName && <p className="text-[11px] text-red-500 mt-1.5">{errors.firstName}</p>}
              </div>

              <div>
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 block">Legal last name</label>
                <input 
                  type="text" 
                  placeholder="Enter last name"
                  value={formData.lastName}
                  onChange={(e) => {
                    setFormData({...formData, lastName: e.target.value});
                    if (errors.lastName) setErrors({...errors, lastName: ""});
                  }}
                  className={`w-full border ${errors.lastName ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl px-4 py-3 text-[13px] outline-none transition-colors`}
                />
                {errors.lastName && <p className="text-[11px] text-red-500 mt-1.5">{errors.lastName}</p>}
              </div>

              <div>
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 flex items-center gap-1">
                  Date of birth <span className="text-[#A3A3A3] font-normal">(Optional)</span>
                </label>
                <input 
                  type="date" 
                  value={formData.dob}
                  onChange={(e) => {
                    setFormData({...formData, dob: e.target.value});
                    if (errors.dob) setErrors({...errors, dob: ""});
                  }}
                  className={`w-full border ${errors.dob ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl px-4 py-3 text-[13px] outline-none transition-colors text-[#1A1A1A] bg-white`}
                />
              </div>

              <div className="relative z-50">
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 block">Country of residence</label>
                
                {/* 🌟 CUSTOM TRIGGER BUTTON */}
                <div 
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  className="w-full border border-[#E8E8E8] rounded-xl pl-4 pr-4 py-3 text-[13px] focus:border-black transition-colors bg-white cursor-pointer flex items-center justify-between"
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

                {/* 🌟 DROPDOWN MENU & SEARCH */}
                {isCountryDropdownOpen && (
                  <>
                    {/* Invisible overlay to handle "click outside to close" natively without complex refs */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsCountryDropdownOpen(false)} 
                    />
                    
                    <div className="absolute top-[100%] left-0 right-0 mt-2 bg-white border border-[#E8E8E8] rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      
                      {/* Sticky Search Bar */}
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
                      
                      {/* Scrollable Country List */}
                      <div className="max-h-[220px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                        {COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).length > 0 ? (
                          COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).map(country => (
                            <div 
                              key={country.name}
                              onClick={() => {
                                setFormData({ ...formData, country: country.name, dialCode: country.code });
                                setIsCountryDropdownOpen(false);
                                setCountrySearchTerm(""); // Reset search on select
                                if (errors.country) setErrors(prev => ({ ...prev, country: "" }));
                              }}
                              className={`flex items-center gap-3 px-3 py-2.5 hover:bg-[#F5F5F4] rounded-lg cursor-pointer transition-colors ${formData.country === country.name ? 'bg-[#F9F9F9]' : ''}`}
                            >
                              <span className="text-[18px] leading-none">{country.flag}</span>
                              <span className={`text-[13px] ${formData.country === country.name ? 'font-bold text-black' : 'text-[#1A1A1A]'}`}>
                                {country.name}
                              </span>
                              <span className="text-[11px] font-semibold text-[#A3A3A3] ml-auto">
                                {country.code}
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

              <div>
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 flex items-center gap-1">
                  Phone number <span className="text-[#A3A3A3] font-normal">(Optional)</span>
                </label>
                <div className="flex gap-3">
                  <div className="w-[70px] border border-[#E8E8E8] bg-[#F9F9F9] rounded-xl flex items-center justify-center text-[13px] text-[#757575] font-semibold shrink-0 cursor-not-allowed">
                    {formData.dialCode}
                  </div>
                  <input 
                    type="tel" 
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={(e) => {
                      // Strip non-numeric characters for safety
                      setFormData({...formData, phone: e.target.value.replace(/\D/g, '')});
                      if (errors.phone) setErrors({...errors, phone: ""});
                    }}
                    className={`flex-1 border ${errors.phone ? 'border-red-400 focus:border-red-500' : 'border-[#E8E8E8] focus:border-black'} rounded-xl px-4 py-3 text-[13px] outline-none transition-colors`}
                  />
                </div>
              </div>


              {/* 🌟 ADDED: Services Multi-Select Field */}
              <div className="relative z-40">
                <label className="text-[12px] font-medium text-[#1A1A1A] mb-1.5 block">Services</label>
                <div
                  onClick={() => setIsServicesDropdownOpen(!isServicesDropdownOpen)}
                  className="min-h-[46px] w-full border border-[#E8E8E8] rounded-xl px-4 py-2 text-[13px] bg-white cursor-pointer flex flex-wrap gap-1.5 items-center pr-10 relative transition-colors focus-within:border-black"
                >
                  {formData.services.length === 0 ? (
                    <span className="text-[#A3A3A3]">Select services...</span>
                  ) : (
                    formData.services.map((s: string) => ( // 🌟 TYPED
                      <span
                        key={s}
                        className="bg-[#1A1A1A] text-white px-2 py-1 rounded-md text-[11px] flex items-center gap-1 font-semibold z-10"
                      >
                        {s}
                        <X
                          size={12}
                          className="hover:text-red-400 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFormData(prev => ({ ...prev, services: prev.services.filter((x: string) => x !== s) })); // 🌟 TYPED
                          }}
                        />
                      </span>
                    ))
                  )}
                  <ChevronDown
                    size={16}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-transform duration-200 ${isServicesDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </div>
                
                {isServicesDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsServicesDropdownOpen(false)} />
                    <div className="absolute z-40 w-full left-0 top-[100%] mt-2 bg-white border border-[#E8E8E8] rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 p-1.5">
                      {[
                        "Corporate Banking",
                        "Savings",
                        "Crypto",
                        "Bills",
                        "Merchant",
                      ].map((s: string) => ( // 🌟 TYPED
                        <div
                          key={s}
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              services: prev.services.includes(s)
                                ? prev.services.filter((x: string) => x !== s) // 🌟 TYPED
                                : [...prev.services, s]
                            }));
                          }}
                          className={`px-3 py-2.5 rounded-lg text-[13px] flex items-center justify-between cursor-pointer transition-colors ${formData.services.includes(s) ? 'bg-[#F9F9F9] font-bold text-[#1A1A1A]' : 'hover:bg-[#F5F5F4] text-[#1A1A1A]'}`}
                        >
                          {s} {formData.services.includes(s) && <Check size={14} className="text-[#1A1A1A]" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>


              {errors.form && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-red-600 font-medium">{errors.form}</p>
                </div>
              )}
            </div>

            <div className="px-6 sm:px-8 py-5 border-t border-[#F5F5F4] flex items-center justify-end gap-4 bg-white shrink-0 z-10">
              <button 
                onClick={handleCloseModal} 
                disabled={isSaving}
                className="text-[13px] font-semibold text-[#1A1A1A] hover:text-gray-500 transition-colors px-2 disabled:opacity-50"
              >
                Go back
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-black text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-gray-800 transition-colors shadow-sm active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center w-[160px]"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Update and save"}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
import { useState, useEffect } from "react";
import {
  Loader2,
  ChevronRight,
  Wallet,
  Briefcase,
  User,
  ChevronDown,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  X,
  Lock,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Search 
} from "lucide-react";
import { AuthLayout } from "../../components/ui/AuthLayout";
import { GoogleIcon } from "../../components/ui/GoogleIcon";
import { useGoogleLogin } from '@react-oauth/google';

// 🌟 WEB3 IMPORTS
import { Keypair } from "@stellar/stellar-sdk";
import { LocalCryptoUtil } from "../../utils/LocalCryptoUtil";
import { useStore } from "../../store/useStore";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

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

interface SignupFlowProps {
  onLoginClick: () => void;
  onComplete: (userData: any) => void;
}

export const SignupFlow = ({ onLoginClick, onComplete }: SignupFlowProps) => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(58);
  const [showPw, setShowPw] = useState(false);
  
  const [accountType, setAccountType] = useState("business");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    password: "",
    confirm: "",
  });

  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_DATA.find(c => c.name === "Nigeria") || COUNTRY_DATA[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchTerm, setCountrySearchTerm] = useState("");

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  const [pinStep, setPinStep] = useState<"create" | "confirm" | "unlock">("create");
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any>(null);
  
  const setSessionKey = useStore((state) => state.setSessionKey);
  const setActiveAccount = useStore((state) => state.setActiveAccount);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const otpIsComplete = otp.every((digit) => digit !== "");
  const passwordsMatch = form.password !== "" && form.password === form.confirm;
  const namesValid = form.firstName.trim() !== "" && form.lastName.trim() !== "";

  // 🌟 Smart Google Routing
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", 
          body: JSON.stringify({ token: tokenResponse.access_token })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Google authentication failed");

        if (data.user && data.user.encryptedWalletKey) {
          // They already signed up and have a vault! Route to Decrypt.
          setPendingGoogleUser(data.user);
          setPinStep("unlock");
          setStep(5);
        } else {
          // New Google User. Skip OTP and route to Profile Completion (Step 4).
          setPendingGoogleUser(data.user);
          
          setForm(prev => ({
            ...prev,
            firstName: data.user.firstName || "",
            lastName: data.user.lastName || ""
          }));
          
          setStep(4); 
        }
      } catch (err: any) {
        console.error("Google Auth Error:", err);
        setError(err.message || "Failed to authenticate with Google.");
      } finally {
        setIsGoogleLoading(false);
        setLoading(false);
      }
    },
    onError: (errorResponse) => {
      console.error('Google Login Error:', errorResponse);
      setError('Google Login Failed');
      setIsGoogleLoading(false);
      setLoading(false);
    },
    // 🌟 Instantly unlock the UI if the user closes the Google popup
    onNonOAuthError: (errorResponse) => {
      console.warn('Google Auth Aborted (Popup closed or blocked):', errorResponse);
      setIsGoogleLoading(false);
      setLoading(false);
    }
  });

  const requirements = [
    { id: "l", label: "8+ characters", met: form.password.length >= 8 },
    { id: "u", label: "Uppercase letter", met: /[A-Z]/.test(form.password) },
    { id: "n", label: "One number", met: /[0-9]/.test(form.password) },
    { id: "s", label: "Special character", met: /[!@#$%^&*]/.test(form.password) },
  ];
  const allRequirementsMet = requirements.every((r) => r.met);

  useEffect(() => {
    let interval: any;
    if (step === 3)
      interval = setInterval(() => setTimer((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [step]);

  const requestOtpEmail = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send verification code.");
      }

      setStep(3);
      setTimer(58);
    } catch (e: any) {
      setError(e.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpCode = async () => {
    setLoading(true);
    setError("");
    try {
      const code = otp.join("");
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp: code })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid or expired verification code.");
      }

      setStep(3.5);
    } catch (e: any) {
      setError(e.message);
      setOtp(["", "", "", "", "", ""]);
      document.getElementById("signup-otp-0")?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleStepTransition = (nextStep: number) => {
    if (step === 1 && !emailRegex.test(email)) {
      setError("Valid email required");
      return;
    }
    if (step === 2 && nextStep === 3) {
       requestOtpEmail();
       return;
    }
    setStep(nextStep);
  };

  const handleOtpChange = (val: string, index: number) => {
    if (isNaN(Number(val))) return;
    const newOtp = [...otp];
    newOtp[index] = val.slice(-1);
    setOtp(newOtp);
    setError("");
    if (val && index < 5)
      document.getElementById(`signup-otp-${index + 1}`)?.focus();
  };

  const handlePinInput = (value: string, type: "create" | "confirm" | "unlock") => {
    const numbersOnly = value.replace(/\D/g, '').slice(0, 6);
    if (type === "create" || type === "unlock") {
      setPin(numbersOnly);
      if (error) setError("");
    } else {
      setConfirmPin(numbersOnly);
      if (error) setError("");
    }
  };

  const handleUnlockSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const secretKey = await LocalCryptoUtil.decrypt(pendingGoogleUser.encryptedWalletKey, pin);
      if (!secretKey) throw new Error("Incorrect PIN.");

      localStorage.setItem("bingtellar_user", JSON.stringify(pendingGoogleUser));
      setSessionKey(secretKey);
      setActiveAccount(pendingGoogleUser);
      onComplete(pendingGoogleUser);
    } catch (err: any) {
      setError("Incorrect PIN. Cannot decrypt wallet.");
      setPin(""); 
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (confirmPin !== pin) {
      setError("PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newKeypair = Keypair.random();
      const publicKey = newKeypair.publicKey(); 
      const secretKey = newKeypair.secret();    

      const encryptedWalletString = await LocalCryptoUtil.encrypt(secretKey, pin);
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      let activeUserObject;

      if (pendingGoogleUser) {
        const payload = {
          accountType,
          country: selectedCountry.name,
          services: selectedServices,
          walletAddress: publicKey,
          encryptedWalletKey: encryptedWalletString,
          timezone: userTimezone
        };

        const response = await fetch(`${API_BASE}/users/${pendingGoogleUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include", 
          body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        if (!response.ok) throw new Error(responseData.error || "Failed to finalize account setup");
        
        activeUserObject = responseData.user || { ...pendingGoogleUser, ...payload };
      } else {
        const completeUserData = {
          email,
          firstName: form.firstName,
          lastName: form.lastName,
          password: form.password, 
          accountType,
          country: selectedCountry.name, 
          services: selectedServices,
          walletAddress: publicKey,
          encryptedWalletKey: encryptedWalletString,
          timezone: userTimezone
        };

        const response = await fetch(`${API_BASE}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", 
          body: JSON.stringify(completeUserData)
        });
        
        const responseData = await response.json();
        if (!response.ok) throw new Error(responseData.error || "Failed to create account");
        
        activeUserObject = responseData.user;
      }

      setSessionKey(secretKey);
      localStorage.setItem("bingtellar_user", JSON.stringify(activeUserObject));
      setActiveAccount(activeUserObject);

      onComplete(activeUserObject);

    } catch (err: any) {
      console.error("Setup failed:", err);
      setError(err.message || "Failed to finalize account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      hideClose={step === 3.5 || step === 5}
      onBack={step > 1 && step < 3.5 ? () => setStep(step - 1) : undefined}
    >
      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleStepTransition(2);
          }}
        >
          <h2 className="text-2xl font-bold mb-2 text-left">
            Create a new account
          </h2>
          <p className="text-gray-500 text-sm mb-8 font-medium">
            Already have an account?{" "}
            <span
              onClick={onLoginClick}
              className="underline font-bold text-black cursor-pointer"
            >
              Login
            </span>
          </p>

          <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden mb-6 shadow-sm">
            <button 
              type="button" 
              onClick={() => {
                // 1. Set UI to loading immediately
                setIsGoogleLoading(true);
                setLoading(true);
                // 2. Fire the popup
                loginWithGoogle();
              }}
              disabled={loading || isGoogleLoading}
              className="w-full bg-white py-4 px-4 flex items-center justify-between text-sm font-medium border-b border-gray-100 hover:bg-gray-50 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                {isGoogleLoading ? <Loader2 size={18} className="animate-spin text-gray-600" /> : <GoogleIcon />} 
                {isGoogleLoading ? "Connecting to Google..." : "Continue with Google"}
              </div>
              {!isGoogleLoading && <ChevronRight size={16} className="text-gray-400" />}
            </button>

            <button
              type="button"
              className="w-full bg-white py-4 px-4 flex items-center justify-between text-sm font-medium hover:bg-gray-50 transition-all"
            >
              <div className="flex items-center gap-3">
                <Wallet size={18} className="text-gray-600" /> Connect wallet
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>

          <div className="relative flex items-center py-4 text-gray-400 text-xs font-semibold mb-2">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="px-4 bg-white tracking-widest uppercase text-[10px]">
              OR
            </span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <div className="space-y-4 text-left">
            <div>
              <label className="text-sm font-semibold mb-1.5 block">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="name@company.com"
                className={`w-full border rounded-lg px-4 py-3.5 text-sm outline-none transition-all ${
                  error
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 focus:border-black"
                }`}
              />
              {error && (
                <p className="text-red-500 text-[11px] font-bold mt-1.5 uppercase">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !emailRegex.test(email)}
              className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all ${
                emailRegex.test(email)
                  ? "bg-black shadow-lg"
                  : "bg-gray-300 pointer-events-none"
              }`}
            >
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form 
          className="space-y-5 text-left animate-in slide-in-from-right-4"
          onSubmit={(e) => { e.preventDefault(); handleStepTransition(3); }}
        >
          <h2 className="text-2xl font-bold mb-4">Complete your profile</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-semibold mb-1.5 block">
                First name
              </label>
              <input
                required
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-black outline-none"
                placeholder="First name"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-semibold mb-1.5 block">
                Last name
              </label>
              <input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-black outline-none"
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <input
                required
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-black"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-3 text-gray-400"
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="mt-4 p-4 bg-[#FBFBFB] rounded-xl border border-gray-100 grid grid-cols-2 gap-y-2">
              {requirements.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                      r.met
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-100 text-gray-300"
                    }`}
                  >
                    <Check size={8} strokeWidth={4} />
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      r.met ? "text-green-700" : "text-gray-400"
                    }`}
                  >
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold mb-1.5 block">
              Re-enter Password
            </label>
            <input
              required
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className={`w-full border rounded-lg px-4 py-3 text-sm outline-none focus:border-black ${
                form.confirm && !passwordsMatch
                  ? "border-red-500 bg-red-50"
                  : "border-gray-200"
              }`}
              placeholder="Confirm password"
            />
          </div>
          <button
            type="submit"
            disabled={
              loading || !namesValid || !allRequirementsMet || !passwordsMatch
            }
            className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all mt-4 ${
              namesValid && allRequirementsMet && passwordsMatch
                ? "bg-black shadow-lg"
                : "bg-gray-300"
            }`}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "Create account"
            )}
          </button>
        </form>
      )}

      {step === 3 && (
        <div className="text-center animate-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold mb-2 text-left">
            Email authentication
          </h2>
          <p className="text-sm text-gray-500 mb-8 text-left">
            Enter code sent to{" "}
            <span className="text-black font-semibold">{email}</span>
          </p>
          <div className="flex justify-between gap-1.5 mb-6">
            {otp.map((digit, i) => (
              <input
                key={i}
                id={`signup-otp-${i}`}
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, i)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digit && i > 0) {
                    document.getElementById(`signup-otp-${i - 1}`)?.focus();
                  }
                }}
                className={`w-full aspect-square border rounded-xl text-center font-bold text-xl outline-none transition-all ${
                  error ? "border-red-400 bg-red-50 focus:border-red-500" : "border-gray-200 focus:border-black"
                }`}
              />
            ))}
          </div>
          
          {error && (
            <p className="text-red-500 text-[12px] font-bold mb-6 text-left animate-in fade-in">
              <AlertCircle size={14} className="inline mr-1 -mt-0.5"/> {error}
            </p>
          )}

          <div className="mb-10 min-h-[20px] text-left">
            {timer > 0 ? (
              <p className="text-sm text-gray-600 font-medium">
                Resend code in{" "}
                <span className="text-black font-bold">
                  0:{timer.toString().padStart(2, "0")}
                </span>
              </p>
            ) : (
              <button
                onClick={requestOtpEmail}
                className="text-sm font-bold text-black underline flex items-center gap-2"
              >
                <RotateCcw size={14} /> Resend OTP to email
              </button>
            )}
          </div>
          <button
            onClick={verifyOtpCode}
            disabled={loading || !otpIsComplete}
            className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all ${
              otpIsComplete ? "bg-black shadow-lg" : "bg-gray-300"
            }`}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "Verify & Continue"
            )}
          </button>
        </div>
      )}

      {step === 3.5 && (
        <div className="text-center py-6 animate-in zoom-in-95 duration-500">
          <div className="relative mx-auto w-24 h-24 mb-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-[#34A853]/10 rounded-full animate-pulse duration-1000"></div>
            <div className="absolute inset-2 bg-[#34A853]/20 rounded-full"></div>
            <div className="relative z-10 w-14 h-14 bg-[#34A853] rounded-full flex items-center justify-center shadow-xl shadow-[#34A853]/30">
              <Check size={28} strokeWidth={3} className="text-white animate-in zoom-in duration-300 delay-150" />
            </div>
          </div>

          <h2 className="text-[28px] font-extrabold text-[#111827] mb-3 tracking-tight">
            Account Verified!
          </h2>
          <p className="text-[14px] text-[#6B7280] mb-10 max-w-[260px] mx-auto leading-relaxed font-medium">
            Your identity is secured. Let's quickly customize your Blink experience.
          </p>

          <button
            onClick={() => setStep(4)}
            className="w-full bg-[#111827] text-white rounded-xl h-[56px] font-bold text-[14px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-black hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
          >
            Setup my Profile 
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}

      {/* 🌟 THE FIX: Step 4 is strictly UI Customization now */}
      {step === 4 && (
        <div className="space-y-6 text-left animate-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold mb-2">Welcome to Blink</h2>
          <p className="text-gray-500 text-sm mb-8">
            Please tell us how you'll use Blink...
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-2">
            {["business", "individual"].map((t) => (
              <button
                key={t}
                onClick={() => setAccountType(t)}
                className={`p-4 border rounded-xl text-left relative transition-all ${
                  accountType === t ? "border-black bg-gray-50 shadow-sm" : "border-gray-100"
                }`}
              >
                {t === "business" ? <Briefcase size={22} className="mb-2" /> : <User size={22} className="mb-2" />}
                <div className="font-bold text-sm capitalize">{t}</div>
                <div className={`w-5 h-5 rounded-full absolute top-4 right-4 border flex items-center justify-center ${accountType === t ? "border-black bg-black" : "border-gray-300"}`}>
                  {accountType === t && <Check size={12} className="text-white" />}
                </div>
              </button>
            ))}
          </div>
          
          <div className="relative z-50">
            <label className="text-sm font-bold mb-2 block">Country</label>
            
            <div 
              onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
              className="w-full border border-gray-200 rounded-lg px-4 h-[56px] text-sm font-medium bg-white cursor-pointer flex items-center justify-between transition-colors focus-within:border-black"
            >
              <div className="flex items-center gap-3">
                <span className="text-[20px] leading-none">
                  {selectedCountry.flag}
                </span>
                <span className="text-[#111827]">{selectedCountry.name}</span>
              </div>
              <ChevronDown 
                size={18} 
                className={`text-gray-400 transition-transform duration-200 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} 
              />
            </div>

            {isCountryDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsCountryDropdownOpen(false)} />
                <div className="absolute top-[100%] left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="p-2 border-b border-gray-100 bg-gray-50">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        autoFocus
                        placeholder="Search country..." 
                        value={countrySearchTerm}
                        onChange={(e) => setCountrySearchTerm(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-md py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-black transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="max-h-[200px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                    {COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).length > 0 ? (
                      COUNTRY_DATA.filter(c => c.name.toLowerCase().includes(countrySearchTerm.toLowerCase())).map(country => (
                        <div 
                          key={country.name}
                          onClick={() => {
                            setSelectedCountry(country);
                            setIsCountryDropdownOpen(false);
                            setCountrySearchTerm("");
                          }}
                          className={`flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-md cursor-pointer transition-colors ${selectedCountry.name === country.name ? 'bg-gray-50' : ''}`}
                        >
                          <span className="text-[18px] leading-none">{country.flag}</span>
                          <span className={`text-[13px] ${selectedCountry.name === country.name ? 'font-bold text-black' : 'text-gray-700'}`}>
                            {country.name}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-400 ml-auto">
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
          
          <div className="relative">
            <label className="text-sm font-bold mb-2 block">Services</label>
            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="min-h-[56px] w-full border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white cursor-pointer flex flex-wrap gap-2 items-center pr-10 relative"
            >
              {selectedServices.length === 0 ? (
                <span className="text-gray-400">Select...</span>
              ) : (
                selectedServices.map((s) => (
                  <span
                    key={s}
                    className="bg-black text-white px-2 py-1 rounded-md text-[10px] flex items-center gap-1 font-bold z-10"
                  >
                    {s}{" "}
                    <X
                      size={10}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedServices((prev) =>
                          prev.filter((x) => x !== s)
                        );
                      }}
                    />
                  </span>
                ))
              )}
              <ChevronDown
                size={18}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
            
            {isDropdownOpen && (
              <div className="absolute z-20 w-full left-0 top-[80px] bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {[
                  "Corporate Banking",
                  "Savings",
                  "Crypto",
                  "Bills",
                  "Merchant",
                ].map((s) => (
                  <div
                    key={s}
                    onClick={() => {
                      setSelectedServices((prev) =>
                        prev.includes(s)
                          ? prev.filter((x) => x !== s)
                          : [...prev, s]
                      )
                    }}
                    className="px-4 py-3 hover:bg-gray-50 text-sm flex items-center justify-between border-b last:border-0 cursor-pointer"
                  >
                    {s} {selectedServices.includes(s) && <Check size={16} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => handleStepTransition(5)}
            disabled={loading}
            className="w-full bg-black text-white rounded-lg h-[56px] font-semibold text-sm shadow-xl flex items-center justify-center mt-8 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 5 && (
        <div className="w-full text-center animate-in fade-in zoom-in-95 duration-300">
          
          <div className="w-16 h-16 bg-[#F9FAFB] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#E5E7EB]">
            {pinStep === "create" ? (
              <Lock size={24} className="text-[#111827]" />
            ) : (
              <ShieldCheck size={24} className="text-[#34A853]" />
            )}
          </div>

          <h2 className="text-2xl font-bold text-[#111827] mb-2 tracking-tight">
            {pinStep === "create" ? "Secure your wallet" : pinStep === "confirm" ? "Confirm your PIN" : "Unlock your wallet"}
          </h2>
          <p className="text-[14px] text-[#4B5563] leading-relaxed mb-8 max-w-[300px] mx-auto">
            {pinStep === "create" 
              ? "Create a 6-digit PIN. This encrypts your private key. Do not forget it!" 
              : pinStep === "confirm"
              ? "Please re-enter your 6-digit PIN to confirm and finalize setup."
              : "Please enter your 6-digit PIN to decrypt your private key and sign in."}
          </p>

          <div className="mb-8">
            <input
              type="password"
              autoFocus
              maxLength={6}
              value={pinStep === "create" || pinStep === "unlock" ? pin : confirmPin}
              onChange={(e) => handlePinInput(e.target.value, pinStep)}
              placeholder="• • • • • •"
              className={`w-full border rounded-xl py-4 text-center text-[24px] font-bold tracking-[0.5em] outline-none transition-colors shadow-sm ${
                error ? "border-red-400 focus:border-red-500 bg-red-50" : "border-[#D1D5DB] focus:border-[#111827]"
              }`}
            />
            {error ? (
              <div className="flex items-center justify-center gap-1.5 mt-3 text-red-500 animate-in fade-in">
                <AlertCircle size={14} />
                <p className="text-[12px] font-medium">{error}</p>
              </div>
            ) : (
              <p className="text-[12px] text-[#9CA3AF] mt-3 font-medium uppercase tracking-widest">
                {pinStep === "create" || pinStep === "unlock" ? "6 digits required" : "Matches previous PIN"}
              </p>
            )}
          </div>

          {pinStep === "create" && (
            <div className="mb-6 flex items-start gap-2.5 px-3 py-2.5 bg-[#FAFAFA] border border-[#F0F0EF] rounded-lg text-left animate-in fade-in slide-in-from-bottom-2 shadow-sm">
              <ShieldCheck className="text-blue-500 shrink-0 mt-[1px]" size={14} />
              <p className="text-[11px] text-[#757575] leading-snug">
                This PIN secures your funds and authorizes transactions. <strong className="text-[#1A1A1A]">It cannot be recovered by our team.</strong>
              </p>
            </div>
          )}

          {pinStep === "create" ? (
            <button
              disabled={pin.length !== 6}
              onClick={() => {
                if (pin.length === 6) setPinStep("confirm");
              }}
              className="w-full py-4 rounded-xl font-bold text-[14px] transition-all bg-[#111827] text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : pinStep === "confirm" ? (
            <button
              disabled={confirmPin.length !== 6 || loading}
              onClick={handleFinalSubmit}
              className="w-full py-4 rounded-xl font-bold text-[14px] transition-all bg-[#111827] text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" /> Securing Wallet...
                </div>
              ) : "Finalize Account"}
            </button>
          ) : (
            <button
              disabled={pin.length !== 6 || loading}
              onClick={handleUnlockSubmit}
              className="w-full py-4 rounded-xl font-bold text-[14px] transition-all bg-[#111827] text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" /> Decrypting...
                </div>
              ) : (
                <>Unlock & Sign In <ArrowRight size={16} /></>
              )}
            </button>
          )}

          {pinStep === "confirm" && !loading && (
            <button 
              onClick={() => { setPinStep("create"); setConfirmPin(""); setError(""); }}
              className="w-full mt-5 py-3 text-[13px] font-bold text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Go back and change PIN
            </button>
          )}
        </div>
      )}
    </AuthLayout>
  );
};
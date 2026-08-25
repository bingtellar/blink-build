import React, { useState, useEffect } from "react";
import {
  Loader2,
  ChevronRight,
  Wallet,
  Eye,
  EyeOff,
  RotateCcw,
  AlertCircle,
  Lock,
  ArrowRight
} from "lucide-react";
import { AuthLayout } from "../../components/ui/AuthLayout";
import { GoogleIcon } from "../../components/ui/GoogleIcon";
import { useGoogleLogin } from '@react-oauth/google';

// WEB3 & STATE IMPORTS
import { LocalCryptoUtil } from "../../utils/LocalCryptoUtil";
import { useStore } from "../../store/useStore";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface LoginFlowProps {
  onSignupClick: () => void;
  onForgotClick: () => void;
  onComplete: (userData: any) => void;
}

export const LoginFlow = ({
  onSignupClick,
  onForgotClick,
  onComplete,
}: LoginFlowProps) => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(58);
  
  // 🌟 Web3 State
  const [pin, setPin] = useState("");
  const [pendingUser, setPendingUser] = useState<any>(null);

  // Zustand Global State
  const setSessionKey = useStore((state) => state.setSessionKey);
  const setActiveAccount = useStore((state) => state.setActiveAccount);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isLoginValid = emailRegex.test(email) && password.length > 0;

  // 🌟 THE FIX: Google Auth Interceptor
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsGoogleLoading(true);
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

        // 🌟 INTERCEPT THE OAUTH RESPONSE
        if (data.user && data.user.encryptedWalletKey) {
          setPendingUser(data.user);
          setStep(3);
        } else {
          setError("Secure vault not found. Please click 'Create an account' to initialize your blockchain wallet.");
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

  useEffect(() => {
    let interval: any;
    if (step === 2)
      interval = setInterval(() => setTimer((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [step]);

  // ==========================================
  // 🧠 STEP 1: WEB2 CREDENTIALS & JWT
  // ==========================================
  const handleLoginAttempt = async () => {
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email format");
      return;
    }
    
    setLoading(true);
    setError("");

    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", 
        body: JSON.stringify({ email, password, timezone: userTimezone }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        throw new Error("Network error: Server is unreachable or returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Invalid email or password");
      }

      setPendingUser(data.user);
      await requestOtpEmail(email);
      
    } catch (err: any) {
      setError(err.message || "Failed to authenticate.");
      setLoading(false);
    }
  };

  // ==========================================
  // 🧠 STEP 2: DISPATCH & VERIFY OTP
  // ==========================================
  const requestOtpEmail = async (targetEmail: string) => {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send verification code.");
      }

      setStep(2);
      setTimer(58);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalVerify = async () => {
    setLoading(true);
    setError("");
    try {
      const code = otp.join("");
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid or expired verification code.");
      }

      setStep(3);
    } catch (e: any) {
      setError(e.message);
      setOtp(["", "", "", "", "", ""]);
      document.getElementById("login-otp-0")?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (val: string, index: number) => {
    if (isNaN(Number(val))) return;
    const newOtp = [...otp];
    newOtp[index] = val.slice(-1);
    setOtp(newOtp);
    setError("");
    if (val && index < 5)
      document.getElementById(`login-otp-${index + 1}`)?.focus();
  };

  // ==========================================
  // 🧠 STEP 3: DECRYPT WEB3 WALLET (Client-Side)
  // ==========================================
  const handlePinInput = (value: string) => {
    const numbersOnly = value.replace(/\D/g, '').slice(0, 6);
    setPin(numbersOnly);
    if (error) setError("");
  };

  const handleUnlockWallet = async () => {
    setLoading(true);
    setError("");

    try {
      const secretKey = await LocalCryptoUtil.decrypt(pendingUser.encryptedWalletKey, pin);
      
      if (!secretKey) {
        throw new Error("Incorrect PIN.");
      }

      localStorage.setItem("bingtellar_user", JSON.stringify(pendingUser));
      setSessionKey(secretKey);
      setActiveAccount(pendingUser);

      onComplete(pendingUser);

    } catch (err: any) {
      setError("Incorrect PIN. Cannot decrypt wallet.");
      setPin(""); 
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      if (step === 1 && isLoginValid) handleLoginAttempt();
      if (step === 2 && !otp.includes("")) handleFinalVerify();
      if (step === 3 && pin.length === 6) handleUnlockWallet();
    }
  };

  return (
    <AuthLayout onBack={step === 2 ? () => setStep(1) : undefined}>
      {step === 1 && (
        <div className="space-y-6 text-left animate-in slide-in-from-left-4" onKeyDown={handleKeyPress}>
          <div>
            <h2 className="text-2xl font-bold">Sign in to your account</h2>
            <p className="text-gray-500 text-sm font-medium mt-1">
              New to Blink?{" "}
              <span
                onClick={onSignupClick}
                className="underline font-bold text-black cursor-pointer hover:text-gray-700 transition-colors"
              >
                Create an account
              </span>
            </p>
          </div>
          
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-[8px] flex items-center gap-2 text-red-600 animate-in fade-in">
                <AlertCircle size={16} />
                <p className="text-[13px] font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="text-sm font-semibold mb-1.5 block">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="name@company.com"
                className={`w-full border rounded-lg px-4 py-3.5 text-sm outline-none transition-all ${
                  error && email.length > 0 ? "border-red-500 bg-red-50" : "border-gray-200 focus:border-black"
                }`}
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-semibold block">Password</label>
                <button
                  type="button"
                  onClick={onForgotClick}
                  className="text-xs font-bold text-gray-500 hover:text-black hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm focus:border-black outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              onClick={handleLoginAttempt}
              disabled={loading || !isLoginValid}
              className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all ${
                isLoginValid && !loading ? "bg-black shadow-lg" : "bg-gray-300 pointer-events-none"
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : "Sign In"}
            </button>
          </div>

          <div className="relative flex items-center py-2 text-gray-400 text-xs font-semibold">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="px-4 bg-white tracking-widest uppercase text-[10px]">OR</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>
          
          <div className="space-y-0 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <button 
              type="button" 
              onClick={() => {
                // 1. Set UI to loading immediately
                setIsGoogleLoading(true);
                setLoading(true);
                // 2. Fire the popup (React 18 event batching guarantees the browser won't block it)
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

            <button type="button" className="w-full bg-white py-4 px-4 flex items-center justify-between text-sm font-medium hover:bg-gray-50 transition-all">
              <div className="flex items-center gap-3">
                <Wallet size={18} className="text-gray-600" /> Connect wallet
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="text-center animate-in fade-in slide-in-from-right-4 duration-300" onKeyDown={handleKeyPress}>
          <h2 className="text-2xl font-bold mb-2 text-left">Security check</h2>
          <p className="text-sm text-gray-500 mb-8 text-left">
            Enter the 6-digit code sent to <span className="font-bold text-black">{email}</span>.
          </p>
          
          <div className="flex justify-between gap-1.5 mb-6">
            {otp.map((digit, i) => (
              <input
                key={i}
                id={`login-otp-${i}`}
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, i)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digit && i > 0) {
                    document.getElementById(`login-otp-${i - 1}`)?.focus();
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
                Resend code in <span className="text-black font-bold">0:{timer.toString().padStart(2, "0")}</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => requestOtpEmail(email)}
                className="text-sm font-bold text-black hover:text-gray-700 flex items-center gap-2 transition-colors"
              >
                <RotateCcw size={14} /> Resend OTP
              </button>
            )}
          </div>
          
          <button
            onClick={handleFinalVerify}
            disabled={loading || otp.includes("")}
            className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all ${
              !otp.includes("") && !loading ? "bg-black shadow-xl" : "bg-gray-300 pointer-events-none"
            }`}
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : "Verify OTP"}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="text-center animate-in fade-in zoom-in-95 duration-300" onKeyDown={handleKeyPress}>
          <div className="w-16 h-16 bg-[#F9FAFB] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#E5E7EB]">
            <Lock size={24} className="text-[#111827]" />
          </div>

          <h2 className="text-2xl font-bold text-[#111827] mb-2 tracking-tight">Unlock your wallet</h2>
          <p className="text-[14px] text-[#4B5563] leading-relaxed mb-8 max-w-[300px] mx-auto">
            Please enter your 6-digit security PIN to decrypt your private key and access your dashboard.
          </p>

          <div className="mb-8">
            <input
              type="password"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinInput(e.target.value)}
              placeholder="• • • • • •"
              className={`w-full border rounded-xl py-4 text-center text-[24px] font-bold tracking-[0.5em] outline-none transition-colors shadow-sm ${
                error ? "border-red-400 focus:border-red-500 bg-red-50" : "border-[#D1D5DB] focus:border-[#111827]"
              }`}
            />
            {error && (
              <div className="flex items-center justify-center gap-1.5 mt-3 text-red-500 animate-in fade-in">
                <AlertCircle size={14} />
                <p className="text-[12px] font-medium">{error}</p>
              </div>
            )}
          </div>

          <button
            disabled={pin.length !== 6 || loading}
            onClick={handleUnlockWallet}
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
        </div>
      )}
    </AuthLayout>
  );
};
import React, { useState, useEffect } from "react";
import {
  Loader2,
  KeyRound,
  RotateCcw,
  CheckCircle2,
  Eye,
  EyeOff,
  AlertCircle,
  Check
} from "lucide-react";
import { AuthLayout } from "../../components/ui/AuthLayout";

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const ForgotPasswordFlow = ({
  onBackToLogin,
}: {
  onBackToLogin: () => void;
}) => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(58);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [resetToken, setResetToken] = useState("");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const otpIsComplete = otp.every((digit) => digit !== "");
  const passwordsMatch = form.password !== "" && form.password === form.confirm;

  const requirements = [
    { id: "l", label: "8+ characters", met: form.password.length >= 8 },
    { id: "u", label: "Uppercase letter", met: /[A-Z]/.test(form.password) },
    { id: "n", label: "One number", met: /[0-9]/.test(form.password) },
    {
      id: "s",
      label: "Special character",
      met: /[!@#$%^&*]/.test(form.password),
    },
  ];
  const allRequirementsMet = requirements.every((r) => r.met);

  useEffect(() => {
    let interval: any;
    if (step === 2)
      interval = setInterval(() => setTimer((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [step]);

  // ==========================================
  // 🧠 STEP 1: REQUEST OTP
  // ==========================================
  const requestRecoveryCode = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send recovery code.");
      }

      setStep(2);
      setTimer(58);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 🧠 STEP 2: VERIFY OTP & GET RESET TOKEN
  // ==========================================
  const verifyRecoveryCode = async () => {
    setLoading(true);
    setError("");

    try {
      const code = otp.join("");
      
      // We hit a specialized forgot-password verification route here
      // that returns a temporary reset token.
      const res = await fetch(`${API_BASE}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid or expired recovery code.");
      }
      
      const data = await res.json();
      setResetToken(data.resetToken);
      setStep(3);

    } catch (e: any) {
      setError(e.message);
      setOtp(["", "", "", "", "", ""]);
      document.getElementById("forgot-otp-0")?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 🧠 STEP 3: UPDATE PASSWORD
  // ==========================================
  const updatePassword = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, resetToken, newPassword: form.password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update password.");
      }

      setStep(4);
    } catch (e: any) {
      setError(e.message);
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
      document.getElementById(`forgot-otp-${index + 1}`)?.focus();
  };

  // Allow 'Enter' key to trigger progression
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      if (step === 1 && emailRegex.test(email)) requestRecoveryCode();
      if (step === 2 && otpIsComplete) verifyRecoveryCode();
      if (step === 3 && allRequirementsMet && passwordsMatch) updatePassword();
    }
  };

  return (
    <AuthLayout
      onBack={step > 1 && step < 4 ? () => setStep(step - 1) : onBackToLogin}
    >
      {/* --- STEP 1: REQUEST RECOVERY CODE --- */}
      {step === 1 && (
        <div className="space-y-6 text-left animate-in slide-in-from-left-4" onKeyDown={handleKeyPress}>
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-2 border border-gray-100">
            <KeyRound className="text-black" size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Forgot password?</h2>
            <p className="text-gray-500 text-sm mt-2">
              Enter your email and we'll send you a recovery code.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-[8px] flex items-center gap-2 text-red-600 animate-in fade-in">
              <AlertCircle size={16} />
              <p className="text-[13px] font-medium">{error}</p>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-1.5 block">
              Email address
            </label>
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
          <button
            onClick={requestRecoveryCode}
            disabled={!emailRegex.test(email) || loading}
            className={`w-full text-white rounded-lg h-[56px] font-semibold text-sm flex items-center justify-center transition-all ${
              emailRegex.test(email) && !loading ? "bg-black shadow-lg hover:bg-gray-800" : "bg-gray-300 pointer-events-none"
            }`}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Send Recovery Code"}
          </button>
        </div>
      )}

      {/* --- STEP 2: VERIFY RECOVERY CODE --- */}
      {step === 2 && (
        <div className="text-center animate-in fade-in slide-in-from-right-4 duration-300" onKeyDown={handleKeyPress}>
          <h2 className="text-2xl font-bold mb-2 text-left">Verify email</h2>
          <p className="text-sm text-gray-500 mb-8 text-left">
            Enter the recovery code sent to <span className="font-bold text-black">{email}</span>.
          </p>
          
          <div className="flex justify-between gap-1.5 mb-6">
            {otp.map((digit, i) => (
              <input
                key={i}
                id={`forgot-otp-${i}`}
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, i)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digit && i > 0) {
                    document.getElementById(`forgot-otp-${i - 1}`)?.focus();
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
                type="button"
                onClick={requestRecoveryCode}
                className="text-sm font-bold text-black hover:text-gray-700 flex items-center gap-2 transition-colors"
              >
                <RotateCcw size={14} /> Resend OTP
              </button>
            )}
          </div>
          
          <button
            onClick={verifyRecoveryCode}
            disabled={!otpIsComplete || loading}
            className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all ${
              otpIsComplete && !loading ? "bg-black shadow-xl" : "bg-gray-300 pointer-events-none"
            }`}
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : "Verify Code"}
          </button>
        </div>
      )}

      {/* --- STEP 3: RESET PASSWORD --- */}
      {step === 3 && (
        <div className="space-y-6 text-left animate-in fade-in slide-in-from-right-4 duration-300" onKeyDown={handleKeyPress}>
          <h2 className="text-2xl font-bold">Create new password</h2>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-[8px] flex items-center gap-2 text-red-600 animate-in fade-in">
              <AlertCircle size={16} />
              <p className="text-[13px] font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1.5 block">New Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-black outline-none transition-all"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              
              <div className="mt-4 p-4 bg-[#FBFBFB] rounded-xl border border-gray-100 grid grid-cols-2 gap-y-2">
                {requirements.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                        r.met ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-300"
                      }`}
                    >
                      <Check size={8} strokeWidth={4} />
                    </div>
                    <span
                      className={`text-[11px] font-medium transition-colors ${
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
              <label className="text-sm font-semibold mb-1.5 block">Confirm Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => { setForm({ ...form, confirm: e.target.value }); setError(""); }}
                className={`w-full border rounded-lg px-4 py-3 text-sm outline-none transition-all ${
                  form.confirm && !passwordsMatch
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 focus:border-black"
                }`}
                placeholder="Confirm new password"
              />
            </div>
            
            <button
              onClick={updatePassword}
              disabled={!allRequirementsMet || !passwordsMatch || loading}
              className={`w-full text-white rounded-lg h-[56px] font-semibold flex items-center justify-center transition-all mt-4 ${
                allRequirementsMet && passwordsMatch && !loading
                  ? "bg-black shadow-lg hover:bg-gray-800"
                  : "bg-gray-300 pointer-events-none"
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : "Update Password"}
            </button>
          </div>
        </div>
      )}

      {/* --- STEP 4: SUCCESS --- */}
      {step === 4 && (
        <div className="text-center py-6 animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
            <CheckCircle2 size={40} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3">Success!</h2>
          <p className="text-gray-500 text-sm mb-10">
            Your password has been securely updated. You can now sign in with your new credentials.
          </p>
          <button
            onClick={onBackToLogin}
            className="w-full bg-black text-white rounded-lg h-[56px] font-semibold shadow-lg hover:bg-gray-800 transition-colors"
          >
            Back to Login
          </button>
        </div>
      )}
    </AuthLayout>
  );
};
import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { ShieldCheck, Lock, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

export const AdminSetup = () => {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Extract URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const tokenParam = params.get("token");

    if (emailParam) setEmail(emailParam);
    if (tokenParam) setToken(tokenParam);
    
    if (!emailParam || !tokenParam) {
      setError("Invalid or missing provisioning parameters. Please click the exact link provided in your email.");
    }
  }, []);

  const handleInitialization = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passphrases do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/admin/team/finalize-setup", { email, token, password });
      setSuccess(true);
      
      // Auto-redirect to the Command Center login after 3 seconds
      setTimeout(() => {
        window.location.href = "/admin";
      }, 3000);
      
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to initialize account. The link may be expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 selection:bg-white/20 animate-in fade-in duration-500 font-sans">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.015] blur-[100px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-[400px] relative z-10">
        
        <div className="flex flex-col mb-8">
          <div className="w-12 h-12 bg-white flex items-center justify-center text-black font-bold text-[20px] mb-6 rounded-lg shadow-[0_0_40px_rgba(255,255,255,0.1)]">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-[24px] font-medium text-white tracking-tight leading-tight">Initialize Admin Clearance</h1>
          <p className="text-[14px] text-white/40 mt-2 font-medium leading-relaxed">
            Configure your secure password to finalize infrastructure and admin access for <strong className="text-white/80">{email || "your account"}</strong>.
          </p>
        </div>

        {success ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
              <CheckCircle2 className="text-green-400" size={32} />
            </div>
            <h3 className="text-[18px] font-semibold text-white mb-2">Admin Clearance Finalized</h3>
            <p className="text-[14px] text-white/50 mb-6">Your password has been secured. You may now access the Operations Command Center.</p>
            <button 
              onClick={() => window.location.href = '/admin'} 
              className="w-full bg-white text-black font-bold text-[14px] h-[48px] rounded-xl transition-all hover:bg-gray-200"
            >
              Proceed to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleInitialization} className="space-y-5">
            
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/50 uppercase tracking-widest pl-1">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => { setPassword(e.target.value); setError(""); }} 
                  placeholder="••••••••••••" 
                  className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-white/30 text-white text-[14px] rounded-xl pl-11 pr-4 py-3.5 outline-none transition-all placeholder:text-white/20 tracking-widest hover:bg-white/[0.05] focus:bg-white/[0.05]" 
                  required 
                  disabled={!token || !email}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/50 uppercase tracking-widest pl-1">Confirm Passworde</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }} 
                  placeholder="••••••••••••" 
                  className={`w-full bg-white/[0.03] border ${error.includes('match') ? 'border-red-500/50' : 'border-white/[0.08] focus:border-white/30'} text-white text-[14px] rounded-xl pl-11 pr-4 py-3.5 outline-none transition-all placeholder:text-white/20 tracking-widest hover:bg-white/[0.05] focus:bg-white/[0.05]`} 
                  required 
                  disabled={!token || !email}
                />
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                <p className="text-[13px] font-medium text-red-200 leading-snug">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || !token || !email || !password || !confirmPassword} 
              className="w-full bg-white text-black hover:bg-gray-200 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed font-bold text-[14px] h-[52px] rounded-xl transition-all flex items-center justify-center gap-2 mt-2 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Initialize Identity <ArrowRight size={16} /></>}
            </button>
            
          </form>
        )}

      </div>
    </div>
  );
};
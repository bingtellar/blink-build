import { ReactNode, useState, useEffect } from "react";
import { useStore } from "../store/useStore";
import { ArrowLeft, Loader2, ArrowRight } from "lucide-react";
// 🌟 CRITICAL FIX: Import both the public api (for login) and the adminApi (for secure verification)
import { api, adminApi } from "../lib/api";

interface AdminGuardProps {
  children: ReactNode;
}

export const AdminGuard = ({ children }: AdminGuardProps) => {
  const setActiveAccount = useStore((state: any) => state.setActiveAccount);
  
  const [adminUser, setAdminUser] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(true); 
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // 🛡️ CRYPTOGRAPHIC VERIFICATION ON MOUNT
  // We NEVER trust local storage. We ping the backend on every refresh.
  useEffect(() => {
    const verifyAdminSession = async () => {
      const storedAdmin = localStorage.getItem("bingtellar_admin_session");
      const token = localStorage.getItem("bingtellar_admin_token"); 

      if (storedAdmin && token) {
        try {
          // 🌟 VERIFY using the dedicated, isolated admin network pipeline
          const res = await adminApi.get('/users/me');
          const liveUser = res.data.user;

          if (liveUser.role === 'admin' || liveUser.role === 'super_admin') {
            setAdminUser(liveUser);
            setActiveAccount(liveUser); 
          } else {
            throw new Error("Clearance Revoked");
          }
        } catch (error) {
          console.warn("Admin session invalid or expired. Purging local state.");
          localStorage.removeItem("bingtellar_admin_session");
          localStorage.removeItem("bingtellar_admin_token");
          setAdminUser(null);
          setActiveAccount(null);
        }
      }
      setIsVerifying(false);
    };

    verifyAdminSession();
  }, [setActiveAccount]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      // 🌟 LOGIN: We use the public `api` pipeline because we don't have a token yet
      const response = await api.post("/auth/login", { email, password });
      const userData = response.data.user;
      const adminToken = response.data.token;

      if (userData.role !== 'admin' && userData.role !== 'super_admin') {
         setAuthError("This account lacks cryptographic founder clearance.");
         return;
      }

      // 🌟 ISOLATION: Save specifically to the ADMIN keys, never the USER keys
      localStorage.setItem("bingtellar_admin_session", JSON.stringify(userData));
      localStorage.setItem("bingtellar_admin_token", adminToken); 
      
      setAdminUser(userData);
      setActiveAccount(userData);

    } catch (err: any) {
      setAuthError(err.response?.data?.error || "Invalid credentials or network error.");
    } finally {
      setLoading(false);
    }
  };

  // 🛡️ LAYER 1: NETWORK PENDING
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center font-mono text-[12px] text-white/50">
        <Loader2 className="animate-spin mb-4 text-white/80" size={24} />
        Verifying Cryptographic Clearance...
      </div>
    );
  }

  // 🛡️ LAYER 2: UNAUTHORIZED (Show Login Gateway)
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 selection:bg-white/20 animate-in fade-in duration-500 font-sans">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.015] blur-[100px] rounded-full pointer-events-none" />
        <div className="w-full max-w-[380px] relative z-10">
          
          <div className="flex flex-col mb-10">
            <div className="w-10 h-10 bg-white flex items-center justify-center text-black font-bold text-[18px] mb-6">B</div>
            <h1 className="text-[24px] font-medium text-white tracking-tight leading-tight">Operations Command Center</h1>
            <p className="text-[14px] text-white/40 mt-1.5 font-medium">Enter credentials to initialize secure infrastructure session.</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/50 uppercase tracking-widest pl-1">Team Email</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setAuthError(""); }} placeholder="name@bingtellar.com" className={`w-full bg-white/[0.03] border ${authError ? 'border-red-500/50 focus:border-red-500' : 'border-white/[0.08] focus:border-white/30'} text-white text-[14px] rounded-xl px-4 py-3.5 outline-none transition-all placeholder:text-white/20 hover:bg-white/[0.05] focus:bg-white/[0.05]`} required />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/50 uppercase tracking-widest pl-1">Password</label>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(""); }} placeholder="••••••••••••" className={`w-full bg-white/[0.03] border ${authError ? 'border-red-500/50 focus:border-red-500' : 'border-white/[0.08] focus:border-white/30'} text-white text-[14px] rounded-xl px-4 py-3.5 outline-none transition-all placeholder:text-white/20 tracking-widest hover:bg-white/[0.05] focus:bg-white/[0.05]`} required />
              {authError && <p className="text-red-400 text-[12px] mt-2 ml-1 font-medium">{authError}</p>}
            </div>

            <button type="submit" disabled={loading || !email || !password} className="w-full bg-white text-black hover:bg-gray-200 disabled:bg-white/20 disabled:text-white/40 disabled:cursor-not-allowed font-bold text-[14px] h-[52px] rounded-xl transition-all flex items-center justify-center gap-2 mt-4 active:scale-[0.98]">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Authorize <ArrowRight size={16} /></>}
            </button>
            
            <div className="pt-6 border-t border-white/[0.05] mt-8 flex justify-center">
              <button type="button" onClick={() => window.location.href = '/login'} className="text-[12px] font-medium text-white/30 hover:text-white transition-colors flex items-center gap-1.5">
                <ArrowLeft size={12} /> Return to User Gateway
              </button>
            </div>
          </form>

        </div>
      </div>
    );
  }

  // 🛡️ LAYER 3: AUTHORIZED (Render Dashboard)
  return <>{children}</>;
};
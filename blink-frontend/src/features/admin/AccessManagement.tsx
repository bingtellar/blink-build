import { useState, useEffect } from "react";
import { 
  ShieldCheck, ShieldAlert, AlertCircle, Trash2, 
  Plus, ChevronDown, CheckCircle2, Loader2, 
  User, Settings2, Landmark, Edit2, Lock 
} from "lucide-react";
import { api } from "../../lib/api";
import toast from "react-hot-toast";

interface AccessManagementProps {
  currentUserRole?: string; // 🌟 NEW: The component now knows who is looking at it
}

export const AccessManagement = ({ currentUserRole = "admin" }: AccessManagementProps) => {
  const [view, setView] = useState<"ledger" | "provision">("ledger");
  
  const DEFAULT_MODULES = ['kyc', 'escrow', 'settings'];

  // 🌟 LEDGER STATE
  const [adminTeam, setAdminTeam] = useState<any[]>([]);
  const [isFetchingLedger, setIsFetchingLedger] = useState(true);
  
  // 🌟 FORM STATE
  const [name, setName] = useState(""); 
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [department, setDepartment] = useState("Compliance");
  const [selectedModules, setSelectedModules] = useState<string[]>(DEFAULT_MODULES); 
  
  // 🌟 UI STATE
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUpgradeMode, setIsUpgradeMode] = useState(false); 
  
  // 🌟 MODAL STATES
  const [revokePrompt, setRevokePrompt] = useState<{id: string, name: string, email: string} | null>(null);
  const [unauthorizedPrompt, setUnauthorizedPrompt] = useState<string | null>(null); // 🌟 NEW: Traps standard admins

  const fetchAdminTeam = async () => {
    try {
      setIsFetchingLedger(true);
      const res = await api.get('/admin/team');
      setAdminTeam(res.data);
    } catch (err) {
      console.error("Failed to fetch admin team", err);
      toast.error("Failed to synchronize personnel ledger.");
    } finally {
      setIsFetchingLedger(false);
    }
  };

  useEffect(() => {
    if (view === "ledger") {
      fetchAdminTeam();
    }
  }, [view]);

  const toggleModule = (modId: string) => {
    setSelectedModules(prev => prev.includes(modId) ? prev.filter(m => m !== modId) : [...prev, modId]);
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setRole("admin");
    setDepartment("Compliance");
    setSelectedModules(DEFAULT_MODULES); 
    setIsUpgradeMode(false);
    setError(null);
  };

  // 🌟 NEW: THE SECURITY INTERCEPTOR
  // Every critical action flows through this gatekeeper first.
  const executeGuardedAction = (actionName: string, actionFn: () => void) => {
    if (currentUserRole !== 'super_admin') {
      setUnauthorizedPrompt(actionName);
      return;
    }
    actionFn();
  };

  const openProvisionForm = () => {
    resetForm();
    setView("provision");
  };

  const handleEditAdmin = (admin: any) => {
    setName(admin.name);
    setEmail(admin.email);
    setRole(admin.role);
    setDepartment(admin.department || "Compliance");
    setSelectedModules(admin.modules ? admin.modules : DEFAULT_MODULES); 
    setIsUpgradeMode(true);
    setView("provision");
  };

  const handleProvisionAccess = async () => {
    if (!name && !isUpgradeMode) {
      setError("Full Name is required for new accounts.");
      return;
    }
    if (!email) {
      setError("Email address is required.");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      if (isUpgradeMode) {
        await api.post("/admin/team/upgrade", { email, role, department, modules: selectedModules });
        toast.success(`Successfully upgraded ${email} to ${role.replace('_', ' ')}.`);
      } else {
        await api.post("/admin/team/provision", { name, email, role, department, modules: selectedModules });
        toast.success(`Clearance invitation dispatched securely to ${email}.`);
      }
      
      resetForm();
      setView("ledger");
      
    } catch (err: any) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error;

      if (status === 409) {
        setIsUpgradeMode(true);
        setError("This account already exists. Review the permissions below and click 'Upgrade Clearance' to elevate their access.");
      } else {
        setError(errorMsg || "Action failed. Verify the network connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const confirmRevokeAccess = async () => {
    if (!revokePrompt) return;
    setIsLoading(true);
    try {
      await api.post(`/admin/team/${revokePrompt.id}/revoke`);
      toast.success("Cryptographic clearance successfully revoked.");
      setRevokePrompt(null);
      fetchAdminTeam(); 
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to revoke access.");
    } finally {
      setIsLoading(false);
    }
  };

  const activeInitials = name.trim() ? name.trim().split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "";

  // ----------------------------------------------------------------------
  // VIEW 1: PROVISIONING / UPGRADE FORM
  // ----------------------------------------------------------------------
  if (view === "provision") {
    // Note: Standard admins can't reach this view anymore, but we keep it intact for Super Admins
    return (
      <div className="bg-white rounded-[24px] border border-[#EAEAEA] shadow-sm animate-in fade-in zoom-in-95 duration-300 overflow-hidden font-sans">
        {/* HEADER */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[#EAEAEA]">
          <div>
            <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-1 font-medium">
              <button onClick={() => { resetForm(); setView("ledger"); }} className="hover:text-black transition-colors">Access Management</button>
              <span>/</span>
              <span className="text-gray-900">{isUpgradeMode ? "Modify Admin Clearance / Access" : "Provision Personnel"}</span>
            </div>
            <h2 className="text-[28px] font-semibold text-[#111827] tracking-tight">
              {isUpgradeMode ? "Upgrade Clearance" : "Add new admin"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { resetForm(); setView("ledger"); }}
              className="px-5 py-2.5 rounded-[10px] text-[14px] font-semibold text-gray-700 hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleProvisionAccess}
              disabled={isLoading}
              className={`px-6 py-2.5 rounded-[10px] text-white text-[14px] font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2 active:scale-95 ${isUpgradeMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#111827] hover:bg-black'}`}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : (isUpgradeMode ? "Upgrade Clearance" : "Provision")}
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-8 lg:p-10">
          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-[13px] text-red-800 font-medium">{error}</p>
            </div>
          )}
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
            <div className="w-full lg:w-[280px] shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-[68px] h-[68px] rounded-full bg-[#FAFAFA] border border-[#EAEAEA] flex items-center justify-center text-gray-500 font-semibold text-[20px]">
                  {activeInitials || <User size={32} strokeWidth={1.5} className="text-gray-300" />}
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-gray-900 leading-snug">
                    {name || (isUpgradeMode ? "Existing Account" : "New admin details")}
                  </h3>
                  <p className="text-[14px] text-gray-500 mt-0.5 break-all">
                    {email || "Enter name and email"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="md:col-span-1">
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Full Name</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Thompson"
                    disabled={isUpgradeMode} 
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-[10px] text-[14px] text-gray-900 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
              <div className="md:col-span-1">
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Target Email Address</label>
                <div className="relative">
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); setIsUpgradeMode(false); }}
                    placeholder="alex@bingtellar.com"
                    disabled={isUpgradeMode} 
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-[10px] text-[14px] text-gray-900 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Clearance Role</label>
                <div className="relative">
                  <select 
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-[10px] text-[14px] text-gray-900 appearance-none focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                  >
                    <option value="admin">Standard Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Department</label>
                <div className="relative">
                  <select 
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-[10px] text-[14px] text-gray-900 appearance-none focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                  >
                    <option value="Compliance">KYC & Compliance</option>
                    <option value="Operations">Financial Operations</option>
                    <option value="Engineering">Engineering / DevOps</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#EAEAEA]">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-[16px] font-semibold text-gray-900">Platform Modules</h3>
                <p className="text-[13px] text-gray-500">Toggle infrastructure access</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'kyc', title: 'Compliance & KYC', desc: 'Review identities and provision accounts.', icon: ShieldCheck },
                  { id: 'escrow', title: 'Escrow Ledger', desc: 'Approve fiat and stablecoin settlements.', icon: Landmark },
                  { id: 'settings', title: 'System Config', desc: 'Modify global platform fees and limits.', icon: Settings2 }
                ].map((mod) => {
                  const isSelected = selectedModules.includes(mod.id);
                  const Icon = mod.icon;
                  return (
                    <button 
                      key={mod.id}
                      onClick={() => toggleModule(mod.id)}
                      className={`text-left p-5 rounded-[16px] border transition-all ${isSelected ? 'border-black bg-gray-50 shadow-sm' : 'border-[#EAEAEA] bg-white hover:border-gray-300'}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <Icon size={20} strokeWidth={isSelected ? 2 : 1.5} />
                         </div>
                         {isSelected && <CheckCircle2 className="text-black" size={20} />}
                      </div>
                      <h4 className={`text-[14px] font-semibold ${isSelected ? 'text-black' : 'text-gray-700'}`}>{mod.title}</h4>
                      <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{mod.desc}</p>
                    </button>
                  );
                })}
             </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // VIEW 2: PERSONNEL LEDGER 
  // ----------------------------------------------------------------------
  return (
    <div className="animate-in fade-in duration-300 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[24px] font-bold text-[#111827] tracking-tight">Access Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Manage admin clearances for Bingtellar infrastructure.</p>
        </div>
        
        {/* 🌟 GUARDED: Provision Button */}
        <button 
          onClick={() => executeGuardedAction("Provision New Admin", openProvisionForm)}
          className="bg-[#111827] text-white px-5 py-2.5 rounded-[10px] text-[14px] font-semibold hover:bg-black shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          {currentUserRole !== 'super_admin' ? <Lock size={16} className="opacity-60" /> : <Plus size={18} />} 
          Provision New Admin
        </button>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[20px] shadow-sm overflow-hidden">
        {isFetchingLedger ? (
          <div className="p-20 text-center flex flex-col items-center">
            <Loader2 className="animate-spin text-gray-300 mb-4" size={32} />
            <h3 className="text-[16px] font-bold text-gray-900">Synchronizing Ledger...</h3>
            <p className="text-[14px] text-gray-500 mt-1">Fetching secure personnel records.</p>
          </div>
        ) : adminTeam.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
              <ShieldAlert className="text-gray-300" size={32} />
            </div>
            <h3 className="text-[16px] font-bold text-gray-900">No Administrators Found</h3>
            <p className="text-[14px] text-gray-500 mt-1">Waiting for initial database synchronization.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="px-8 py-5 font-bold">Personnel Identity</th>
                  <th className="px-8 py-5 font-bold">Clearance Level</th>
                  <th className="px-8 py-5 font-bold">Registration Date</th>
                  <th className="px-8 py-5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {adminTeam.map((admin) => (
                  <tr key={admin.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 font-bold text-[12px] border border-gray-200 shrink-0">
                          {admin.name ? admin.name.substring(0, 2).toUpperCase() : "AD"}
                        </div>
                        <div>
                          <p className="font-bold text-[14px] text-gray-900">{admin.name}</p>
                          <p className="text-[13px] text-gray-500 mt-0.5">{admin.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${admin.role === 'super_admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {admin.role === 'super_admin' ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                        {admin.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-[13px] text-gray-600 font-medium">
                      {new Date(admin.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-8 py-5 text-right space-x-2">
                      
                      {/* 🌟 GUARDED: Edit Button */}
                      <button 
                        onClick={() => executeGuardedAction("Modify Admin Permission", () => handleEditAdmin(admin))}
                        className="p-2 inline-flex items-center justify-center text-gray-400 hover:text-[#111827] hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="Modify Clearance"
                      >
                        <Edit2 size={18} />
                      </button>
                      
                      {/* 🌟 GUARDED: Delete Button */}
                      <button 
                        onClick={() => executeGuardedAction("Revoke Clearance", () => setRevokePrompt({ id: admin.id, name: admin.name, email: admin.email }))}
                        className="p-2 inline-flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Revoke Clearance"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🌟 NEW: THE UNAUTHORIZED ACCESS MODAL */}
      {unauthorizedPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[20px] w-full max-w-[440px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-[#EAEAEA]">
            <div className="p-8">
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-5 border border-amber-100">
                <Lock className="text-amber-600" size={28} />
              </div>
              <h3 className="text-[22px] font-bold text-[#111827] tracking-tight mb-3">Urgent Attention Required</h3>
              <p className="text-[14px] text-gray-600 leading-relaxed">
                Action Restricted: <strong>{unauthorizedPrompt}</strong>. 
                <br /><br />
                You do not have the necessary access permission and privileges to perform this operation. Modifying infrastructure access is strictly restricted to Super Admin protocols. 
                <br /><br />
                If you require access, please reach out to the <strong>Super Admin</strong> for urgent assistance and elevation.
              </p>
            </div>
            
            <div className="p-5 bg-[#FAFAFA] border-t border-[#EAEAEA] flex items-center justify-end">
              <button 
                onClick={() => setUnauthorizedPrompt(null)}
                className="px-6 py-2.5 text-[14px] font-semibold text-white bg-[#111827] hover:bg-black rounded-[10px] transition-colors shadow-sm w-full md:w-auto text-center"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standard Revoke Confirmation Modal */}
      {revokePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[20px] w-full max-w-[420px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-100">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <h3 className="text-[20px] font-bold text-[#111827] tracking-tight mb-2">Revoke Clearance?</h3>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                Are you sure you want to completely revoke infrastructure access for <strong className="text-gray-900">{revokePrompt.name}</strong> ({revokePrompt.email})? They will immediately lose access to the Bingtellar Command Center.
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button 
                onClick={() => setRevokePrompt(null)}
                disabled={isLoading}
                className="px-5 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-200 hover:text-gray-900 rounded-[10px] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRevokeAccess}
                disabled={isLoading}
                className="px-5 py-2.5 text-[14px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-[10px] transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : "Revoke Access"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
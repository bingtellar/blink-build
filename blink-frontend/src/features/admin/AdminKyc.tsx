import { useState, useEffect } from "react";
import { 
  ShieldCheck, CheckCircle2, XCircle, FileText, 
  Loader2, Search, AlertCircle, X, AlertTriangle 
} from "lucide-react";
import { api } from "../../lib/api";

const PRESET_REASONS = [
  "Document is blurry or illegible.",
  "Document has expired.",
  "Name on document does not match account.",
  "Unsupported or invalid document type."
];

export const AdminKyc = () => {
  const [applications, setApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 🌟 NEW: Modal State Management
  const [rejectingUser, setRejectingUser] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchApplications = async () => {
    try {
      const res = await api.get("/admin/kyc-applications");
      setApplications(res.data || []);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch applications", err);
      setError("Failed to sync compliance data. Please check your network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    const interval = setInterval(fetchApplications, 30000); 
    return () => clearInterval(interval);
  }, []);

  // 🌟 UPGRADED: Added support for the custom reason payload
  const handleAction = async (userId: string, action: "approve" | "reject", reason?: string) => {
    setProcessingId(userId);
    try {
      await api.post(`/admin/kyc/${userId}/${action}`, { reason });
      
      // Remove the processed user from the table instantly for snappy UX
      setApplications(prev => prev.filter(app => app.id !== userId));
      
      // Clean up modal state if it was a rejection
      if (action === "reject") {
        setRejectingUser(null);
        setRejectionReason("");
      }
    } catch (err: any) {
      console.error(`Failed to ${action} user`, err);
      alert(err.response?.data?.error || `Failed to ${action} user. Please try again.`);
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (app: any) => {
    setRejectingUser(app);
    setRejectionReason("");
  };

  return (
    <>
      <div className="p-8 lg:p-12 font-sans animate-in fade-in duration-300">
        <div className="max-w-6xl mx-auto">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-[24px] font-bold text-[#1A1A1A] flex items-center gap-3">
                <ShieldCheck className="text-blue-600" size={28} />
                Compliance Center
              </h1>
              <p className="text-[#757575] mt-1 text-[14px]">Review KYC and provision pending account applications.</p>
            </div>
            <div className="bg-white border border-[#E8E8E8] px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm w-full md:w-[300px] focus-within:border-black transition-colors">
              <Search size={16} className="text-gray-400 shrink-0" />
              <input type="text" placeholder="Search applications..." className="bg-transparent border-none outline-none text-[13px] w-full text-[#1A1A1A] placeholder:text-gray-400" />
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-[13px] text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div className="bg-white border border-[#E8E8E8] rounded-[20px] shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-24 flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="animate-spin mb-4 text-[#1A1A1A]" size={32} />
                <p className="font-medium text-[14px] text-[#757575]">Synchronizing Secure Database...</p>
              </div>
            ) : applications.length === 0 ? (
              <div className="p-24 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-5 border border-gray-100">
                  <ShieldCheck className="text-gray-300" size={40} />
                </div>
                <h3 className="text-[18px] font-bold text-[#1A1A1A]">Inbox Zero</h3>
                <p className="text-[#757575] text-[14px] mt-1.5 max-w-sm leading-relaxed">
                  All accounts have been reviewed. There are no pending KYC applications requiring your attention.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#E8E8E8] text-[11px] text-[#757575] uppercase tracking-wider">
                      <th className="px-6 py-5 font-bold">Applicant Identity</th>
                      <th className="px-6 py-5 font-bold">Location</th>
                      <th className="px-6 py-5 font-bold">Submitted Documents</th>
                      <th className="px-6 py-5 font-bold text-right">Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E8E8]">
                    {applications.map((app) => (
                      <tr key={app.id} className="hover:bg-[#FAFAFA] transition-colors">
                        <td className="px-6 py-5">
                          <p className="font-bold text-[#1A1A1A] text-[14px]">
                            {app.businessName || `${app.firstName} ${app.lastName}`}
                          </p>
                          <p className="text-[12px] text-[#757575] mt-0.5">{app.email}</p>
                          {(app.bvn || app.nin) && (
                            <div className="flex gap-2 mt-2.5">
                              {app.bvn && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded flex items-center text-[10px] font-bold border border-blue-100 uppercase tracking-wide">BVN: {app.bvn}</span>}
                              {app.nin && <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded flex items-center text-[10px] font-bold border border-purple-100 uppercase tracking-wide">NIN: {app.nin}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-[13px] font-medium text-[#1A1A1A]">
                          {app.country || "Not provided"}
                        </td>
                        <td className="px-6 py-5">
                          {app.documentUrl ? (
                            <a href={app.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100">
                              <FileText size={16} /> View Attached File
                            </a>
                          ) : (
                            <span className="inline-flex items-center text-[12px] text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                              No Document Attached
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex justify-end gap-2">
                            {processingId === app.id ? (
                              <div className="h-10 px-6 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100">
                                <Loader2 size={18} className="animate-spin text-gray-400" />
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={() => openRejectModal(app)}
                                  className="h-10 w-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                                  title="Reject Application"
                                >
                                  <XCircle size={20} />
                                </button>
                                <button 
                                  onClick={() => handleAction(app.id, "approve")}
                                  className="flex items-center gap-2 h-10 px-4 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 font-bold text-[13px] rounded-xl transition-colors shadow-sm active:scale-[0.98]"
                                >
                                  <CheckCircle2 size={16} /> Approve & Verify
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🌟 NEW: THE CONTEXTUAL REJECTION MODAL */}
      {rejectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={() => !processingId && setRejectingUser(null)} 
          />
          
          <div className="relative w-full max-w-[480px] bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#F0F0EF] bg-[#FAFAFA]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#1A1A1A]">Reject Application</h2>
                  <p className="text-[13px] text-[#757575] mt-0.5">
                    For {rejectingUser.businessName || `${rejectingUser.firstName} ${rejectingUser.lastName}`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => !processingId && setRejectingUser(null)} 
                disabled={processingId === rejectingUser.id}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-[#1A1A1A] rounded-full transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <label className="block text-[13px] font-bold text-[#1A1A1A] mb-3">
                Reason for Rejection
              </label>
              
              {/* Quick Select Pills */}
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_REASONS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setRejectionReason(preset)}
                    className="text-[11px] font-semibold text-[#757575] bg-[#F5F4F0] hover:bg-[#E8E8E8] hover:text-[#1A1A1A] px-3 py-1.5 rounded-full transition-colors border border-transparent active:scale-[0.98]"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Type a specific reason to help the user correct their application..."
                className="w-full h-[120px] bg-[#FAFAFA] border border-[#E8E8E8] rounded-xl px-4 py-3 text-[13px] outline-none focus:border-black focus:bg-white transition-all shadow-inner resize-none"
              />
              <p className="text-[11px] text-[#A3A3A3] mt-2 flex justify-between">
                <span>This will be sent directly to {rejectingUser.email}.</span>
                <span className={rejectionReason.length < 5 ? "text-red-400" : ""}>
                  {rejectionReason.length} chars
                </span>
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t border-[#F0F0EF] bg-white flex items-center justify-end gap-3">
              <button 
                onClick={() => setRejectingUser(null)} 
                disabled={processingId === rejectingUser.id}
                className="px-5 py-2.5 text-[13px] font-bold text-[#757575] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction(rejectingUser.id, "reject", rejectionReason)}
                disabled={rejectionReason.trim().length < 5 || processingId === rejectingUser.id}
                className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-[13px] font-bold shadow-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
              >
                {processingId === rejectingUser.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Reject & Send Email"
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
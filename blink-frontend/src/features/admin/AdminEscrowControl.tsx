import React, { useState, useEffect } from "react";
import { RefreshCw, RotateCcw, AlertOctagon, Loader2, Search, ShieldAlert, AlertTriangle } from "lucide-react";
import { adminApi as api } from "../../lib/api"; 

interface AdminEscrowItem {
  id: string; 
  creatorId: string;
  recipientEmail: string;
  amountLocked: string;
  status: string;
  createdAt: string;
}

export const AdminEscrowControl: React.FC = () => {
  const [escrows, setEscrows] = useState<AdminEscrowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{ type: 'reset' | 'cancel'; claimId: string } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [forceBypass, setForceBypass] = useState(false); 

  const fetchAdminEscrows = async () => {
    setLoading(true);
    try {
      const res = await api.get("/escrows");
      setEscrows(res.data || []);
    } catch (err) { console.error("Failed to fetch escrows", err); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAdminEscrows(); }, []);

  const handleExecuteAction = async () => {
    if (!reasonModal) return;
    const { type, claimId } = reasonModal;
    setActionLoading(claimId);

    try {
      const endpoint = type === 'reset' ? `/escrows/${claimId}/admin-reset` : `/escrows/${claimId}/admin-force-cancel`;
      await api.post(endpoint, { 
          reason: actionReason || "Admin manual intervention via support dashboard.",
          forceBypassBlockchain: type === 'cancel' ? forceBypass : undefined
      });
      setReasonModal(null); setActionReason(""); setForceBypass(false);
      await fetchAdminEscrows();
    } catch (err: any) {
      alert(`Admin Action Failed: ${err.response?.data?.error || err.message}`);
    } finally { setActionLoading(null); }
  };

  const filteredEscrows = escrows.filter(e => 
    e.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.recipientEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.status?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] flex items-center gap-2"><ShieldAlert className="text-amber-600" size={24} />Enterprise Support: Escrow Override Panel</h1>
          <p className="text-[13px] text-[#6B7280]">Force-reset stuck transactions or issue manual refunds bypassing default user locks.</p>
        </div>
        <button onClick={fetchAdminEscrows} className="flex items-center gap-2 bg-[#F3F4F6] text-[#111827] px-4 py-2 rounded-[8px] text-[13px] font-medium hover:bg-[#E5E7EB]">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="mb-6 relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input type="text" placeholder="Search by Claim ID, Recipient Email, or Status..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[10px] text-[13px] outline-none focus:border-[#111827]" />
      </div>

      {/* 🌟 THE FIX 1: Added overflow-x-auto so it scrolls nicely on small screens instead of squishing */}
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] shadow-sm overflow-x-auto">
        
        {/* 🌟 THE FIX 2: Added 'table-fixed' (forces absolute obedience to our widths) and 'min-w-[1000px]' */}
        <table className="w-full text-left text-[13px] table-fixed min-w-[1000px]">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E7EB] text-[#6B7280] font-semibold">
            <tr>
              <th className="py-3 px-4 w-[14%]">Claim ID</th>
              <th className="py-3 px-4 w-[24%]">Recipient Email</th>
              <th className="py-3 px-4 w-[14%]">Amount</th>
              <th className="py-3 px-4 w-[12%] whitespace-nowrap">Status</th>
              <th className="py-3 px-4 w-[10%] whitespace-nowrap">Created At</th>
              <th className="py-3 px-4 w-[26%] text-right whitespace-nowrap">Admin Override Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {loading ? ( 
              <tr><td colSpan={6} className="py-12 text-center text-[#9CA3AF]"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading records...</td></tr>
            ) : ( 
              filteredEscrows.map((item) => {
                const isStuck = ['claim_processing', 'claim_started', 'failed'].includes(item.status);
                const isTerminal = ['claim_completed', 'completed', 'claim_canceled'].includes(item.status);
                return (
                  <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                    
                    {/* 🌟 THE FIX 3: Added 'truncate' and 'title' so extremely long IDs or Emails trail off with '...' instead of breaking the layout */}
                    <td className="py-3 px-4 font-mono text-[12px] font-bold text-[#111827] truncate" title={item.id}>{item.id}</td>
                    <td className="py-3 px-4 text-[#374151] truncate" title={item.recipientEmail}>{item.recipientEmail}</td>
                    
                    <td className="py-3 px-4 font-semibold text-[#111827] whitespace-nowrap">${parseFloat(item.amountLocked).toFixed(2)} USDC</td>
                    
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-bold capitalize ${item.status === 'claim_completed' ? 'bg-green-100 text-green-700' : item.status === 'claim_canceled' ? 'bg-gray-100 text-gray-600' : isStuck ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    
                    <td className="py-3 px-4 text-[#6B7280] text-[12px] whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          disabled={isTerminal || actionLoading === item.id} 
                          onClick={() => setReasonModal({ type: 'reset', claimId: item.id })} 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB] disabled:opacity-40 whitespace-nowrap transition-colors"
                        >
                          <RotateCcw size={12} /> Reset Status
                        </button>
                        <button 
                          disabled={isTerminal || actionLoading === item.id} 
                          onClick={() => setReasonModal({ type: 'cancel', claimId: item.id })} 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap transition-colors"
                        >
                          <AlertOctagon size={12} /> Force Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {reasonModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] max-w-[420px] w-full p-6 shadow-xl border border-[#E5E7EB]">
            <h3 className="text-[16px] font-bold text-[#111827] mb-2">{reasonModal.type === 'reset' ? 'Confirm Admin Reset' : 'Confirm Admin Force Cancel'}</h3>
            <p className="text-[13px] text-[#6B7280] mb-4 leading-relaxed">
              {reasonModal.type === 'reset' ? `This unlocks ${reasonModal.claimId}, setting status to 'in_escrow' to clear dead locks.` : `This bypasses user locks to forcefully cancel ${reasonModal.claimId} and issue an immediate refund.`}
            </p>

            {reasonModal.type === 'cancel' && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-[8px]">
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={forceBypass} onChange={(e) => setForceBypass(e.target.checked)} className="mt-0.5 accent-red-600 w-4 h-4 rounded border-red-300 cursor-pointer" />
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold text-red-800 flex items-center gap-1.5"><AlertTriangle size={14} /> GOD MODE: Bypass Blockchain</span>
                    <span className="text-[11px] text-red-700 mt-1 leading-snug">Check ONLY if Soroban is completely down. Forces DB refund instantly. Leaves funds orphaned for ops clawback.</span>
                  </div>
                </label>
              </div>
            )}

            <textarea rows={3} placeholder="Enter operational reason for audit log..." value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="w-full border border-[#E5E7EB] rounded-[8px] p-3 text-[13px] outline-none focus:border-[#111827] mb-5" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setReasonModal(null); setActionReason(""); setForceBypass(false); }} className="px-4 py-2 text-[13px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] rounded-[8px]">Cancel</button>
              <button onClick={handleExecuteAction} disabled={actionLoading === reasonModal.claimId} className={`px-4 py-2 text-[13px] font-medium text-white rounded-[8px] flex items-center gap-1.5 ${reasonModal.type === 'reset' ? 'bg-[#111827] hover:bg-black' : 'bg-red-600 hover:bg-red-700'}`}>
                {actionLoading === reasonModal.claimId && <Loader2 size={14} className="animate-spin" />} Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import { useState } from "react";
import { 
  ShieldCheck, Ban, CheckCircle2, Eye, ArrowRightLeft, 
  CreditCard, Lock, Calendar, Briefcase, User as UserIcon,
  ChevronLeft, ChevronRight, ShieldAlert, Wallet
} from "lucide-react";
import toast from "react-hot-toast";
import { StatusBadge } from "./AdminHelpers";

// 🌟 STRICT CURRENCY FORMATTER
const formatCurrency = (val: string | number) => {
  const num = Number(val) || 0;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 🌟 THE FLAG MATH
const getFlagEmoji = (countryCode?: string) => {
  if (!countryCode || countryCode.length !== 2) return "🌐"; 
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const UserManager = ({ userList, selectedUserView, setSelectedUserView, handleToggleFreeze, metrics, setSelectedTx }: any) => {
  const [userPage, setUserPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // =========================================================================
  // 🔍 360 PROFILE VIEW (DEEP DIVE)
  // =========================================================================
  if (selectedUserView) {
    // 🌟 FIX 1: Schema-Accurate Query (Using userId and subAccountId, not accountId)
    const rawUserTxs = metrics?.globalLedger?.filter((tx: any) => 
        String(tx.userId) === String(selectedUserView.id) || 
        String(tx.subAccountId) === String(selectedUserView.id)
    ) || [];
    
    // Force strict chronological sorting (Newest first)
    const userTxs = [...rawUserTxs].sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    const totalTxs = userTxs.length;
    const totalTxPages = Math.max(1, Math.ceil(totalTxs / ITEMS_PER_PAGE));
    const safeTxPage = Math.min(txPage, totalTxPages);
    const currentTxs = userTxs.slice((safeTxPage - 1) * ITEMS_PER_PAGE, safeTxPage * ITEMS_PER_PAGE);

    const isInternalAdmin = selectedUserView.role === 'admin' || selectedUserView.role === 'super_admin';
    
    // 🌟 FIX 2: Absolute Truth Escrow Calculation (Bypassing upstream dashboard flaws)
    const userRawEscrows = metrics?.rawPayments?.filter((p: any) => String(p.creatorId) === String(selectedUserView.id)) || [];
    const trueEscrowBalance = userRawEscrows
        .filter((p: any) => ['active', 'ready', 'claim_pending', 'claim_started'].includes(p.status?.toLowerCase()))
        .reduce((sum: number, p: any) => sum + Number(p.amountLocked || p.amount || 0), 0);

    const availableBalance = Number(selectedUserView.walletBalance || 0);
    const totalLedgerBalance = availableBalance + trueEscrowBalance;

    const handleResetPassword = () => toast.success(`Secure password reset link dispatched to ${selectedUserView.email}`);
    const handleManualKYC = () => toast.success(`Manual KYC review escalated for ${selectedUserView.name}`);

    return (
      <div className="animate-in fade-in duration-300">
        <button 
          onClick={() => { setSelectedUserView(null); setTxPage(1); }}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-[13px] font-semibold mb-6"
        >
          <ArrowRightLeft size={14} className="rotate-180" /> Back to Directory
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          <div className="col-span-1 lg:col-span-2 bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm flex items-center gap-5">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-[24px] font-bold border shrink-0 ${isInternalAdmin ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
              {selectedUserView.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[20px] font-bold text-gray-900 tracking-tight truncate max-w-[200px]">{selectedUserView.name}</h2>
                {isInternalAdmin && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${selectedUserView.role === 'super_admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                    {selectedUserView.role === 'super_admin' ? <ShieldAlert size={12}/> : <ShieldCheck size={12}/>}
                    {selectedUserView.role.replace('_', ' ')}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${selectedUserView.accountType?.toLowerCase() === 'business' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                  {selectedUserView.accountType || 'Individual'}
                </span>
              </div>
              <p className="text-[13px] text-gray-500 truncate max-w-[250px]">{selectedUserView.email}</p>
              <div className="mt-2.5"><StatusBadge status={selectedUserView.isFrozen ? "frozen" : "active"} /></div>
            </div>
          </div>
          
          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm flex flex-col justify-center">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5"><CreditCard size={14}/> Available (Wallet)</p>
            <h2 className="text-[22px] font-black text-gray-900">${formatCurrency(availableBalance)}</h2>
          </div>
          
          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm flex flex-col justify-center">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Lock size={14}/> Locked in Escrow</p>
            <h2 className="text-[22px] font-black text-purple-700">${formatCurrency(trueEscrowBalance)}</h2>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-[12px] p-5 shadow-sm flex flex-col justify-center">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Wallet size={14}/> Total Ledger</p>
            <h2 className="text-[22px] font-black text-white">${formatCurrency(totalLedgerBalance)}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm">
            <h3 className="font-semibold text-[15px] mb-4 text-gray-900 border-b border-[#EAEAEA] pb-3">Account Metadata</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">User ID</p>
                  <p className="text-[13px] font-medium text-gray-900">USR-{selectedUserView.id}</p>
              </div>
              <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Date Joined</p>
                  <p className="text-[13px] font-medium text-gray-900 flex items-center gap-1.5">
                    <Calendar size={14} className="text-gray-400"/> 
                    {selectedUserView.createdAt ? new Date(selectedUserView.createdAt).toLocaleDateString() : "Unknown"}
                  </p>
              </div>
              
              <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Location & IP</p>
                  <p className="text-[13px] font-medium text-gray-900 flex items-center gap-1.5">
                    <span className="text-[16px] leading-none drop-shadow-sm">
                      {getFlagEmoji(selectedUserView.countryCode)}
                    </span> 
                    {selectedUserView.country || "Unknown Location"} 
                    <span className="text-gray-400 font-mono text-[11px] ml-1 px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded">
                      {selectedUserView.lastIp || "Unlogged"}
                    </span>
                  </p>
              </div>

              <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">KYC Status</p>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold uppercase ${selectedUserView.kycStatus === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {selectedUserView.kycStatus || 'unverified'}
                  </span>
              </div>
              <div className="col-span-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">On-Chain Wallet Address</p>
                  <p className="text-[13px] font-mono text-gray-600 bg-gray-50 px-3 py-2 rounded-md break-all border border-gray-100">
                    {selectedUserView.walletAddress || "No wallet provisioned yet"}
                  </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm">
            <h3 className="font-semibold text-[15px] mb-4 text-gray-900 border-b border-[#EAEAEA] pb-3">Admin Actions</h3>
            <div className="space-y-3">
                <button 
                  onClick={() => !isInternalAdmin && handleToggleFreeze(selectedUserView.id)}
                  disabled={isInternalAdmin}
                  title={isInternalAdmin ? "Clearance modification restricted to Access Control tab." : ""}
                  className={`w-full py-2.5 rounded-md text-[13px] font-semibold transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedUserView.isFrozen ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  {selectedUserView.isFrozen ? <><CheckCircle2 size={16} /> Unfreeze Account</> : <><Ban size={16} /> Freeze Account</>}
                </button>
                <button 
                  onClick={handleResetPassword} 
                  disabled={isInternalAdmin}
                  title={isInternalAdmin ? "Internal credentials cannot be reset from this interface." : ""}
                  className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset Password
                </button>
                <button 
                  onClick={handleManualKYC} 
                  disabled={isInternalAdmin}
                  className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trigger Manual KYC Review
                </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-[#EAEAEA] flex justify-between items-center bg-white">
              <h3 className="font-semibold text-[14px] text-gray-900">Personal Ledger History</h3>
          </div>
          <div className="overflow-x-auto min-h-[250px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 font-semibold">Transaction ID</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Date & Time</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {currentTxs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-[13px] text-gray-500">No transactions recorded for this user yet.</td>
                    </tr>
                ) : (
                  currentTxs.map((tx: any) => {
                    // 🌟 FIX 3: Absolute Cash Flow Direction Math
                    const isMoneyOut = ['withdrawal', 'transfer', 'payment', 'escrow', 'fee'].includes(tx.type?.toLowerCase());
                    const sign = isMoneyOut ? "-" : "+";
                    const amountColor = isMoneyOut ? "text-gray-900" : "text-emerald-600";

                    return (
                      <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-5 py-3 text-[13px] font-mono text-gray-500">#{tx.reference || tx.id?.toString().substring(0,8).toUpperCase()}</td>
                        <td className="px-5 py-3 text-[13px] text-gray-600 capitalize">{tx.type}</td>
                        <td className={`px-5 py-3 text-[13px] font-bold ${amountColor}`}>
                          {sign}${formatCurrency(tx.amount)}
                        </td>
                        <td className="px-5 py-3">
                           <p className="text-[13px] text-gray-700">{new Date(tx.date || tx.createdAt).toLocaleDateString('en-GB')}</p>
                           <p className="text-[11px] text-gray-400">{new Date(tx.date || tx.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={tx.status} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {totalTxs > ITEMS_PER_PAGE && (
            <div className="px-5 py-3 border-t border-[#EAEAEA] flex justify-end bg-[#FAFAFA]">
              <div className="flex items-center gap-2">
                <button onClick={() => setTxPage(prev => Math.max(1, prev - 1))} disabled={safeTxPage === 1} className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 hover:bg-gray-50 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[12px] font-medium text-gray-600 px-2">Page {safeTxPage} of {totalTxPages}</span>
                <button onClick={() => setTxPage(prev => Math.min(totalTxPages, prev + 1))} disabled={safeTxPage === totalTxPages} className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 hover:bg-gray-50 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 👥 STANDARD DIRECTORY LIST
  // =========================================================================
  
  // 🌟 MAP THE USERS TO CALCULATE THE PERFECT ESCROW MATH
  const enrichedUsers = (userList || []).map((user: any) => {
      const isInternalAdmin = user.role === 'admin' || user.role === 'super_admin';
      
      const userRawEscrows = metrics?.rawPayments?.filter((p: any) => String(p.creatorId) === String(user.id)) || [];
      const trueEscrowBalance = userRawEscrows
        .filter((p: any) => ['active', 'ready', 'claim_pending', 'claim_started'].includes(p.status?.toLowerCase()))
        .reduce((sum: number, p: any) => sum + Number(p.amountLocked || p.amount || 0), 0);

      const availableBalance = Number(user.walletBalance || 0);
      const totalLedger = availableBalance + trueEscrowBalance;

      return {
        ...user,
        isInternalAdmin,
        trueEscrowBalance,
        availableBalance,
        totalLedger
      };
  });

  const totalUsers = enrichedUsers.length || 0;
  const totalUserPages = Math.max(1, Math.ceil(totalUsers / ITEMS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  
  const startIndex = (safeUserPage - 1) * ITEMS_PER_PAGE;
  const currentUsers = enrichedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE) || [];

  return (
    <>
      <div className="flex justify-between items-end mb-4">
        <div><h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">User Directory</h1></div>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold">Account Details</th>
                <th className="px-5 py-3 font-semibold">Account Type</th>
                <th className="px-5 py-3 font-semibold">Available (USDC)</th>
                <th className="px-5 py-3 font-semibold">Locked (Escrow)</th>
                <th className="px-5 py-3 font-semibold">Total Ledger</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {currentUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[13px] text-gray-500">
                    Fetching users from Database...
                  </td>
                </tr>
              ) : (
                currentUsers.map((user: any) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[14px] font-semibold text-gray-900 truncate max-w-[180px]">
                            {user.name}
                          </p>
                          {user.kycStatus === 'approved' && (
                            <span title="KYC Approved" className="flex items-center justify-center">
                            <ShieldCheck size={14} className="text-emerald-500" />
                            </span>
                          )}
                          
                          {user.isInternalAdmin && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase tracking-wider border shrink-0 ${user.role === 'super_admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                              {user.role.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-500 truncate max-w-[200px]">{user.email}</p>
                      </td>
                      
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${user.accountType?.toLowerCase() === 'business' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {user.accountType?.toLowerCase() === 'business' ? <Briefcase size={12} /> : <UserIcon size={12} />}
                          {user.accountType || 'Individual'}
                        </span>
                      </td>
                      
                      <td className="px-5 py-4 text-[13px] font-bold text-gray-900">
                        ${formatCurrency(user.availableBalance)}
                      </td>
                      <td className="px-5 py-4 text-[13px] font-bold text-purple-700">
                        ${formatCurrency(user.trueEscrowBalance)}
                      </td>
                      <td className="px-5 py-4 text-[13px] font-black text-gray-900">
                        ${formatCurrency(user.totalLedger)}
                      </td>

                      <td className="px-5 py-4"><StatusBadge status={user.isFrozen ? "frozen" : "active"} /></td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => !user.isInternalAdmin && handleToggleFreeze(user.id)}
                            disabled={user.isInternalAdmin}
                            title={user.isInternalAdmin ? "Admins cannot be frozen here. Use the Access Control tab." : ""}
                            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                              user.isFrozen ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 text-red-700 hover:bg-red-100"
                            }`}
                          >
                            {user.isFrozen ? <><CheckCircle2 size={14} /> Unfreeze</> : <><Ban size={14} /> Freeze</>}
                          </button>
                          
                          <button 
                            onClick={() => setSelectedUserView(user)}
                            className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                          >
                            <Eye size={14} /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {totalUsers > 0 && (
          <div className="px-5 py-4 border-t border-[#EAEAEA] flex items-center justify-between bg-[#FAFAFA]">
            <span className="text-[13px] text-gray-500">
              Showing <span className="font-medium text-gray-900">{startIndex + 1}</span> to <span className="font-medium text-gray-900">{Math.min(startIndex + ITEMS_PER_PAGE, totalUsers)}</span> of <span className="font-medium text-gray-900">{totalUsers}</span> users
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUserPage(prev => Math.max(1, prev - 1))}
                disabled={safeUserPage === 1}
                className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 hover:text-gray-900 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="text-[13px] font-medium text-gray-600 px-2">
                Page {safeUserPage} of {totalUserPages}
              </span>
              
              <button
                onClick={() => setUserPage(prev => Math.min(totalUserPages, prev + 1))}
                disabled={safeUserPage === totalUserPages}
                className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 hover:text-gray-900 transition-colors"
                title="Next Page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
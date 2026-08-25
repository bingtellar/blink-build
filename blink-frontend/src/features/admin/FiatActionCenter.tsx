import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, Loader2, Eye, X, Copy, ExternalLink, ArrowRightLeft, Wallet, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../../store/useStore"; 
import { TransactionRecord, UserRecord } from "./AdminDashboard";

interface FiatActionCenterProps {
  activeTab: 'Deposits' | 'Withdrawals';
  transactions: TransactionRecord[];
  pendingTxs: TransactionRecord[];
  userList: UserRecord[];
  targetTx?: TransactionRecord;
  clearTarget?: () => void;
}

// 🌟 FIX: STRICT DB RESOLUTION
// Reads exactly what is recorded in the DB with zero fallback assumptions.
const resolveFiatValue = (tx: any) => {
    if (tx.fiatAmount !== null && tx.fiatAmount !== undefined && String(tx.fiatAmount).trim() !== "") {
        return { 
            value: Number(tx.fiatAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
            currency: tx.fiatCurrency || '', 
            hasData: true 
        };
    }
    return { value: "N/A", currency: "", hasData: false };
};

export const FiatActionCenter = ({ activeTab, transactions, pendingTxs, userList = [], targetTx, clearTarget }: FiatActionCenterProps) => {
  const [subTab, setSubTab] = useState<'pending' | 'completed'>('pending');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const globalTransactions = useStore((state: any) => state.transactions) || [];

  useEffect(() => {
      if (!targetTx) return; 

      const isMatchingDeposit = activeTab === 'Deposits' && targetTx.type === 'deposit';
      const isMatchingWithdrawal = activeTab === 'Withdrawals' && targetTx.type === 'withdrawal';

      if (isMatchingDeposit || isMatchingWithdrawal) {
          setSelectedTx(targetTx);
          if (['completed', 'success', 'failed'].includes(targetTx.status?.toLowerCase() || '')) {
              setSubTab('completed');
          } else {
              setSubTab('pending');
          }
          if (clearTarget) clearTarget(); 
      }
  }, [targetTx, activeTab, clearTarget]);

  useEffect(() => {
    setCurrentPage(1);
  }, [subTab, activeTab]);

  const liveAllData = useMemo(() => {
    const allData = (transactions && transactions.length > 0) ? transactions : (pendingTxs || []);
    return allData.map((tx: any) => {
      const fresh = globalTransactions.find((t: any) => String(t.id) === String(tx.id));
      return fresh ? { ...tx, ...fresh } : tx;
    });
  }, [transactions, pendingTxs, globalTransactions]);

  const targetType = activeTab === 'Deposits' ? 'deposit' : 'withdrawal';

  const filteredTxs = useMemo(() => {
      return liveAllData.filter((tx: any) => {
        const matchesType = tx.type?.toLowerCase() === targetType;
        const status = tx.status?.toLowerCase() || '';
        const matchesStatus = subTab === 'pending' 
            ? (status === 'pending' || status === 'processing') 
            : (status === 'completed' || status === 'success' || status === 'failed');
        return matchesType && matchesStatus;
      });
  }, [liveAllData, targetType, subTab]);

  const totalTxs = filteredTxs.length;
  const totalPages = Math.max(1, Math.ceil(totalTxs / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const currentTxs = filteredTxs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const liveSelectedTx = useMemo(() => {
    if (!selectedTx) return null;
    const fresh = liveAllData.find((t: any) => String(t.id) === String(selectedTx.id));
    return fresh ? { ...selectedTx, ...fresh } : selectedTx;
  }, [selectedTx, liveAllData]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderTxDetails = () => {
    if (!liveSelectedTx) return null;

    let parsedNote: any = null;
    try {
      if (liveSelectedTx.note && liveSelectedTx.note.startsWith('{')) {
        parsedNote = JSON.parse(liveSelectedTx.note);
      }
    } catch (e) {
      console.error("Failed to parse transaction note JSON", e);
    }

    const realTxHash = liveSelectedTx.hash || liveSelectedTx.txHash;
    const isSuccess = liveSelectedTx.status?.toLowerCase() === 'completed' || liveSelectedTx.status?.toLowerCase() === 'success';
    const isFailed = liveSelectedTx.status?.toLowerCase() === 'failed';

    const txUser = userList.find((u: any) => String(u.id) === String(liveSelectedTx.accountId || liveSelectedTx.userId));
    const destWallet = txUser?.walletAddress || "⚠️ Address not found in user registry";
    
    // 🌟 FIX: Strictly resolve what is in the DB
    const fiatData = resolveFiatValue(liveSelectedTx);

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm transition-opacity animate-in fade-in duration-300">
        <div className="w-[450px] bg-white h-full shadow-2xl flex flex-col border-l border-[#EAEAEA] animate-in slide-in-from-right duration-300">
          
          <div className="px-6 py-4 border-b border-[#EAEAEA] flex justify-between items-center bg-[#FAFAFA]">
            <h3 className="font-semibold text-[15px] text-gray-900 flex items-center gap-2">
              <Activity size={16} className="text-blue-600" />
              Autonomous Ledger Data
            </h3>
            <button onClick={() => setSelectedTx(null)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-200 transition-colors"><X size={18}/></button>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            
            <div className="text-center pb-6 border-b border-[#EAEAEA]">
                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors duration-500 ${isSuccess ? 'bg-emerald-100 text-emerald-600' : isFailed ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                    {!isSuccess && !isFailed ? <Loader2 size={20} className="animate-spin" /> : <ArrowRightLeft size={20} />}
                </div>
                <h2 className="text-[32px] font-bold text-gray-900 tracking-tight">
                    ${Number(liveSelectedTx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </h2>
                
                {/* 🌟 FIX: Render absolute DB truth in the modal */}
                <p className="text-[13px] font-medium text-gray-500 mt-1 flex items-center justify-center gap-1.5">
                    {fiatData.hasData ? `≈ ${fiatData.value} ${fiatData.currency}` : <span className="italic text-gray-400">Fiat amount unrecorded</span>}
                </p>

                <div className="mt-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors duration-500 ${isSuccess ? 'bg-emerald-50 text-emerald-700' : isFailed ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                        {liveSelectedTx.status}
                    </span>
                </div>
            </div>

            {targetType === 'deposit' && (
                <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Wallet size={14}/> Blockchain Destination</h4>
                    <div className="bg-[#F0F7FF] rounded-[12px] p-4 border border-[#D0E2FF] space-y-4 shadow-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-[12px] text-[#4B5563] font-medium">Target Network</span>
                            <span className="text-[12px] font-bold text-[#1E3A8A] bg-white px-2.5 py-1 rounded-md border border-[#D0E2FF] shadow-sm">
                                Stellar (Soroban)
                            </span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[12px] text-[#4B5563] font-medium">User Wallet Address</span>
                                <button 
                                    onClick={() => handleCopy(destWallet)} 
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#2775CA] hover:text-[#1E3A8A] bg-white px-2.5 py-1 rounded-md border border-[#D0E2FF] shadow-sm transition-colors active:scale-95"
                                >
                                    <Copy size={12}/> Copy
                                </button>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-[#D0E2FF] font-mono text-[12px] text-gray-800 break-all select-all shadow-inner">
                                {destWallet}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Core Identifiers</h4>
                <div className="bg-[#FAFAFA] rounded-[12px] p-4 space-y-3 border border-[#EAEAEA]">
                    
                    <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-500">Transaction ID</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-mono font-medium text-gray-900">{liveSelectedTx.reference || liveSelectedTx.id}</span>
                            <button onClick={() => handleCopy(liveSelectedTx.reference || liveSelectedTx.id)} className="text-gray-400 hover:text-gray-900" title="Copy"><Copy size={12}/></button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-500">Internal DB Trace</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-mono text-gray-400">{liveSelectedTx.id}</span>
                            <button onClick={() => handleCopy(liveSelectedTx.id)} className="text-gray-400 hover:text-gray-900" title="Copy"><Copy size={12}/></button>
                        </div>
                    </div>

                    {realTxHash && (
                        <div className="flex justify-between items-center">
                            <span className="text-[12px] text-gray-500">Blockchain Hash</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-mono font-medium text-gray-900">{realTxHash.substring(0,8)}...{realTxHash.substring(realTxHash.length-6)}</span>
            
                            {/* Dynamic Network Routing based on Vite Environment */}
                            <a 
                                href={`https://stellar.expert/explorer/${import.meta.env.PROD ? 'public' : 'testnet'}/tx/${realTxHash}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-blue-500 hover:text-blue-700" 
                                title="View on Block Explorer"
                            >
                                <ExternalLink size={12}/>
                            </a>
                        </div>
                    </div>
                )}
                    <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-500">User Account ID</span>
                        <span className="text-[13px] font-medium text-gray-900">{liveSelectedTx.accountId || liveSelectedTx.userId}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-500">Timestamp</span>
                        <span className="text-[13px] font-medium text-gray-900">{new Date(liveSelectedTx.date || liveSelectedTx.createdAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    {targetType === 'deposit' ? 'User Deposit Instructions Given' : 'User Bank Destination Details'}
                </h4>
                <div className="bg-[#FAFAFA] rounded-[12px] p-4 space-y-3 border border-[#EAEAEA]">
                    {targetType === 'withdrawal' && liveSelectedTx?.metadata?.recipientDetails ? (
                        <>
                          <div className="flex justify-between items-start gap-4 py-1">
                              <span className="text-[12px] text-gray-500">Bank Name</span>
                              <span className="text-[13px] font-medium text-gray-900 text-right">{liveSelectedTx.metadata.recipientDetails.bankName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-start gap-4 py-1">
                              <span className="text-[12px] text-gray-500">Account Number</span>
                              <span className="text-[13px] font-medium text-gray-900 text-right">{liveSelectedTx.metadata.recipientDetails.accountNumber || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-start gap-4 py-1">
                              <span className="text-[12px] text-gray-500">Account Name</span>
                              <span className="text-[13px] font-medium text-gray-900 text-right">{liveSelectedTx.metadata.recipientDetails.accountName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-start gap-4 py-2 border-t border-[#EAEAEA] mt-2">
                                <span className="text-[12px] text-gray-500 whitespace-nowrap">User Note</span>
    
                                <div className="w-full max-w-[75%] text-[13px] text-gray-900 text-right">
                                    {parsedNote && typeof parsedNote === 'object' ? (
                                        <div className="flex flex-col gap-2 text-left bg-red-50 text-red-800 p-3 rounded-md border border-red-100 w-full overflow-hidden mt-1 shadow-sm">
                                            {parsedNote.reason && (
                                                <div>
                                                    <span className="font-semibold block text-[10px] uppercase tracking-wider text-red-600">Rejection Reason</span>
                                                    <span className="break-words leading-tight">{parsedNote.reason}</span>
                                                </div>
                                            )}
                                            {parsedNote.refundTx && (
                                                <div className="mt-1">
                                                    <span className="font-semibold block text-[10px] uppercase tracking-wider text-red-600">Refund Hash</span>
                                                    <a 
                                                        href={`https://stellar.expert/explorer/${import.meta.env.PROD ? 'public' : 'testnet'}/tx/${parsedNote.refundTx}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="break-all text-[10px] font-mono text-red-900 hover:text-blue-600 underline decoration-red-200 hover:decoration-blue-400 transition-colors"
                                                        title="View Refund on Block Explorer"
                                                    >
                                                        {parsedNote.refundTx}
                                                    </a>
                                                </div>
                                            )}
                                            {parsedNote.originalTx && (
                                                <div className="mt-1">
                                                    <span className="font-semibold block text-[10px] uppercase tracking-wider text-red-600">Original Hash</span>
                                                    <a 
                                                        href={`https://stellar.expert/explorer/${import.meta.env.PROD ? 'public' : 'testnet'}/tx/${parsedNote.originalTx}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="break-all text-[10px] font-mono text-red-900 hover:text-blue-600 underline decoration-red-200 hover:decoration-blue-400 transition-colors"
                                                        title="View Original Tx on Block Explorer"
                                                    >
                                                        {parsedNote.originalTx}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="break-words">{liveSelectedTx.note || liveSelectedTx.description || "N/A"}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : parsedNote ? (
                        Object.entries(parsedNote).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-start gap-4 py-1">
                                <span className="text-[12px] text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="text-[13px] font-medium text-gray-900 text-right break-words">{String(value)}</span>
                            </div>
                        ))
                    ) : (
                        <div className="flex justify-between items-start gap-4">
                            <span className="text-[12px] text-gray-500">Note</span>
                            <span className="text-[13px] font-medium text-gray-900 text-right">{liveSelectedTx.note || liveSelectedTx.description || "No specific instructions logged."}</span>
                        </div>
                    )}
                </div>
            </div>

          </div>

          {!isSuccess && !isFailed && (
              <div className="p-4 border-t border-blue-200 bg-blue-50 flex items-start gap-3 animate-in fade-in duration-500">
                  <Loader2 size={18} className="text-blue-600 animate-spin mt-0.5" />
                  <div>
                      <h4 className="text-[13px] font-bold text-blue-900">Awaiting Provider Webhook</h4>
                      <p className="text-[12px] text-blue-700 mt-0.5 leading-snug">
                          The settlement engine is actively monitoring this transaction. It will finalize automatically once the banking provider confirms receipt.
                      </p>
                  </div>
              </div>
          )}

        </div>
      </div>
    );
  };

  return (
    <>
      {renderTxDetails()}

      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">
            {activeTab === 'Deposits' ? 'NGN/USD Deposits' : 'Bank Withdrawals'}
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">Monitor autonomous bank transfers and real-time Web3 settlement.</p>
        </div>
      </div>
      
      <div className="flex gap-6 mb-4 border-b border-[#EAEAEA]">
         <button 
            onClick={() => setSubTab('pending')} 
            className={`pb-3 text-[14px] transition-colors relative ${subTab === 'pending' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium hover:text-gray-700'}`}
         >
            In-Flight Tracking
            {subTab === 'pending' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#111827] rounded-t-full"></span>}
         </button>
         <button 
            onClick={() => setSubTab('completed')} 
            className={`pb-3 text-[14px] transition-colors relative ${subTab === 'completed' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium hover:text-gray-700'}`}
         >
            Settlement Ledger
            {subTab === 'completed' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#111827] rounded-t-full"></span>}
         </button>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold">User Account</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Fiat Amount</th>
                <th className="px-5 py-3 font-semibold">USDC Equivalent</th>
                <th className="px-5 py-3 font-semibold text-right">Status / Details</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
                {currentTxs.map((tx: any) => {
                const isTxSuccess = tx.status?.toLowerCase() === 'completed' || tx.status?.toLowerCase() === 'success';
                const isTxFailed = tx.status?.toLowerCase() === 'failed';
                
                const matchedUser = userList.find(u => String(u.id) === String(tx.accountId || tx.userId));
                const userDisplayName = matchedUser?.name || "Unknown User";
                const userDisplayEmail = matchedUser?.email || tx.accountId || tx.userId;

                // 🌟 FIX: Strictly resolve DB truth for the Table
                const fiatData = resolveFiatValue(tx);

                return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[180px]" title={userDisplayName}>{userDisplayName}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[180px]">{userDisplayEmail}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{new Date(tx.date || tx.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider ${activeTab === 'Deposits' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {tx.type}
                        </span>
                    </td>
                    
                    {/* 🌟 FIX: Render Absolute DB Truth in Table */}
                    <td className="px-5 py-4 text-[13px] font-medium text-gray-500">
                        {fiatData.hasData ? (
                            <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
                                {fiatData.value} {fiatData.currency}
                            </div>
                        ) : (
                            <span className="italic text-gray-400">N/A</span>
                        )}
                    </td>

                    <td className="px-5 py-4 text-[14px] font-bold text-gray-900">
                        ${Number(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4">
                        
                        <div className="flex items-center justify-end gap-3">
                        {!isTxSuccess && !isTxFailed ? (
                            <span className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-bold tracking-wide flex items-center gap-1.5">
                                <Loader2 size={12} className="animate-spin"/> Awaiting Webhook
                            </span>
                        ) : (
                            <span className={`px-3 py-1.5 border rounded-md text-[11px] font-bold tracking-wide transition-colors duration-500 ${isTxFailed ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                {isTxFailed ? 'Failed / Refunded' : 'Settled on Soroban'}
                            </span>
                        )}

                        <button 
                            onClick={() => setSelectedTx(tx)}
                            className="p-1.5 text-gray-400 hover:text-[#111827] hover:bg-gray-100 rounded-md transition-colors"
                            title="View Full Metadata"
                        >
                            <Eye size={18} />
                        </button>
                        </div>

                    </td>
                    </tr>
                )
                })}
                
                {currentTxs.length === 0 && (
                <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                    <CheckCircle2 size={32} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-[14px] font-medium text-gray-900">{subTab === 'pending' ? "All caught up!" : "No history yet"}</p>
                    <p className="text-[13px] text-gray-500 mt-1">
                        {subTab === 'pending' 
                            ? `There are no in-flight ${activeTab.toLowerCase()} waiting for provider settlement.` 
                            : `You have not recorded any autonomous ${activeTab.toLowerCase()} yet.`}
                    </p>
                    </td>
                </tr>
                )}
            </tbody>
            </table>
        </div>

        {totalTxs > ITEMS_PER_PAGE && (
          <div className="px-5 py-4 border-t border-[#EAEAEA] flex items-center justify-between bg-[#FAFAFA]">
            <span className="text-[13px] text-gray-500">
              Showing <span className="font-medium text-gray-900">{startIndex + 1}</span> to <span className="font-medium text-gray-900">{Math.min(startIndex + ITEMS_PER_PAGE, totalTxs)}</span> of <span className="font-medium text-gray-900">{totalTxs}</span> records
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="text-[13px] font-medium text-gray-600 px-2">
                Page {safePage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 hover:text-gray-900 transition-colors"
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
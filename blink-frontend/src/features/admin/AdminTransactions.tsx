import { useState, useMemo } from "react";
import { 
  Search, Download, ArrowUpRight, ArrowDownRight, 
  RefreshCw, MoreHorizontal, Database, Loader2, ArrowDownLeft
} from "lucide-react";
import { TransactionRecord } from "./AdminDashboard";

// --- HELPERS ---
const StatusBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() || "";
  if (['completed', 'successful', 'paid', 'request_paid'].includes(s)) 
    return <span className="text-[#10B981] flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md text-[11px] font-bold border border-emerald-100"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>Completed</span>;
  
  if (['processing'].includes(s)) 
    return <span className="text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md text-[11px] font-bold border border-blue-200"><Loader2 size={10} className="animate-spin" />Processing</span>;
  
  if (['pending', 'request_partially_paid'].includes(s)) 
    return <span className="text-[#F59E0B] flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-md text-[11px] font-bold border border-amber-100"><span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>Pending</span>;
  
  if (['failed', 'cancelled', 'expired', 'request_canceled', 'request_rejected', 'rejected'].includes(s)) 
    return <span className="text-[#EF4444] flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-md text-[11px] font-bold border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>Failed</span>;
  
  return <span className="text-gray-500 flex items-center gap-1.5 capitalize">{status}</span>;
};

const TypeIcon = ({ type }: { type: string }) => {
    const t = type.toLowerCase();
    if (t === 'deposit') return <ArrowDownRight size={14} className="text-emerald-500" />;
    if (t === 'withdrawal') return <ArrowUpRight size={14} className="text-red-500" />;
    
    // 🌟 THE FIX: Replaced <Send /> with <ArrowDownLeft /> 
    if (t === 'request') return <ArrowDownLeft size={14} className="text-orange-500" />;
    
    return <RefreshCw size={14} className="text-indigo-500" />;
};

interface AdminTransactionsProps {
    transactions: TransactionRecord[];
    setSelectedTx: (tx: TransactionRecord) => void;
    handleExportCSV: () => void;
}

export const AdminTransactions = ({ transactions, setSelectedTx, handleExportCSV }: AdminTransactionsProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  // 🌟 FIX: Added 'Request' to the available state types
  const [filterTab, setFilterTab] = useState<'All' | 'Deposit' | 'Withdrawal' | 'Transfer' | 'Request'>('All');

  const displayedTransactions = useMemo(() => {
    return transactions.filter(tx => {
        if (filterTab === 'Deposit' && tx.type.toLowerCase() !== 'deposit') return false;
        if (filterTab === 'Withdrawal' && tx.type.toLowerCase() !== 'withdrawal') return false;
        if (filterTab === 'Transfer' && !['transfer', 'payment'].includes(tx.type.toLowerCase())) return false;
        // 🌟 FIX: Added Request filtering logic
        if (filterTab === 'Request' && tx.type.toLowerCase() !== 'request') return false;

        if (searchTerm) {
            const query = searchTerm.toLowerCase();
            const matchesId = tx.id?.toLowerCase().includes(query);
            const matchesRef = tx.reference?.toLowerCase().includes(query);
            const matchesAmount = String(tx.amount).includes(query);
            if (!matchesId && !matchesRef && !matchesAmount) return false;
        }

        return true;
    });
  }, [transactions, filterTab, searchTerm]);

  return (
    <div className="animate-in fade-in duration-500 space-y-6 pb-20">
      
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-[28px] font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Database size={28} className="text-indigo-600"/> Global Ledger
          </h1>
          <p className="text-[14px] text-gray-500 mt-1">Immutable record of all platform deposits, withdrawals, and internal transfers.</p>
        </div>
        <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-[#EAEAEA] rounded-md text-[13px] font-bold text-gray-700 shadow-sm flex items-center gap-2 hover:bg-gray-50 transition-colors">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto">
            {/* 🌟 FIX: Injected 'Request' into the mapped tab array */}
            {['All', 'Deposit', 'Withdrawal', 'Transfer', 'Request'].map(tab => (
              <button 
                key={tab}
                onClick={() => setFilterTab(tab as any)}
                className={`flex-1 md:flex-none px-5 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterTab === tab ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {tab}
              </button>
            ))}
         </div>

         <div className="relative w-full md:w-[320px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by ID, Reference, or Amount..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-medium focus:outline-none focus:border-indigo-500 transition-colors"
            />
         </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-[14px] text-gray-900">Transaction History</h3>
          <span className="text-[12px] font-medium text-gray-500">{displayedTransactions.length} records found</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white border-b text-[10px] text-gray-400 uppercase font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Transaction ID</th>
                <th className="px-6 py-4">Date & Time</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Internal Trace</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-[#FAFAFA]">
              {displayedTransactions.length === 0 ? (
                 <tr>
                   <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-mono text-[12px]">
                     No transactions match your current filters.
                   </td>
                 </tr>
              ) : (
                 displayedTransactions.map((tx, idx) => (
                   <tr key={idx} onClick={() => setSelectedTx(tx)} className="group hover:bg-indigo-50/40 cursor-pointer transition-all">
                     <td className="px-6 py-4 font-mono text-[12px] text-indigo-600 font-medium">
                       {tx.reference || (tx.id.length > 15 ? tx.id.substring(0, 14) + "..." : tx.id)}
                     </td>
                     <td className="px-6 py-4">
                        <p className="text-[13px] font-bold text-gray-800">{new Date(tx.date || tx.createdAt || new Date()).toLocaleDateString('en-GB')}</p>
                        <p className="text-[11px] text-gray-400">{new Date(tx.date || tx.createdAt || new Date()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                              <TypeIcon type={tx.type} />
                           </div>
                           <span className="text-[12px] font-bold text-gray-700 capitalize">{tx.type}</span>
                        </div>
                     </td>
                     
                     <td className="px-6 py-4">
                        <p className="text-[14px] font-black text-gray-900">
                           ${Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {tx.fiatAmount && (
                           <p className="text-[11px] font-bold text-blue-600 mt-0.5">
                              ↳ {Number(tx.fiatAmount).toLocaleString()} {tx.fiatCurrency || 'NGN'}
                           </p>
                        )}
                     </td>

                     <td className="px-6 py-4 font-mono text-[11px] text-gray-400">
                        {tx.id.substring(0, 8)}...
                     </td>
                     <td className="px-6 py-4"><StatusBadge status={tx.status} /></td>
                     <td className="px-6 py-4 text-right">
                        <button className="text-gray-400 group-hover:text-indigo-600 transition-colors">
                           <MoreHorizontal size={16}/>
                        </button>
                     </td>
                   </tr>
                 ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
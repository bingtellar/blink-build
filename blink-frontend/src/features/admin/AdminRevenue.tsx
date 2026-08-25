import { useState, useMemo } from "react";
import { 
  Download, Landmark, TrendingUp, ShieldAlert, 
  ArrowRightLeft, Database, Lock, CheckCircle2
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TransactionRecord, EscrowPayment } from "./AdminDashboard";

// --- FORMATTER HELPERS ---
const formatCurrency = (value: number | string) => {
  const num = Number(value || 0);
  return isNaN(num) ? "0.00" : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface AdminRevenueProps {
    metrics: any; 
    handleExportCSV?: () => void;
}

export const AdminRevenue = ({ metrics, handleExportCSV }: AdminRevenueProps) => {
  const [timeRange, setTimeRange] = useState<'7D' | '30D' | 'ALL'>('7D');
  const [filterTab, setFilterTab] = useState<'All' | 'Escrow' | 'Fiat'>('All');

  // =====================================================================
  // 🌟 THE UNIFIED REVENUE ENGINE
  // =====================================================================
  const unifiedRevenueLedger = useMemo(() => {
    if (!metrics) return [];
    const revenueEvents: any[] = [];

    // 1. Map Fiat Actions (Deposits / Withdrawals)
    const txs: TransactionRecord[] = metrics.globalLedger || [];
    txs.forEach(tx => {
        const fee = Number(tx.fee || 0) + Number(tx.processingFee || 0) + Number(tx.networkFee || 0);
        if (fee > 0) {
            revenueEvents.push({
                id: tx.reference || tx.id,
                dbId: tx.id,
                date: new Date(tx.date || tx.createdAt || new Date()),
                source: tx.type.toLowerCase() === 'deposit' ? 'Deposit Processing' : 'Withdrawal Rail Fee',
                category: 'Fiat',
                amount: fee,
                account: tx.accountId || tx.userId || "N/A"
            });
        }
    });

    // 2. Map Smart Contract Escrow Events
    const escrows: EscrowPayment[] = metrics.rawPayments || [];
    escrows.forEach((escrow: any) => {
        const creationFee = Number(escrow.feeAmount || 0);
        const platformFee = Number(escrow.platformFee || 0);
        const penaltyFee = Number(escrow.penaltyPaid || 0);
        const status = escrow.status?.toLowerCase() || '';

        // Escrow Creation
        if (creationFee > 0) {
            revenueEvents.push({
                id: escrow.claimId || escrow.id,
                dbId: escrow.id,
                date: new Date(escrow.createdAt || escrow.dateCreated || new Date()),
                source: 'Escrow Creation',
                category: 'Escrow',
                amount: creationFee,
                account: escrow.senderEmail || escrow.senderName || "N/A"
            });
        }

        // Successful Claim Processing
        if (platformFee > 0 && ['completed', 'paid', 'successful', 'claim_completed', 'released'].includes(status)) {
            const timeline = escrow.timeline || [];
            const settledDate = timeline.length > 0 ? new Date(timeline[timeline.length - 1].timestamp) : new Date();
            
            revenueEvents.push({
                id: escrow.claimId || escrow.id,
                dbId: escrow.id,
                date: settledDate,
                source: 'Claim Processing',
                category: 'Escrow',
                amount: platformFee,
                account: escrow.recipientEmail || "N/A"
            });
        }

        // Cancellation Penalties
        if (penaltyFee > 0 && ['failed', 'cancelled', 'expired', 'claim_canceled'].includes(status)) {
            const timeline = escrow.timeline || [];
            const cancelledDate = timeline.length > 0 ? new Date(timeline[timeline.length - 1].timestamp) : new Date();

            revenueEvents.push({
                id: escrow.claimId || escrow.id,
                dbId: escrow.id,
                date: cancelledDate,
                source: 'Cancellation Penalty',
                category: 'Escrow',
                amount: penaltyFee,
                account: escrow.senderEmail || "N/A"
            });
        }
    });

    return revenueEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [metrics]);

  // =====================================================================
  // 🌟 DYNAMIC DAILY REVENUE CHARTING
  // =====================================================================
  const chartData = useMemo(() => {
    const days = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : 90;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();

        const dailyEvents = unifiedRevenueLedger.filter(ev => ev.date.toDateString() === dateStr);
        const dailyRevenue = dailyEvents.reduce((sum, ev) => sum + ev.amount, 0);

        data.push({
            name: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: dailyRevenue
        });
    }
    return data;
  }, [unifiedRevenueLedger, timeRange]);

  const displayedLedger = useMemo(() => {
     if (filterTab === 'All') return unifiedRevenueLedger;
     return unifiedRevenueLedger.filter(ev => ev.category === filterTab);
  }, [unifiedRevenueLedger, filterTab]);

  if (!metrics) return null;

  return (
    <div className="animate-in fade-in duration-500 space-y-6 pb-20">
      
      {/* HEADER */}
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-[28px] font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Landmark size={28} className="text-gray-900"/> Platform Revenue
          </h1>
          <p className="text-[14px] text-gray-500 mt-1">Unified accounting ledger for all platform fees, penalties, and network routing cuts.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-[#EAEAEA] rounded-md text-[13px] font-bold text-gray-700 shadow-sm flex items-center gap-2 hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* KPI GRID - Sleek, Minimalist */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 border border-emerald-700 rounded-[12px] p-5 shadow-lg text-white">
  <p className="text-[12px] font-bold text-emerald-300 mb-1 flex items-center gap-1.5 uppercase tracking-wider"><Landmark size={14}/> Total Net Revenue</p>
  <h2 className="text-[28px] font-black tracking-tight">${formatCurrency(metrics.revenue?.totalRevenue || 0)}</h2>
</div>
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-bold text-gray-400 mb-1 flex items-center gap-1.5 uppercase tracking-wider"><ShieldAlert size={14}/> Escrow Fees</p>
          <h2 className="text-[24px] font-bold text-gray-900">${formatCurrency((metrics.revenue?.creationFees || 0) + (metrics.revenue?.claimFees || 0))}</h2>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-bold text-gray-400 mb-1 flex items-center gap-1.5 uppercase tracking-wider"><Lock size={14}/> Cancellations</p>
          <h2 className="text-[24px] font-bold text-gray-900">${formatCurrency(metrics.revenue?.cancellationPenalties || 0)}</h2>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-bold text-gray-400 mb-1 flex items-center gap-1.5 uppercase tracking-wider"><ArrowRightLeft size={14}/> Fiat Routing</p>
          <h2 className="text-[24px] font-bold text-gray-900">${formatCurrency((metrics.extraRevenue?.depositFees || 0) + (metrics.extraRevenue?.withdrawalFees || 0))}</h2>
        </div>
      </div>

      {/* REVENUE CHART */}
      <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm">
        <div className="flex justify-between items-center mb-6">
           <h3 className="font-semibold text-[14px] text-gray-900 flex items-center gap-2"><TrendingUp size={16} className="text-gray-900"/> Revenue Growth</h3>
           <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
               {['7D', '30D', 'ALL'].map(tab => (
                 <button key={tab} onClick={() => setTimeRange(tab as any)} className={`px-4 py-1 rounded-md text-[11px] font-bold transition-all ${timeRange === tab ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-900'}`}>{tab}</button>
               ))}
           </div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs><linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#111827" stopOpacity={0.1}/><stop offset="95%" stopColor="#111827" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} dx={-10} tickFormatter={(value: any) => `$${value.toLocaleString()}`} />
              <Tooltip formatter={(value: any) => `$${formatCurrency(value)}`} contentStyle={{ borderRadius: '8px', border: '1px solid #EAEAEA', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
              <Area type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* UNIFIED ACCOUNTING TABLE */}
      <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-[#FAFAFA]">
          <h3 className="font-bold text-[14px] text-gray-900 flex items-center gap-2"><Database size={16} className="text-gray-400"/> Accounting Ledger</h3>
          
          <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
            {['All', 'Escrow', 'Fiat'].map(tab => (
              <button key={tab} onClick={() => setFilterTab(tab as any)} className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterTab === tab ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-900'}`}>{tab}</button>
            ))}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white border-b text-[10px] text-gray-400 uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Ref ID / DB Trace</th>
                <th className="px-6 py-4">Date Recognized</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Revenue Source</th>
                <th className="px-6 py-4 text-right">Net Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA] bg-white">
              {displayedLedger.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-mono text-[12px]">
                     No revenue events recorded for this category.
                   </td>
                 </tr>
              ) : (
                 displayedLedger.map((ev: any, idx: number) => (
                   <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                     <td className="px-6 py-4">
                        <p className="text-[12px] font-mono font-medium text-gray-900">{ev.id?.substring(0,18)}...</p>
                        <p className="text-[10px] font-mono text-gray-400 mt-0.5">{ev.dbId?.substring(0,8)}</p>
                     </td>
                     <td className="px-6 py-4">
                        <p className="text-[13px] font-medium text-gray-900">{ev.date.toLocaleDateString('en-GB')}</p>
                        <p className="text-[11px] text-gray-400">{ev.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                     </td>
                     <td className="px-6 py-4">
                         <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${ev.category === 'Escrow' ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-700'}`}>
                             {ev.category}
                         </span>
                     </td>
                     <td className="px-6 py-4">
                        <p className="text-[13px] font-medium text-gray-900">{ev.source}</p>
                        <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><CheckCircle2 size={10} /> Routed to Treasury</p>
                     </td>
                     <td className="px-6 py-4 text-right">
                        <span className="text-[14px] font-bold text-gray-900">
                           +${formatCurrency(ev.amount)}
                        </span>
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
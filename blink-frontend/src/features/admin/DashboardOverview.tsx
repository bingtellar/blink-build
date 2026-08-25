import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Activity, Lock, Users, Landmark, Bell, FileText, 
  ChevronLeft, ChevronRight, TrendingUp, ChevronDown, CheckCircle2 
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { StatusBadge } from "./AdminHelpers";
import { useStore } from "../../store/useStore"; 

// --- FORMATTER HELPERS ---
const formatCurrency = (value: number | string) => {
  return Number(value || 0).toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const formatInteger = (value: number | string) => {
  return Number(value || 0).toLocaleString();
};

// =====================================================================
// 🌟 ENTERPRISE UI COMPONENTS & CONFIGURATION
// =====================================================================
const TIME_OPTIONS = [
  { value: '12h', label: 'Last 12 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '60d', label: 'Last 60 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '120d', label: 'Last 120 Days' },
  { value: '365d', label: 'Last 1 Year' }
];

const TimeframeDropdown = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = TIME_OPTIONS.find(o => o.value === value)?.label || 'Select Range';

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white border border-[#EAEAEA] hover:border-gray-300 text-gray-700 text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-all shadow-sm"
      >
        {selectedLabel} <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white border border-[#EAEAEA] rounded-xl shadow-lg z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-[12px] font-medium transition-colors flex items-center justify-between ${value === opt.value ? 'bg-indigo-50/50 text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              {opt.label}
              {value === opt.value && <CheckCircle2 size={14} className="text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 🌟 DYNAMIC CHART AGGREGATION ENGINE
// Groups ledger data independently to prevent unnecessary re-renders
// =====================================================================
const aggregateLedgerData = (txs: any[], timeRange: string) => {
  const now = new Date();
  const data = [];

  const checkSuccess = (s: string) => ['completed', 'successful', 'paid', 'claim_completed', 'released'].includes((s || '').toLowerCase());
  const isMoneyOutType = (t: string) => ['withdrawal', 'transfer', 'payment'].includes((t || '').toLowerCase());

  if (timeRange === '12h') {
      for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 60 * 60 * 1000);
          const hourStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
          const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
          
          const bucketTxs = txs.filter((t: any) => {
              const tDate = new Date(t.date || t.createdAt);
              return tDate >= hourStart && tDate < hourEnd;
          });
          
          const volume = bucketTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
          const moneyOut = bucketTxs.filter((t: any) => isMoneyOutType(t.type) && checkSuccess(t.status))
                                    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
                                    
          data.push({ name: d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }), volume, moneyOut });
      }
  } else if (timeRange === '365d') {
      for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          
          const bucketTxs = txs.filter((t: any) => {
              const tDate = new Date(t.date || t.createdAt);
              return tDate.getFullYear() === d.getFullYear() && tDate.getMonth() === d.getMonth();
          });
          
          const volume = bucketTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
          const moneyOut = bucketTxs.filter((t: any) => isMoneyOutType(t.type) && checkSuccess(t.status))
                                    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

          data.push({ name: d.toLocaleDateString('en-US', { month: 'short' }), volume, moneyOut });
      }
  } else {
      const days = parseInt(timeRange.replace('d', ''));
      for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          
          const bucketTxs = txs.filter((t: any) => {
              const tDate = new Date(t.date || t.createdAt);
              return tDate.getFullYear() === dDate.getFullYear() && 
                     tDate.getMonth() === dDate.getMonth() && 
                     tDate.getDate() === dDate.getDate();
          });
          
          const volume = bucketTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
          const moneyOut = bucketTxs.filter((t: any) => isMoneyOutType(t.type) && checkSuccess(t.status))
                                    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

          const name = days <= 7 
              ? d.toLocaleDateString('en-US', { weekday: 'short' }) 
              : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          data.push({ name, volume, moneyOut });
      }
  }
  return data;
};


export const DashboardOverview = ({ metrics, handleTestNotification, handleExportCSV, setSelectedTx }: any) => {
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // 🌟 INDEPENDENT CHART STATES
  const [volumeTimeRange, setVolumeTimeRange] = useState('7d'); 
  const [moneyOutTimeRange, setMoneyOutTimeRange] = useState('7d');

  const globalTransactions = useStore((state: any) => state.transactions) || [];

  const liveGlobalLedger = useMemo(() => {
    if (!metrics?.globalLedger) return [];
    return metrics.globalLedger.map((tx: any) => {
      const fresh = globalTransactions.find((t: any) => String(t.id) === String(tx.id));
      return fresh ? { ...tx, ...fresh } : tx;
    });
  }, [metrics?.globalLedger, globalTransactions]);

  // 🌟 INDEPENDENT DATA SETS
  const volumeData = useMemo(() => aggregateLedgerData(liveGlobalLedger, volumeTimeRange), [liveGlobalLedger, volumeTimeRange]);
  const moneyOutData = useMemo(() => aggregateLedgerData(liveGlobalLedger, moneyOutTimeRange), [liveGlobalLedger, moneyOutTimeRange]);

  if (!metrics) return null;

  const totalTransactions = liveGlobalLedger.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalTransactions / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  
  const currentTransactions = liveGlobalLedger.slice(startIndex, endIndex) || [];

  const handleNextPage = () => {
    if (safeCurrentPage < totalPages) setCurrentPage(safeCurrentPage + 1);
  };

  const handlePrevPage = () => {
    if (safeCurrentPage > 1) setCurrentPage(safeCurrentPage - 1);
  };

  return (
    <>
      <div className="flex justify-between items-end mb-2">
        <div><h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Platform Metrics</h1></div>
        <div className="flex gap-3">
          <button onClick={handleTestNotification} className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-md text-[13px] font-medium shadow-sm flex items-center gap-2 hover:bg-blue-100 transition-colors">
            <Bell size={14}/> Test Alert
          </button>
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-[13px] font-medium text-gray-700 shadow-sm flex items-center gap-2 hover:bg-gray-50 transition-colors">
            <FileText size={14}/> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50/50 border border-blue-100 rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-semibold text-blue-600 mb-1 flex items-center gap-1.5"><Activity size={14}/> Processed Volume</p>
          <h2 className="text-[24px] font-bold text-blue-900">${formatCurrency(metrics.platform.totalVolume)}</h2>
        </div>
        <div className="bg-purple-50/50 border border-purple-100 rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-semibold text-purple-600 mb-1 flex items-center gap-1.5"><Lock size={14}/> Value Locked (TVL)</p>
          <h2 className="text-[24px] font-bold text-purple-900">${formatCurrency(metrics.platform.activeEscrowVolume)}</h2>
        </div>
        <div className="bg-amber-50/50 border border-amber-100 rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-semibold text-amber-600 mb-1 flex items-center gap-1.5"><Users size={14}/> Registered Accounts</p>
          <h2 className="text-[24px] font-bold text-amber-900">{formatInteger(metrics.platform.totalUsers)}</h2>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-[12px] p-5 shadow-sm">
          <p className="text-[12px] font-semibold text-emerald-600 mb-1 flex items-center gap-1.5"><Landmark size={14}/> Net Platform Revenue</p>
          <h2 className="text-[24px] font-bold text-emerald-900">${formatCurrency(metrics.revenue.totalRevenue)}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm lg:col-span-1">
          <h3 className="font-semibold text-[14px] mb-4 text-gray-900">Revenue Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0"><span className="text-[13px] text-gray-500">Escrow Creation</span><span className="font-medium text-[13px] text-gray-900">${formatCurrency(metrics.revenue.creationFees)}</span></div>
            <div className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0"><span className="text-[13px] text-gray-500">Claim Processing</span><span className="font-medium text-[13px] text-gray-900">${formatCurrency(metrics.revenue.claimFees)}</span></div>
            <div className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0"><span className="text-[13px] text-gray-500">Cancellations</span><span className="font-medium text-[13px] text-gray-900">${formatCurrency(metrics.revenue.cancellationPenalties)}</span></div>
            <div className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0"><span className="text-[13px] text-gray-500">Withdrawal Fees</span><span className="font-medium text-[13px] text-gray-900">${formatCurrency(metrics.extraRevenue.withdrawalFees)}</span></div>
          </div>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-[14px] mb-4 text-gray-900">Routing Status</h3>
          <div className="grid grid-cols-3 gap-6">
              <div>
                <h4 className="text-[11px] font-semibold uppercase text-gray-400 mb-2">Withdrawals</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Pending</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.withdrawals.pending)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Success</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.withdrawals.success)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Failed</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.withdrawals.failed)}</span></div>
                </div>
              </div>
              <div className="border-l border-[#EAEAEA] pl-6">
                <h4 className="text-[11px] font-semibold uppercase text-gray-400 mb-2">Deposits</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Pending</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.deposits.pending)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Success</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.deposits.success)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Failed</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.deposits.failed)}</span></div>
                </div>
              </div>
              <div className="border-l border-[#EAEAEA] pl-6">
                <h4 className="text-[11px] font-semibold uppercase text-gray-400 mb-2">Transfers</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Total</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.transfers.total)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Success</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.transfers.success)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-gray-500">Failed</span><span className="font-medium text-gray-900">{formatInteger(metrics.txManager.transfers.failed)}</span></div>
                </div>
              </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        
        {/* 🌟 DYNAMIC VOLUME CHART */}
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm flex flex-col">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">
                Volume
              </h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Total platform transaction volume</p>
            </div>
            
            <TimeframeDropdown value={volumeTimeRange} onChange={setVolumeTimeRange} />
          </div>
          
          <div className="flex-1 min-h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                accessibilityLayer
                data={volumeData} 
                margin={{ left: 12, right: 12, top: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                
                <XAxis 
                  dataKey="name" 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8} 
                  minTickGap={30} 
                  tickFormatter={(value) => value.slice(0, 6)}
                  tick={{ fontSize: 11, fill: '#6B7280' }} 
                />
                
                <Tooltip 
                  cursor={false}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #EAEAEA', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`$${formatCurrency(value)}`, 'Volume']}
                  labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: '4px' }}
                />
                
                <Area 
                  type="linear" 
                  dataKey="volume" 
                  stroke="#4F46E5" 
                  fill="#4F46E5" 
                  fillOpacity={0.4} 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-[#EAEAEA] flex w-full items-start gap-2 text-[13px]">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2 leading-none font-medium text-gray-900">
                Live platform activity <TrendingUp className="h-4 w-4 text-[#4F46E5]" />
              </div>
              <div className="flex items-center gap-2 leading-none text-gray-500">
                Tracking {TIME_OPTIONS.find(o => o.value === volumeTimeRange)?.label.toLowerCase()}
              </div>
            </div>
          </div>
        </div>

        {/* 🌟 SYNCHRONIZED MONEY OUT CHART */}
        <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 shadow-sm flex flex-col">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">
                Money Out
              </h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Completed withdrawals & claim payouts</p>
            </div>

            <TimeframeDropdown value={moneyOutTimeRange} onChange={setMoneyOutTimeRange} />
          </div>
          
          <div className="flex-1 min-h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moneyOutData} margin={{ left: 12, right: 12, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#9CA3AF' }} 
                  dy={10} 
                  minTickGap={30}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#9CA3AF' }} 
                  dx={-10} 
                  tickFormatter={(value) => `$${formatInteger(value)}`} 
                />
                <Tooltip 
                  formatter={(value: any) => [`$${formatCurrency(value)}`, 'Money Out']} 
                  cursor={{ fill: '#F9FAFB' }} 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #EAEAEA', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} 
                  labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: '4px' }}
                />
                <Bar dataKey="moneyOut" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-[#EAEAEA] flex w-full items-start gap-2 text-[13px] invisible">
             {/* Invisible footer to keep the height perfectly symmetrical with the Volume chart */}
             Spacer
          </div>
        </div>

      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm overflow-hidden mt-6 mb-8">
        <div className="px-5 py-4 border-b border-[#EAEAEA] flex justify-between items-center bg-white">
            <h3 className="font-semibold text-[14px] text-gray-900">Global Ledger</h3>
        </div>
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold">Transaction ID</th>
                <th className="px-5 py-3 font-semibold">User Account</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {currentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-gray-500">
                    No transactions found in the global ledger.
                  </td>
                </tr>
              ) : (
                currentTransactions.map((tx: any) => (
                  <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3 text-[13px] font-mono text-gray-500">#{tx.reference || tx.id?.toString().substring(0,8).toUpperCase()}</td>
                    <td className="px-5 py-3 text-[13px] text-gray-900">{tx.accountId || tx.userId}</td>
                    <td className="px-5 py-3 text-[13px] text-gray-600 capitalize">{tx.type}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-gray-900">${formatCurrency(tx.amount)}</td>
                    <td className="px-5 py-3 text-[13px] text-gray-500">{new Date(tx.date || tx.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3"><StatusBadge status={tx.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalTransactions > 0 && (
          <div className="px-5 py-4 border-t border-[#EAEAEA] flex items-center justify-between bg-[#FAFAFA]">
            <span className="text-[13px] text-gray-500">
              Showing <span className="font-medium text-gray-900">{startIndex + 1}</span> to <span className="font-medium text-gray-900">{Math.min(endIndex, totalTransactions)}</span> of <span className="font-medium text-gray-900">{formatInteger(totalTransactions)}</span> transactions
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-[8px] border border-[#EAEAEA] text-gray-600 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 hover:text-gray-900 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="text-[13px] font-medium text-gray-600 px-2">
                Page {formatInteger(safeCurrentPage)} of {formatInteger(totalPages)}
              </span>
              
              <button
                onClick={handleNextPage}
                disabled={safeCurrentPage === totalPages}
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
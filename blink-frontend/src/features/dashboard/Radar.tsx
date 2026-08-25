import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, TrendingUp, ShieldCheck, Zap, AlertCircle 
} from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import { RadarCopilot } from './RadarCopilot'; // 🌟 NEW: Import the Copilot Component

interface RadarData {
  kpis: {
    totalIn: number;
    totalOut: number;
    netFlow: number;
    yieldHarvested: number;
    capitalSaved: number;
    activeEscrowVolume: number;
  };
  chartData: Array<{ date: string; inflow: number; outflow: number }>;
  moneyOutBreakdown: Array<{ recipient: string; amount: number; percentage: string }>;
  moneyInBreakdown: Array<{ source: string; amount: number; percentage: string }>;
  insights: string[];
}

// 🌟 THE FIX 1: Add the interface to receive the prop from MainDashboard
interface RadarProps {
  currentTab?: string;
}

export const Radar: React.FC<RadarProps> = ({ currentTab }) => {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('30D');

  // 🌟 NEW: View Toggle State
  const [showCopilot, setShowCopilot] = useState<boolean>(false);

  // Pull active workspace/account from Zustand store
  const activeAccount = useStore((state: any) => state.activeAccount);

  useEffect(() => {
    fetchRadarData();
  }, [timeRange, activeAccount?.id]);

  const fetchRadarData = async () => {
    setLoading(true);
    setError(null);

    try {
      const end = new Date();
      let start = new Date();
      if (timeRange === '7D') start.setDate(end.getDate() - 7);
      if (timeRange === '30D') start.setDate(end.getDate() - 30);
      if (timeRange === '90D') start.setDate(end.getDate() - 90);
      if (timeRange === 'YTD') start = new Date(end.getFullYear(), 0, 1);

      // 🌟 THE FIX: Always hit the master user route, but pass the specific sub-account as a query parameter
      const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
      const targetSubAccountId = isMasterWallet ? null : activeAccount?.id;

      const res = await api.get(`/users/me/radar`, {
        params: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          subAccountId: targetSubAccountId // Explicitly tells the backend to scope the math!
        }
      });

      if (res.data?.success) {
        setData(res.data.data);
      } else {
        throw new Error(res.data?.error || "Failed to load radar metrics.");
      }
    } catch (err: any) {
      console.error("❌ Radar API Error:", err);
      setError(err.response?.data?.error || err.message || "Failed to sync radar data.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  // 🌟 NEW: View Switcher - Renders the Copilot Page if toggled
  if (showCopilot) {
    // 🌟 THE FIX 2: Pass the context down to the Copilot
    return <RadarCopilot onBack={() => setShowCopilot(false)} currentTab={currentTab} />;
  }

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <h3 className="text-sm font-bold text-red-900">Radar Analytics Offline</h3>
        <p className="text-xs text-red-600 mt-1 max-w-sm">{error}</p>
        <button 
          onClick={fetchRadarData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-red-700 transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 pb-8 pt-0 md:pt-2 text-gray-900 font-sans">
      
      {/* COMMAND HEADER */}
      
      {/* COMMAND HEADER */}
      <div className="pb-8 border-b border-gray-200">
        <h1 className="text-[24px] font-bold tracking-tight text-gray-900 mb-4">Radar Insights</h1>
        
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <p className="text-sm text-gray-500">Treasury, Cashflow & Capital intelligence.</p>

          {/* 🌟 THE ALIGNMENT FIX: Stacks buttons on mobile, inline on tablet+ */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full xl:w-auto mt-2 xl:mt-0">
            {/* TIME RANGE SWITCHER */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold shrink-0 w-full sm:w-auto overflow-x-auto scrollbar-hide">
              {['7D', '30D', '90D', 'YTD'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all ${
                    timeRange === range 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setShowCopilot(true)}
              className="relative flex items-center justify-center w-full sm:w-auto shrink-0 whitespace-nowrap gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:from-blue-500 hover:to-indigo-500 shadow-[0_4px_14px_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] transition-all active:scale-[0.98] border border-indigo-400/30"
            >
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border-2 border-white"></span>
              </span>

              <Zap className="w-4 h-4 text-blue-100 fill-blue-100" />
              Ask Copilot<span className="hidden 2xl:inline">&nbsp;anything</span>
            </button>
          </div>
        </div>
      </div>

      {/* HERO KPIS (NORTH STAR METRICS) */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8 lg:gap-12 mt-6 sm:mt-8 mb-8 sm:mb-12 pb-8 sm:pb-10 border-b border-[#E5E7EB]">
        
        {/* METRIC 1: NET FLOW */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-[22px] sm:text-[28px] lg:text-[32px] font-semibold tracking-[-0.03em] text-[#0F172A] leading-none truncate">
            {formatCurrency(data?.kpis.netFlow || 0)}
          </span>
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3.5">
            <span className="text-[12px] sm:text-[14px] font-medium text-[#64748B] shrink-0">Net cashflow</span>
            {data?.kpis.netFlow! >= 0 ? (
              <span className="flex items-center gap-1 text-[9px] sm:text-[11px] font-bold tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase shrink-0">
                <ArrowUpRight className="w-3 h-3" strokeWidth={3} /> Positive
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] sm:text-[11px] font-bold tracking-widest text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full uppercase shrink-0">
                <ArrowDownRight className="w-3 h-3" strokeWidth={3} /> Negative
              </span>
            )}
          </div>
        </div>

        {/* METRIC 2: YIELD HARVESTED */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-[22px] sm:text-[28px] lg:text-[32px] font-semibold tracking-[-0.03em] text-emerald-600 leading-none truncate">
            +{formatCurrency(data?.kpis.yieldHarvested || 0)}
          </span>
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3.5">
            <span className="text-[12px] sm:text-[14px] font-medium text-[#64748B] shrink-0">Yield harvested</span>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
              <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
            </span>
          </div>
        </div>

        {/* METRIC 3: ESCROW LOCKED */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-[22px] sm:text-[28px] lg:text-[32px] font-semibold tracking-[-0.03em] text-[#0F172A] leading-none truncate">
            {formatCurrency(data?.kpis.activeEscrowVolume || 0)}
          </span>
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3.5">
            <span className="text-[12px] sm:text-[14px] font-medium text-[#64748B] shrink-0">Active escrows</span>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 shrink-0">
              <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
            </span>
          </div>
        </div>

        {/* METRIC 4: CAPITAL SAVED */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-[22px] sm:text-[28px] lg:text-[32px] font-semibold tracking-[-0.03em] text-[#0F172A] leading-none truncate">
            {formatCurrency(data?.kpis.capitalSaved || 0)}
          </span>
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3.5">
            <span className="text-[12px] sm:text-[14px] font-medium text-[#64748B] shrink-0">Capital saved on fees</span>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-50 text-purple-600 shrink-0">
              <Zap className="w-3 h-3" strokeWidth={2.5} />
            </span>
          </div>
        </div>

      </div>

      {/* CASH FLOW VELOCITY CHART */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm mt-6 sm:mt-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-base font-bold text-gray-900">Cash Flow Velocity</h3>
            <p className="text-xs text-gray-400">Bidirectional tracking of capital movement</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-gray-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Inflow
            </span>
            <span className="flex items-center gap-1.5 text-gray-700">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Outflow
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.chartData || []} stackOffset="sign" margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Tooltip 
                cursor={{ fill: '#F3F4F6' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-gray-900 text-white p-3 rounded-xl shadow-xl text-xs font-medium border border-gray-800">
                        <p className="text-gray-400 mb-1">{payload[0].payload.date}</p>
                        <p className="text-emerald-400">Inflow: +{formatCurrency(payload[0].value as number)}</p>
                        <p className="text-rose-400">Outflow: {formatCurrency(payload[1].value as number)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={0} stroke="#E5E7EB" strokeWidth={1.5} />
              <Bar dataKey="inflow" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" fill="#F43F5E" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BREAKDOWN TABLES (MERCURY LOOK) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
        
        {/* MONEY IN BREAKDOWN */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-900">Money in</h3>
            <span className="text-sm font-extrabold text-emerald-600">{formatCurrency(data?.kpis.totalIn || 0)}</span>
          </div>

          <div className="space-y-4 mt-6">
            {data?.moneyInBreakdown.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No inflows during this period.</p>
            ) : (
              data?.moneyInBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-700 truncate max-w-[200px]">{item.source}</span>
                    <span className="text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MONEY OUT BREAKDOWN */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-900">Money out</h3>
            <span className="text-sm font-extrabold text-gray-900">{formatCurrency(data?.kpis.totalOut || 0)}</span>
          </div>

          <div className="space-y-4 mt-6">
            {data?.moneyOutBreakdown.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No outflows during this period.</p>
            ) : (
              data?.moneyOutBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-700 truncate max-w-[200px]">{item.recipient}</span>
                    <span className="text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gray-900 h-1.5 rounded-full" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* NATURAL LANGUAGE INSIGHTS */}
      {data?.insights && data.insights.length > 0 && (
        <div className="bg-gray-900 text-white p-6 rounded-2xl mt-8 border border-gray-800 shadow-lg">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Treasury Intelligence</h4>
          <ul className="space-y-2 text-sm text-gray-300 font-medium">
            {data.insights.map((insight, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};
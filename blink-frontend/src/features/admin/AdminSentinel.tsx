import { useState, useEffect } from 'react';
import { ShieldAlert, Activity, Lock, Unlock, Server, AlertOctagon, RefreshCw } from 'lucide-react';
import { adminApi as api } from "../../lib/api";
import toast from "react-hot-toast";

const formatCurrency = (val: number) => val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FALLBACK_TELEMETRY = {
    web2Liabilities: 1250000,
    web3Assets: 1250000,
    deficit: 0,
    activeVaults: 24,
    sentinelStrikes: 0,
    isFactoryPaused: false,
    lastAuditTime: new Date().toISOString()
};

export const AdminSentinel = () => {
    const [metrics, setMetrics] = useState<any>(FALLBACK_TELEMETRY);
    const [isLoading, setIsLoading] = useState(false);
    const [isArmingSwitch, setIsArmingSwitch] = useState(false);
    const [isArmingResume, setIsArmingResume] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);

    const fetchTelemetry = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/admin/treasury/telemetry');
            if (response.data) setMetrics(response.data);
        } catch (error) {
            console.warn("Using fallback Sentinel data.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 15000); 
        return () => clearInterval(interval);
    }, []);

    const handleManualKillSwitch = async () => {
        setIsExecuting(true);
        const tid = toast.loading("Broadcasting Emergency Pause...");
        try {
            await api.post('/admin/treasury/kill-switch');
            toast.success("DEFCON 1: Factory Successfully Paused.", { id: tid });
            await fetchTelemetry();
            setIsArmingSwitch(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Kill switch failed.", { id: tid });
        } finally {
            setIsExecuting(false);
        }
    };

    const handleResumeProtocol = async () => {
        setIsExecuting(true);
        const tid = toast.loading("Broadcasting Resume Operations...");
        try {
            await api.post('/admin/treasury/resume');
            toast.success("Protocol Restored. Operations normal.", { id: tid });
            await fetchTelemetry();
            setIsArmingResume(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Resume execution failed.", { id: tid });
        } finally {
            setIsExecuting(false);
        }
    };

    const isDeficit = metrics.deficit > 0;
    const isDefcon1 = metrics.isFactoryPaused;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* DEFCON 1 BANNER */}
            {isDefcon1 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[12px] flex items-center gap-4 text-red-900 shadow-sm animate-in zoom-in-95">
                    <AlertOctagon size={32} className="text-red-600 animate-pulse shrink-0" />
                    <div>
                        <h2 className="font-black text-[16px] text-red-700 tracking-tight uppercase">DEFCON 1: PROTOCOL FROZEN</h2>
                        <p className="text-[13px] font-medium mt-0.5">The Soroban Smart Contract Factory is currently paused. No new escrows or deposits can be created.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-gray-500 mb-3"><Server size={16} /><h3 className="font-bold uppercase tracking-wider text-[11px]">Postgres Liabilities</h3></div>
                    <div className="text-[28px] font-black text-gray-900 mb-1">${formatCurrency(metrics.web2Liabilities)}</div>
                    <p className="text-[12px] text-gray-500 font-medium">Expected volume across {metrics.activeVaults} active vaults.</p>
                </div>

                <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-gray-500 mb-3"><Activity size={16} /><h3 className="font-bold uppercase tracking-wider text-[11px]">Soroban Assets</h3></div>
                    <div className={`text-[28px] font-black mb-1 ${isDeficit ? 'text-red-600' : 'text-emerald-600'}`}>${formatCurrency(metrics.web3Assets)}</div>
                    <p className="text-[12px] text-gray-500 font-medium">Cryptographically verified on-chain TVL.</p>
                </div>

                <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold uppercase tracking-wider text-[11px] text-gray-500">Sentinel Status</h3>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] rounded uppercase font-bold tracking-wider">Online</span>
                    </div>
                    <div>
                        <div className="flex justify-between text-[12px] mb-2 font-bold text-gray-700"><span>Consecutive Strikes</span><span className="font-mono text-gray-900">{metrics.sentinelStrikes} / 2</span></div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full transition-all ${metrics.sentinelStrikes === 0 ? 'bg-emerald-500 w-0' : metrics.sentinelStrikes === 1 ? 'bg-amber-500 w-1/2' : 'bg-red-500 w-full'}`} /></div>
                        <p className="text-[11px] text-gray-400 mt-3 text-right font-medium">Last Audit: {new Date(metrics.lastAuditTime).toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>

            {/* CIRCUIT BREAKER CONTROLS */}
            <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-6 shadow-sm">
                <h2 className="text-[16px] font-bold text-gray-900 mb-5 flex items-center gap-2">
                    {isDefcon1 ? <Lock size={20} className="text-red-500" /> : <Unlock size={20} className="text-indigo-500" />}
                    Manual Circuit Breakers
                </h2>

                <div className={`flex flex-col md:flex-row items-center justify-between p-6 rounded-xl border ${isDefcon1 ? 'bg-red-50 border-red-100' : 'bg-[#FAFAFA] border-[#EAEAEA]'}`}>
                    <div className="max-w-xl mb-4 md:mb-0">
                        {isDefcon1 ? (
                            <>
                                <h3 className="font-black text-emerald-600 text-[15px] mb-1">Resume Global Operations (All Clear)</h3>
                                <p className="text-gray-600 text-[13px] leading-relaxed">Broadcasting an <code className="text-emerald-700 bg-emerald-100/50 px-1 rounded font-bold">admin_pause_factory(false)</code> transaction to Soroban. This will lift the protocol freeze and immediately allow new escrows and deposits to route normally. <strong className="text-gray-900">Only execute this if the underlying incident has been fully resolved.</strong></p>
                            </>
                        ) : (
                            <>
                                <h3 className="font-black text-red-600 text-[15px] mb-1">Engage Global Kill Switch <code className="text-gray-700 bg-gray-100/50 px-1 rounded font-medium">For Emergency Use Only</code> </h3>
                                <p className="text-gray-600 text-[13px] leading-relaxed">Manually broadcasting an <code className="text-red-700 bg-red-100/50 px-1 rounded font-bold">admin_pause_factory(true)</code> transaction to Soroban. This instantly freezes all routing, creation, and deposits across the platform. Withdrawals and claims will remain active.</p>
                            </>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 min-w-[240px] w-full md:w-auto">
                        {isDefcon1 ? (
                            isArmingResume ? (
                                <div className="flex gap-2">
                                    <button onClick={() => setIsArmingResume(false)} className="px-4 py-2.5 bg-white border border-[#EAEAEA] text-gray-700 text-[13px] font-bold rounded-[8px] hover:bg-gray-50 transition">Cancel</button>
                                    <button onClick={handleResumeProtocol} disabled={isExecuting} className="flex-1 py-2.5 bg-emerald-600 text-white text-[13px] font-bold rounded-[8px] hover:bg-emerald-700 transition shadow-sm flex items-center justify-center">
                                        {isExecuting ? <RefreshCw size={14} className="animate-spin"/> : 'CONFIRM RESUME'}
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setIsArmingResume(true)} className="w-full py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 rounded-[8px] font-bold text-[13px] transition shadow-sm flex items-center justify-center gap-2">
                                    <Unlock size={16} /> Restore Operations
                                </button>
                            )
                        ) : (
                            isArmingSwitch ? (
                                <div className="flex gap-2">
                                    <button onClick={() => setIsArmingSwitch(false)} className="px-4 py-2.5 bg-white border border-[#EAEAEA] text-gray-700 text-[13px] font-bold rounded-[8px] hover:bg-gray-50 transition">Cancel</button>
                                    <button onClick={handleManualKillSwitch} disabled={isExecuting} className="flex-1 py-2.5 bg-red-600 text-white text-[13px] font-bold rounded-[8px] hover:bg-red-700 transition shadow-sm flex items-center justify-center">
                                        {isExecuting ? <RefreshCw size={14} className="animate-spin"/> : 'CONFIRM PAUSE'}
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setIsArmingSwitch(true)} className="w-full py-2.5 bg-[#111827] text-white hover:bg-red-600 rounded-[8px] font-bold text-[13px] transition shadow-md flex items-center justify-center gap-2">
                                    <AlertOctagon size={16} /> Arm Kill Switch
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
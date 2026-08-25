import { useState, useEffect, useMemo } from "react";
import { 
  Lock, Activity, CheckCircle2, 
  FileText, // 🌟 FIX: Removed unused 'Filter' import
  ArrowLeft, MoreHorizontal, ExternalLink, Database, Terminal,
  ChevronDown, ChevronUp
} from "lucide-react";
import { PieChart, Pie, ResponsiveContainer, Cell } from "recharts";
import { adminApi as api } from "../../lib/api"; 

// --- HELPERS ---
const StatusBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() || "";
  
  if (['completed', 'paid', 'successful', 'released', 'claim_completed', 'claimed'].includes(s)) 
    return <span className="text-[#10B981] flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md text-[11px] font-bold border border-emerald-100"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>Claim Completed</span>;
  
  if (s === 'active' || s === 'funded')
    return <span className="text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md text-[11px] font-bold border border-indigo-100"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>Active (Locked)</span>;

  // 🌟 FIX: Separated actual Claim Initiation from generic backend Processing
  if (['claim_started', 'claim_processing'].includes(s))
    return <span className="text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md text-[11px] font-bold border border-blue-200"><span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>Claim Started</span>;

  if (s === 'processing')
    return <span className="text-[#2775CA] flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md text-[11px] font-bold border border-blue-200"><span className="w-1.5 h-1.5 rounded-full bg-[#2775CA] animate-pulse"></span>Processing</span>;

  if (['pending', 'claim_pending', 'ready'].includes(s)) 
    return <span className="text-[#F59E0B] flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-md text-[11px] font-bold border border-amber-100"><span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>Pending</span>;
  
  if (['failed', 'cancelled', 'expired', 'claim_canceled'].includes(s)) 
    return <span className="text-[#EF4444] flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-md text-[11px] font-bold border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>Claim Cancelled</span>;
  
  return <span className="text-gray-500 flex items-center gap-1.5 capitalize">{status.replace('_', ' ')}</span>;
};

const getTimelineProgress = (escrow: any) => {
  if (!escrow) return 0;
  const timeline = escrow.timeline || [];
  const status = escrow.status?.toLowerCase() || "";

  if (["released", "claimed", "claim_completed", "successful", "paid", "completed"].includes(status)) return 100;

  const stepsCount = timeline.length;
  const progress = (stepsCount / 4) * 100;
  return Math.min(Math.max(progress, 15), 100); 
};

const getExplorerLink = (id: string, type: 'contract' | 'tx' = 'contract') => {
  const network = "testnet"; 
  return `https://stellar.expert/explorer/${network}/${type}/${id}`;
};

// 🌟 FIX: Defines the incoming props from the Dashboard
export interface AdminEscrowProps {
  targetEscrow?: any;
  clearTarget?: () => void;
}

// 🌟 FIX: Added the props to the component's parameter list so TypeScript knows about them!
export const AdminEscrow = ({ targetEscrow, clearTarget }: AdminEscrowProps) => {
  const [selectedEscrow, setSelectedEscrow] = useState<any>(null);
  const [showRawLedgerView, setShowRawLedgerView] = useState(false);
  
  const [registryTab, setRegistryTab] = useState<'All' | 'Active' | 'Claimed' | 'Cancelled'>('All');
  const [diagnosticTab, setDiagnosticTab] = useState<'All' | 'Active' | 'Maturing' | 'Claimed' | 'Cancelled'>('All');

  // Control expansion for the activity timeline
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);

  const [registry, setRegistry] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 FIX: Effect listener for deep linking from the global search
  useEffect(() => {
      if (targetEscrow && registry.length > 0) {
          // Double-check the registry to ensure we have the most fully formatted version of the data
          const formattedTarget = registry.find((tx: any) => tx.id === targetEscrow.id || tx.dbId === targetEscrow.id) || targetEscrow;
          setSelectedEscrow(formattedTarget);
          if (clearTarget) clearTarget(); // Clear it out so backing out of the modal works normally
      }
  }, [targetEscrow, registry, clearTarget]);

  // 🟢 SECURE DATA FETCHING
  useEffect(() => {
    let isMounted = true;

    const fetchRegistry = async () => {
      try {
        const response = await api.get(`/admin/ledger?t=${Date.now()}`);
        
        if (isMounted && response.data && response.data.payments) {
          const formattedData = response.data.payments.map((item: any) => {
            const amountLocked = parseFloat(item.amountLocked || "0");
            const upfrontFee = parseFloat(item.feeAmount || "0");
            const timeline = item.timeline || [];

            let actualYield = parseFloat(item.estimatedYield || "0");
            const settledEvent = timeline.find((t: any) => t.state === 'Settled' || t.state === 'claim_completed' || t.state === 'claim_expired');
            
            if (settledEvent && settledEvent.metadata?.notes) {
                const yieldMatch = settledEvent.metadata.notes.match(/Yield Generated:\s*\$([0-9.]+)/) || settledEvent.metadata.notes.match(/yield\.\s*\$([0-9.]+)/i);
                if (yieldMatch && yieldMatch[1]) {
                    actualYield = parseFloat(yieldMatch[1]);
                }
            }

            return {
              id: item.claimId || item.id,
              dbId: item.id,

              date: new Date(item.createdAt).toLocaleDateString('en-GB'),
              time: new Date(item.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              amount: amountLocked,
              upfrontFee: upfrontFee,
              totalPaidByClient: amountLocked + upfrontFee,
              type: item.displayTitle || item.title || "General Service", 
              agreementType: item.contractType || item.agreementType || "Instant", 
              
              claimableAfter: item.claimableAfter ? new Date(item.claimableAfter).toLocaleDateString('en-GB') : 'Immediate',
              dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-GB') : 'N/A',
              expiry: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : 'N/A',
              rawDueDate: item.dueDate ? new Date(item.dueDate).getTime() : null,
              
              status: item.status,
              start: item.createdAt,
              
              client: item.senderName,
              clientEmail: item.senderEmail,
              recipient: item.recipientEmail,
              
              note: item.note,
              timeline: timeline,
              platformFee: parseFloat(item.platformFee || "0"),
              netAmount: parseFloat(item.netAmount || amountLocked),
              
              yieldPolicy: item.yieldRecipient || "Split",
              yieldEarned: actualYield,

              contractId: item.contractId,
              claimHash: item.claimHash || item.blockchainClaimHash
            };
          });

          setRegistry(formattedData);
          
          if (selectedEscrow) {
              const updatedOpenEscrow = formattedData.find((tx: any) => tx.id === selectedEscrow.id);
              if (updatedOpenEscrow) setSelectedEscrow(updatedOpenEscrow);
          }
        }
      } catch (error) {
        console.error("[Escrow Registry] Sync failed:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchRegistry();
    const poll = setInterval(fetchRegistry, 5000); 
    
    return () => {
        isMounted = false;
        clearInterval(poll);
    };
  }, [selectedEscrow]);

  // Reset timeline expansion when navigating to a new transaction
  useEffect(() => {
    setIsTimelineExpanded(false);
  }, [selectedEscrow?.id]);

  // 🌟 STRICT CHRONOLOGICAL TIMELINE SORTING
  const sortedTimeline = useMemo(() => {
    if (!selectedEscrow?.timeline) return [];
    return [...selectedEscrow.timeline].sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [selectedEscrow]);

  const displayedTimeline = useMemo(() => {
    if (isTimelineExpanded) return sortedTimeline;
    return sortedTimeline.slice(0, 2); 
  }, [sortedTimeline, isTimelineExpanded]);

  const totalTvl = registry.reduce((sum, tx) => sum + (tx.status.toLowerCase() !== 'cancelled' && tx.status.toLowerCase() !== 'claim_canceled' ? tx.amount : 0), 0);
  const activeCount = registry.filter(tx => ["active", "ready", "claim_pending", "claim_started", "claim_processing"].includes(tx.status.toLowerCase())).length;
  const pendingCount = registry.filter(tx => tx.status.toLowerCase() === "pending").length;
  const completedCount = registry.filter(tx => ["claimed", "claim_completed", "paid", "successful", "completed"].includes(tx.status.toLowerCase())).length;
  const cancelledCount = registry.filter(tx => ["cancelled", "claim_canceled", "failed", "expired"].includes(tx.status.toLowerCase())).length;

  const getFilteredData = (dataset: any[], tab: string, isDiagnostics: boolean = false) => {
     return dataset.filter(tx => {
        if (isDiagnostics && !tx.contractId) return false; 
        
        const s = tx.status.toLowerCase();
        const isClaimed = ["claimed", "claim_completed", "paid", "successful", "released", "completed"].includes(s);
        const isCancelled = ["cancelled", "claim_canceled", "failed", "expired"].includes(s);
        const isActive = !isClaimed && !isCancelled; 

        if (tab === 'Active') return isActive;
        if (tab === 'Claimed') return isClaimed;
        if (tab === 'Cancelled') return isCancelled;
        if (tab === 'Maturing') {
           return isActive && tx.agreementType === 'Lock';
        }
        return true; 
     });
  };

  const displayedRegistry = getFilteredData(registry, registryTab, false);
  const displayedDiagnostics = getFilteredData(registry, diagnosticTab, true);

  // --- VIEW 3: RAW BLOCKCHAIN SETTLEMENTS LEDGER ---
  if (showRawLedgerView && !selectedEscrow) {
    return (
      <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6 pb-20">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowRawLedgerView(false)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold text-[13px] transition-all">
            <ArrowLeft size={16}/> Back to General Registry
          </button>
        </div>

        <div>
          <h1 className="text-[28px] font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Database size={28} className="text-indigo-600"/> On-Chain Diagnostics
          </h1>
          <p className="text-[14px] text-gray-500 mt-1">Direct visibility into deployed Soroban Vaults and active blockchain states.</p>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
             <div className="flex items-center gap-2">
               <Terminal size={16} className="text-gray-500"/>
               <span className="font-mono text-[12px] font-bold text-gray-600 uppercase tracking-wider">Active Contract Map</span>
             </div>
             
             <div className="flex items-center gap-1 bg-gray-200/50 p-1 rounded-lg border border-gray-200">
               {['All', 'Active', 'Maturing', 'Claimed', 'Cancelled'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setDiagnosticTab(tab as any)}
                    className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${diagnosticTab === tab ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {tab}
                  </button>
                ))}
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white border-b text-[10px] text-gray-400 uppercase font-black tracking-widest">
                <tr>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Soroban Contract ID</th>
                  <th className="px-6 py-4">Principal (USDC)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-[#FAFAFA]">
                {displayedDiagnostics.length === 0 ? (
                   <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 font-mono text-[12px]">No matching on-chain contracts found in this view.</td></tr>
                ) : (
                   displayedDiagnostics.map((tx, idx) => (
                     <tr key={idx} className="hover:bg-indigo-50/50 transition-colors">
                       <td className="px-6 py-4 font-mono text-[12px] text-gray-500">{tx.id}</td>
                       <td className="px-6 py-4 font-mono text-[12px] text-indigo-600 font-bold">
                         {tx.contractId ? tx.contractId.substring(0, 16) + "..." + tx.contractId.substring(46) : "Pending Deployment"}
                       </td>
                       <td className="px-6 py-4 text-[13px] font-black text-gray-900">${tx.amount.toLocaleString()}.00</td>
                       <td className="px-6 py-4"><StatusBadge status={tx.status} /></td>
                       <td className="px-6 py-4">
                         {tx.contractId ? (
                           <a href={getExplorerLink(tx.contractId, 'contract')} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded border border-indigo-100 w-max transition-colors">
                             Verify on Expert <ExternalLink size={12}/>
                           </a>
                         ) : (
                           <span className="text-[11px] text-gray-400 font-medium italic">Awaiting Hash</span>
                         )}
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
  }

  // --- VIEW 1: REGISTRY LIST ---
  if (!selectedEscrow) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Escrow TVL</p>
              <h2 className="text-[32px] font-black text-gray-900 tracking-tight">
                ${totalTvl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[12px] text-emerald-500 font-bold flex items-center bg-emerald-50 px-2 py-0.5 rounded">+Live</span>
                <span className="text-[11px] text-gray-400 font-medium">Syncing with DB</span>
              </div>
            </div>
            <div className="w-[100px] h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{v:45, c:'#6366F1'}, {v:25, c:'#F59E0B'}, {v:30, c:'#10B981'}]} innerRadius={22} outerRadius={35} paddingAngle={5} dataKey="v" stroke="none">
                    {[{v:45, c:'#6366F1'}, {v:25, c:'#F59E0B'}, {v:30, c:'#10B981'}].map((entry, i) => <Cell key={i} fill={entry.c} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-bold text-gray-400 uppercase mb-3 tracking-wider">Escrow Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center"><span className="text-[13px] text-gray-500">Active Locked</span><span className="text-[15px] font-bold text-indigo-600">{activeCount}</span></div>
              <div className="flex justify-between items-center"><span className="text-[13px] text-gray-500">Pending Creation</span><span className="text-[15px] font-bold text-amber-500">{pendingCount}</span></div>
            </div>
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-bold text-gray-400 uppercase mb-3 tracking-wider">Failures & Claims</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center"><span className="text-[13px] text-gray-500">Claim Completed</span><span className="text-[15px] font-bold text-emerald-600">{completedCount}</span></div>
              <div className="flex justify-between items-center"><span className="text-[13px] text-gray-500">Claim Cancelled</span><span className="text-[15px] font-bold text-red-500">{cancelledCount}</span></div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 rounded-xl p-6 text-white shadow-lg overflow-hidden relative">
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h3 className="text-[16px] font-bold flex items-center gap-2"><Activity size={18} className="text-indigo-300"/> On-Chain Diagnostics</h3>
              <p className="text-indigo-100 text-[13px] mt-1 opacity-90">{activeCount} active smart contracts currently secured on the Soroban network.</p>
            </div>
            <button onClick={() => setShowRawLedgerView(true)} className="bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center gap-2">
               <Database size={14}/> View Raw Ledger
            </button>
          </div>
          <Lock size={180} className="absolute top-0 right-0 opacity-5 translate-x-1/4 -translate-y-1/4 pointer-events-none" />
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h3 className="font-bold text-[15px] text-gray-900">Global Escrow Registry</h3>
            
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
               {['All', 'Active', 'Claimed', 'Cancelled'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setRegistryTab(tab as any)}
                    className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${registryTab === tab ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {tab}
                  </button>
                ))}
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#FAFAFA] border-b text-[10px] text-gray-400 uppercase font-black tracking-widest">
                <tr>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Agreement Type</th>
                  <th className="px-6 py-4">Claimable After</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400 font-mono text-[12px]">
                      Synchronizing with DB...
                    </td>
                  </tr>
                ) : displayedRegistry.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400 font-mono text-[12px]">
                      No matching escrows found in database.
                    </td>
                  </tr>
                ) : displayedRegistry.map((tx, idx) => (
                  <tr key={idx} onClick={() => setSelectedEscrow(tx)} className="group hover:bg-indigo-50/30 cursor-pointer transition-all">
                    <td className="px-6 py-4 font-mono text-[12px] text-indigo-600 font-medium">
                      {tx.id.length > 15 ? tx.id.substring(0, 14) + "..." : tx.id}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-gray-600">{tx.date}</td>
                    <td className="px-6 py-4 text-[14px] font-black text-gray-900">${tx.amount.toLocaleString()}.00</td>
                    <td className="px-6 py-4 text-[13px] text-gray-600">{tx.agreementType}</td>
                    <td className="px-6 py-4 text-[13px] text-gray-500">{tx.claimableAfter}</td>
                    <td className="px-6 py-4"><StatusBadge status={tx.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: FULL-PAGE TRANSACTION DETAILS ---
  const lastUpdated = selectedEscrow.timeline && selectedEscrow.timeline.length > 0
      ? new Date(selectedEscrow.timeline[selectedEscrow.timeline.length - 1].timestamp).toLocaleString('en-US', { 
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        })
      : `${selectedEscrow.date}, ${selectedEscrow.time}`;

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6 pb-20">
      
      <div className="flex items-center justify-between">
        <button onClick={() => setSelectedEscrow(null)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold text-[13px] transition-all">
          <ArrowLeft size={16}/> Back to Registry
        </button>
        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-lg text-[12px] font-bold bg-white hover:bg-gray-50 flex items-center gap-2">
            <FileText size={14}/> View Invoice
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 mt-4">
        
        <div className="flex-1 space-y-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[36px] font-black text-gray-900 tracking-tight">${selectedEscrow.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-gray-400 font-medium text-[24px]">USD</span></h1>
              <div className="mt-2"><StatusBadge status={selectedEscrow.status} /></div>
            </div>
            <p className="text-[14px] text-gray-500">Created by <span className="text-indigo-600 font-bold">{selectedEscrow.client}</span></p>
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[13px] font-bold text-gray-900">Escrow in Progress</span>
              <span className="text-[11px] px-2 py-1 bg-gray-100 text-gray-500 rounded font-medium italic">{selectedEscrow.type}</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                style={{ width: `${getTimelineProgress(selectedEscrow)}%` }}
              />
            </div>
          </div>

          {/* 🌟 RECENT ACTIVITY SECTION WITH CHRONOLOGICAL SORTING & VIEW ALL TOGGLE */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-[16px] font-black text-gray-900 uppercase tracking-tight">Recent activity</h3>
              {sortedTimeline.length > 2 && ( // 🌟 Changed from 4 to 2
                <button 
                  onClick={() => setIsTimelineExpanded(!isTimelineExpanded)} 
                  className="text-[12px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100"
                >
                  {isTimelineExpanded ? (
                    <>Show Less <ChevronUp size={14} /></>
                  ) : (
                    <>View All ({sortedTimeline.length}) <ChevronDown size={14} /></>
                  )}
                </button>
              )}
            </div>

            <div className="relative pl-8 space-y-8 pt-2">
              <div className="absolute left-[11px] top-2 bottom-6 w-[1px] bg-gray-200" />
              
              {displayedTimeline.length > 0 ? (
                displayedTimeline.map((event: any, i: number) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className={`absolute -left-[30px] w-6 h-6 rounded-full border flex items-center justify-center z-10 shadow-sm ${
                      i === 0 ? 'bg-emerald-50 border-emerald-500 text-emerald-500' : 'bg-gray-50 border-gray-300 text-gray-400'
                    }`}>
                      {i === 0 ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <Activity size={12} />
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-gray-900 uppercase">
                        {event.state.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(event.timestamp).toLocaleString('en-US', { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })}
                      </p>
                      {event.metadata?.notes && (
                        <p className="text-[12px] bg-gray-50 p-2 rounded mt-2 italic text-gray-600 border border-dashed border-gray-200">
                          "{event.metadata.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="relative flex items-start gap-4">
                  <div className="absolute -left-[30px] w-6 h-6 rounded-full bg-emerald-50 border border-emerald-500 flex items-center justify-center z-10 text-emerald-500">
                    <CheckCircle2 size={12} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-gray-900">Contract Created</p>
                    <p className="text-[11px] text-gray-400">{selectedEscrow.date}, {selectedEscrow.time}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4">
             <h3 className="text-[16px] font-black text-gray-900">Contract Overview</h3>
             <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-sm space-y-4">
                <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Title / Purpose</p>
                   <p className="text-[14px] font-bold text-gray-900">{selectedEscrow.type}</p>
                </div>
                <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Terms & Notes</p>
                   <p className="text-[13px] text-gray-700 leading-relaxed">{selectedEscrow.note || "No specific terms provided by the sender."}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                   <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Agreement Type</p>
                     <p className="text-[13px] font-bold text-gray-900">{selectedEscrow.agreementType}</p>
                   </div>
                   <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Claimable After</p>
                     <p className="text-[13px] font-bold text-gray-900">{selectedEscrow.claimableAfter}</p>
                   </div>
                   <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Maturity Date (Due)</p>
                     <p className="text-[13px] font-bold text-gray-900">{selectedEscrow.dueDate}</p>
                   </div>
                   <div>
                     <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Yield ({selectedEscrow.yieldPolicy})</p>
                     <p className="text-[13px] font-bold text-indigo-600">${selectedEscrow.yieldEarned.toFixed(4)}</p>
                   </div>
                </div>
             </div>
          </div>

          <div className="space-y-4 pt-4 max-w-md">
            <h3 className="text-[16px] font-black text-gray-900">Payment Breakdown</h3>
            <div className="space-y-3 text-[13px] font-medium border-t pt-4 border-gray-200">
              <div className="flex justify-between"><span className="text-gray-500">Principal Amount Locked</span><span className="text-gray-900 font-bold">${selectedEscrow.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Sender Upfront Fee</span><span className="text-gray-900 font-bold">${selectedEscrow.upfrontFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
              
              <div className="flex justify-between border-t border-gray-100 pt-3"><span className="text-gray-800 font-bold">Total Paid by Client</span><span className="text-gray-900 font-black">${selectedEscrow.totalPaidByClient.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>

              <div className="flex justify-between mt-4 pt-4 border-t border-gray-100"><span className="text-gray-500">Platform Fee (Bingtellar)</span><span className="text-red-500 font-bold">-${selectedEscrow.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
              
              <div className="flex justify-between mt-2"><span className="text-indigo-600 font-bold">Yield Generated</span><span className="text-indigo-600 font-bold">+${selectedEscrow.yieldEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD</span></div>

              <div className="flex justify-between border-t border-dashed border-gray-200 pt-3"><span className="text-gray-800 font-bold">Base Seller Payout</span><span className="text-emerald-600 font-black text-[16px]">${selectedEscrow.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[320px] space-y-10">
           
           <div className="space-y-6">
              <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-wider">Details</h4>
              
              <div className="space-y-1"><p className="text-[11px] font-bold text-gray-400 uppercase">Transaction ID</p><div className="flex items-center justify-between bg-gray-100 p-2 rounded-lg border border-gray-200"><span className="font-mono text-[10px] text-gray-600 truncate mr-2">{selectedEscrow.id}</span><MoreHorizontal size={14} className="text-gray-400"/></div></div>
              
              <div className="space-y-1"><p className="text-[11px] font-bold text-gray-400 uppercase">Internal DB Trace</p><p className="text-[12px] font-mono text-gray-400">{selectedEscrow.dbId}</p></div>

              <div className="space-y-1"><p className="text-[11px] font-bold text-gray-400 uppercase">Created date</p><p className="text-[13px] font-bold text-gray-800">{selectedEscrow.date}, {selectedEscrow.time}</p></div>
              <div className="space-y-1"><p className="text-[11px] font-bold text-gray-400 uppercase">Last updated</p><p className="text-[13px] font-bold text-gray-800">{lastUpdated}</p></div>
           </div>
           
           <div className="space-y-6">
              <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-wider">Counterparties</h4>
              <div className="space-y-1">
                 <p className="text-[11px] font-bold text-gray-400 uppercase">Sender (Client)</p>
                 <p className="text-[13px] font-bold text-gray-800">{selectedEscrow.client}</p>
                 <p className="text-[12px] text-gray-500 font-medium">{selectedEscrow.clientEmail}</p>
              </div>
              <div className="space-y-1">
                 <p className="text-[11px] font-bold text-gray-400 uppercase">Receiver Email</p>
                 <div className="flex items-center justify-between bg-gray-100 p-2 rounded-lg border border-gray-200">
                    <span className="text-[11px] text-gray-600 font-bold truncate">{selectedEscrow.recipient}</span>
                 </div>
              </div>
           </div>

           <div className="space-y-6 pt-4 border-t border-gray-200">
              <h4 className="text-[14px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                 <Terminal size={16} /> Cryptographic Verifier
              </h4>
              
              <div className="space-y-1">
                 <p className="text-[11px] font-bold text-gray-400 uppercase">Soroban Contract ID</p>
                 {selectedEscrow.contractId ? (
                   <div className="flex items-center justify-between bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                      <span className="font-mono text-[10px] font-bold text-indigo-700 truncate mr-2">{selectedEscrow.contractId}</span>
                      <a href={getExplorerLink(selectedEscrow.contractId, 'contract')} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 flex-shrink-0">
                         <ExternalLink size={14}/>
                      </a>
                   </div>
                 ) : (
                   <p className="text-[12px] text-gray-500 italic bg-gray-50 p-2 rounded border">Awaiting Deployment Hash</p>
                 )}
              </div>

              {selectedEscrow.claimHash && (
                <div className="space-y-1">
                   <p className="text-[11px] font-bold text-gray-400 uppercase">Execution Tx Hash</p>
                   <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                      <span className="font-mono text-[10px] text-gray-600 truncate mr-2">{selectedEscrow.claimHash}</span>
                      <a href={getExplorerLink(selectedEscrow.claimHash, 'tx')} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 flex-shrink-0">
                         <ExternalLink size={14}/>
                      </a>
                   </div>
                </div>
              )}
           </div>

        </div>

      </div>
    </div>
  );
};
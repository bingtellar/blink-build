import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  LayoutDashboard, ArrowRightLeft, Users, Landmark, Settings, 
  Bell, LogOut, ArrowDownRight, ArrowUpRight, Lock, ShieldCheck, X, 
  CheckCircle2, AlertCircle, Activity, Save, Loader2, Key, Wallet, ShieldAlert
} from "lucide-react";

import { useStore } from "../../store/useStore";
import { api } from "../../lib/api"; 

import AdminWallet from "./AdminWallet";
import { AdminEscrow } from "./AdminEscrow";
import { AdminKyc } from "./AdminKyc"; 
import { AdminTreasury } from "./AdminTreasury";
import { AdminTransactions } from "./AdminTransactions";
import { AdminRevenue } from "./AdminRevenue";
import { AdminGlobalSearch } from "./AdminGlobalSearch";
import { AdminEscrowControl } from "./AdminEscrowControl"; //

import { StatusBadge, timeAgo } from "./AdminHelpers";
import { DashboardOverview } from "./DashboardOverview";
import { FiatActionCenter } from "./FiatActionCenter";
import { UserManager } from "./UserManager";
import { AccessManagement } from "./AccessManagement";

// =====================================================================
// 🛡️ ENTERPRISE STRICT TYPING
// =====================================================================
export interface TransactionRecord {
  id: string;
  accountId?: string;
  userId?: string;
  type: string;
  amount: string | number;
  date?: string;
  createdAt?: string;
  status: string;
  reference?: string;
  description?: string;
  networkFee?: string | number;
  fee?: string | number;
  processingFee?: string | number;
  metadata?: any; 
  fiatAmount?: string | number; 
  fiatCurrency?: string;        
  exchangeRate?: string | number;
  railFee?: string | number;     
  network?: string;              
}

export interface EscrowPayment {
  id?: string;                    
  dbId?: string;                  
  claimId?: string;               
  status: string;
  amountLocked?: string | number;
  amount?: string | number;
  feeAmount?: string | number;    
  platformFee?: string | number;  
  feePaid?: string | number;
  penaltyPaid?: string | number;
  dateCreated?: string;
  createdAt?: string;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  country: string;
  countryCode: string | null;
  lastIp: string | null;
  timezone: string;
  services: string[];
  accountType: string;
  kycStatus: string;
  createdAt: string;
  walletBalance: number;
  escrowBalance: number;
  isFrozen: boolean;
  role: string;
}

export interface SystemNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ToastAlert {
  type: 'success' | 'warning' | 'alert' | 'info';
  title: string;
  message: string;
}

export interface SystemMetrics {
  platform: { totalVolume: number; activeEscrowVolume: number; totalUsers: number };
  revenue: { totalRevenue: number; creationFees: number; claimFees: number; cancellationPenalties: number };
  txManager: {
    withdrawals: { total: number; pending: number; success: number; failed: number };
    deposits: { total: number; pending: number; success: number; failed: number };
    // 🌟 FIX: Added 'pending' tracking for transfers to fix routing calculation gaps
    transfers: { total: number; pending: number; success: number; failed: number };
  };
  extraRevenue: { depositFees: number; withdrawalFees: number };
  chartData: { name: string; moneyOut: number; volume: number }[];
  globalLedger: TransactionRecord[];
  rawPayments: EscrowPayment[];
}

export const AdminDashboard = () => {
  const activeAccount = useStore((state: any) => state.activeAccount);
  const setActiveAccount = useStore((state: any) => state.setActiveAccount);
  const globalTransactions = useStore((state: any) => state.transactions) || [];

  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showNotifsDropdown, setShowNotifsDropdown] = useState(false);
  const [platformFees, setPlatformFees] = useState({ cancellation: "1.00", processing: "1.00" });

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [pendingTxs, setPendingTxs] = useState<TransactionRecord[]>([]);

  // State to hold the specific escrow we want to deep-link into
  const [targetEscrow, setTargetEscrow] = useState<any>(null);
  
  const [userList, setUserList] = useState<UserRecord[]>([]);
  const [selectedUserView, setSelectedUserView] = useState<UserRecord | null>(null); 
  
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [toastNotif, setToastNotif] = useState<ToastAlert | null>(null);
  
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const lastNotifIdRef = useRef<string | null>(null);

  const liveSelectedTx = useMemo(() => {
    if (!selectedTx) return null;
    let fresh = globalTransactions.find((t: TransactionRecord) => String(t.id) === String(selectedTx.id));
    if (!fresh && metrics?.globalLedger) {
        fresh = metrics.globalLedger.find((t: TransactionRecord) => String(t.id) === String(selectedTx.id));
    }
    return fresh ? { ...selectedTx, ...fresh } : selectedTx;
  }, [selectedTx, metrics?.globalLedger, globalTransactions]);

  const fetchLiveNotifications = useCallback(async () => {
    try {
      const res = await api.get('/admin/notifications');
      const latestNotifs: SystemNotification[] = res.data || [];

      if (latestNotifs.length > 0) {
        const topNotif = latestNotifs[0];
        if (lastNotifIdRef.current && lastNotifIdRef.current !== topNotif.id) {
          setToastNotif({
            type: topNotif.type as any,
            title: topNotif.title,
            message: topNotif.message
          });
          setTimeout(() => setToastNotif(null), 6000);
        }
        lastNotifIdRef.current = topNotif.id;
      }
      setNotifications(latestNotifs);
    } catch (error) {
      console.error("Failed to fetch system notifications:", error);
    }
  }, []);

  const handleMarkNotifsRead = async () => {
    try {
      await api.patch('/admin/notifications/read');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  };

  const handleTestNotification = () => {
    setToastNotif({
      type: 'info',
      title: 'Test Connection',
      message: 'The autonomous notification observer is online.'
    });
    setTimeout(() => setToastNotif(null), 6000);
  };

  const fetchAndComputeMetrics = useCallback(async () => {
    try {
        const response = await api.get('/admin/ledger');
        const data = response.data; 
        
        const rawTxs: TransactionRecord[] = data.transactions || [];
        const rawPayments: EscrowPayment[] = data.payments || data.escrows || [];

        const txs = rawTxs.map(t => ({ ...t, date: t.createdAt || new Date().toISOString() }));
        const payments = rawPayments.map(p => ({ ...p, dateCreated: p.createdAt || new Date().toISOString() }));

        const withdrawals = txs.filter(t => t.type.toLowerCase() === "withdrawal");
        const deposits = txs.filter(t => t.type.toLowerCase() === "deposit");
        const transfers = txs.filter(t => t.type.toLowerCase() === "transfer" || t.type.toLowerCase() === "payment");

        // 🌟 FIX 1: Universal Status Mappers (Catches all edge case statuses from the backend)
        const checkSuccess = (s: string) => ['completed', 'successful', 'paid', 'claim_completed', 'released'].includes(s.toLowerCase());
        const checkPending = (s: string) => ['pending', 'processing', 'active', 'claim_pending', 'claim_started', 'ready', 'funded'].includes(s.toLowerCase());
        const checkFailed = (s: string) => ['failed', 'cancelled', 'claim_canceled', 'expired'].includes(s.toLowerCase());

        const generateChartData = () => {
          const chartData = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0]; 
            const dailyTxs = txs.filter(t => t.date && t.date.startsWith(dateStr));
            
            // 🌟 FIX 2: Money Out Graph strictly maps to COMPLETED withdrawals and claim payouts
            const moneyOut = dailyTxs
                .filter(t => ['withdrawal', 'transfer', 'payment'].includes(t.type.toLowerCase()))
                .filter(t => checkSuccess(t.status))
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);
                
            const volume = dailyTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
            chartData.push({ name: d.toLocaleDateString('en-US', { weekday: 'short' }), moneyOut, volume });
          }
          return chartData;
        };

        const totalVolume = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        
        const activeEscrowVolume = payments
            .filter(p => checkPending(p.status))
            .reduce((sum, p) => sum + Number(p.amountLocked || p.amount || 0), 0);
        
        const savedFees = JSON.parse(localStorage.getItem("bingtellar_platform_fees") || '{"cancellation":1.00, "processing":1.00}');
        const currentProcessingFee = Number(savedFees.processing) || 1.00;
        const currentCancellationFee = Number(savedFees.cancellation) || 1.00;

        // 🌟 FIX 3: True Mathematical Revenue Engine
        // Pulls actual fee calculations natively processed by the backend schema mapping
        const creationFees = payments.reduce((sum, p) => sum + Number(p.feeAmount || 0), 0);

        const claimFees = payments
            .filter(p => checkSuccess(p.status))
            .reduce((sum, p) => sum + Number(p.platformFee || 0), 0);
            
        const cancellationPenalties = payments
            .filter(p => checkFailed(p.status))
            .reduce((sum, p) => sum + Number(p.penaltyPaid || currentCancellationFee), 0);
            
        const depositFees = deposits.reduce((sum, d) => sum + Number(d.processingFee || d.fee || 0), 0);
        const withdrawalFees = withdrawals.reduce((sum, w) => sum + Number(w.networkFee || w.fee || 0), 0);

        const totalRevenue = creationFees + claimFees + cancellationPenalties + depositFees + withdrawalFees;

        setMetrics(prev => {
          const preservedTotalUsers = prev?.platform?.totalUsers || 0;
          return {
            platform: { totalVolume, activeEscrowVolume, totalUsers: preservedTotalUsers }, 
            revenue: { totalRevenue, creationFees, claimFees, cancellationPenalties },
            txManager: {
              withdrawals: { 
                  total: withdrawals.length, 
                  pending: withdrawals.filter(w => checkPending(w.status)).length, 
                  success: withdrawals.filter(w => checkSuccess(w.status)).length, 
                  failed: withdrawals.filter(w => checkFailed(w.status)).length 
              },
              deposits: { 
                  total: deposits.length, 
                  pending: deposits.filter(d => checkPending(d.status)).length, 
                  success: deposits.filter(d => checkSuccess(d.status)).length, 
                  failed: deposits.filter(d => checkFailed(d.status)).length 
              },
              // 🌟 FIX 4: Routing accurately parses success/failed/pending for Transfers & Claims
              transfers: { 
                  total: transfers.length, 
                  pending: transfers.filter(t => checkPending(t.status)).length,
                  success: transfers.filter(t => checkSuccess(t.status)).length, 
                  failed: transfers.filter(t => checkFailed(t.status)).length 
              }
            },
            extraRevenue: { depositFees, withdrawalFees },
            chartData: generateChartData(),
            globalLedger: txs,
            rawPayments: payments
          };
        });

        setPlatformFees({ cancellation: currentCancellationFee.toFixed(2), processing: currentProcessingFee.toFixed(2) });
        setPendingTxs(txs.filter(t => (t.type === 'deposit' || t.type === 'withdrawal') && checkPending(t.status)));

    } catch (error) {
        console.error("Failed to sync live ledger metrics:", error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchRealUsers = async () => {
      try {
        const response = await api.get('/users');
        const realData = response.data || [];
        
        const initialUsers: UserRecord[] = realData.map((dbUser: any) => {
          // 🌟 THE FIX: The database `balance` column IS the absolute source of truth for Available Balance.
          const availableBalance = parseFloat(dbUser.balance || "0");

          return {
            id: dbUser.id,
            name: `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() || dbUser.businessName || "Unnamed User",
            email: dbUser.email, 
            walletAddress: dbUser.walletAddress,
            country: dbUser.country || "Not provided",
            countryCode: dbUser.countryCode || null, 
            lastIp: dbUser.lastIp || null,          
            timezone: dbUser.timezone || "UTC",
            services: dbUser.services || [],
            accountType: dbUser.accountType || "Individual",
            kycStatus: dbUser.kycStatus || "unverified",
            createdAt: dbUser.createdAt,
            walletBalance: availableBalance, // 🌟 Raw DB Truth
            escrowBalance: 0,                // 🌟 Delegated: UserManager now calculates this dynamically via rawPayments
            isFrozen: dbUser.isFrozen === "true" || dbUser.isFrozen === true,
            role: dbUser.role || 'user'
          };
        });
        
        if (isMounted) {
          setUserList(initialUsers);
          
          // Instantly refresh the 360 view if an admin is currently looking at a profile
          setSelectedUserView((currentSelected) => {
              if (!currentSelected) return null;
              return initialUsers.find(u => u.id === currentSelected.id) || currentSelected;
          });

          // Sync total users metric
          setMetrics(prev => prev ? { ...prev, platform: { ...prev.platform, totalUsers: initialUsers.length } } : prev);
        }

      } catch (error) {
        console.error("Backend Connection Error syncing users:", error);
      }
    };

    fetchRealUsers();
    const userInterval = setInterval(fetchRealUsers, 10000); 
    return () => { isMounted = false; clearInterval(userInterval); };
  }, []);

  useEffect(() => {
    fetchAndComputeMetrics();
    fetchLiveNotifications(); 
    
    const pollInterval = setInterval(() => { 
        fetchAndComputeMetrics(); 
        fetchLiveNotifications(); 
    }, 5000); 

    const handleStorageChange = (e: StorageEvent) => {
        if (e.key && e.key.startsWith('bingtellar_')) fetchAndComputeMetrics();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('BLINK_ONCHAIN_SYNC', fetchAndComputeMetrics);

    return () => {
        clearInterval(pollInterval);
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('BLINK_ONCHAIN_SYNC', fetchAndComputeMetrics);
    };
  }, [fetchAndComputeMetrics, fetchLiveNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setShowNotifsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 🌟 INJECT THE GLOBAL SEARCH NAVIGATION HANDLER HERE
  const handleSearchNavigation = (type: 'user' | 'escrow' | 'transaction', data: any) => {
    if (type === 'transaction') {
        setActiveTab("Transactions");
        const fullTx = metrics?.globalLedger?.find(t => String(t.id) === String(data.id)) || data;
        setSelectedTx(fullTx);
    } 
    else if (type === 'user') {
        setActiveTab("Users");
        const fullUser = userList.find(u => String(u.id) === String(data.id)) || { 
            id: data.id, 
            name: data.businessName || data.name || "Unknown", 
            email: data.email, 
            walletAddress: "", country: "", countryCode: null, lastIp: null, timezone: "UTC", 
            services: [], accountType: "Individual", kycStatus: "unverified", 
            createdAt: new Date().toISOString(), walletBalance: 0, escrowBalance: 0, 
            isFrozen: false, role: "user" 
        };
        setSelectedUserView(fullUser as any);
    } 
    else if (type === 'escrow') {
      setActiveTab("Escrow");
      const fullEscrow = metrics?.rawPayments?.find(p => String(p.id) === String(data.id)) || data;
      setTargetEscrow(fullEscrow);
    }
  };


  const handleExportCSV = () => {
    if (!metrics || metrics.globalLedger.length === 0) return;
    const headers = ["Transaction ID", "Internal DB Trace", "User Account", "Type", "Amount (USD)", "Date", "Status"];
    const rows = metrics.globalLedger.map(tx => [ 
      tx.reference || tx.id, 
      tx.id,
      tx.accountId || tx.userId || "N/A", 
      tx.type, 
      Number(tx.amount || 0).toFixed(2), 
      new Date(tx.date || tx.createdAt || new Date()).toISOString(), 
      tx.status 
    ].join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bingtellar_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  

  const handleToggleFreeze = async (userId: string) => {
    try {
      setToastNotif({ type: 'info', title: 'Processing', message: 'Updating account security clearance...' });
      
      const res = await api.post(`/admin/users/${userId}/toggle-freeze`);
      
      setUserList(prev => prev.map(u => u.id === userId ? { ...u, isFrozen: res.data.isFrozen } : u));
      
      if (selectedUserView && selectedUserView.id === userId) {
          setSelectedUserView(prev => prev ? { ...prev, isFrozen: res.data.isFrozen } : null);
      }
      
      setToastNotif({ 
          type: res.data.isFrozen ? 'warning' : 'success', 
          title: res.data.isFrozen ? 'Account Frozen' : 'Account Restored', 
          message: res.data.message 
      });
      setTimeout(() => setToastNotif(null), 6000);
    } catch (error: any) {
      setToastNotif({ type: 'alert', title: 'Action Failed', message: error.response?.data?.error || 'Network error' });
      setTimeout(() => setToastNotif(null), 6000);
    }
  };

  const handleSaveSettings = () => {
    const parsedFees = { cancellation: parseFloat(platformFees.cancellation) || 0, processing: parseFloat(platformFees.processing) || 0 };
    localStorage.setItem("bingtellar_platform_fees", JSON.stringify(parsedFees));
    setToastNotif({ type: 'success', title: 'Settings Saved', message: 'Platform fees updated globally.' });
    setTimeout(() => setToastNotif(null), 6000);
  };

  const handleLogout = () => {
    localStorage.removeItem("bingtellar_user");
    setActiveAccount(null);
    window.location.href = "/login";
  };

  if (!metrics) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center font-mono text-[13px] text-gray-500">
      <Loader2 className="animate-spin mb-4 text-[#111827]" size={24} />
      Initializing Workspace...
    </div>
  );

  const NavItem = ({ icon: Icon, label, tabId, active = false }: { icon: any, label: string, tabId?: string, active?: boolean }) => {
    const targetTab = tabId || label; 
    return (
      <button onClick={() => { setActiveTab(targetTab); setSelectedUserView(null); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-[13px] ${ active ? "text-[#111827] font-semibold bg-gray-50" : "text-[#6B7280] hover:text-[#111827] hover:bg-gray-50/50" }`}>
        <Icon size={16} strokeWidth={active ? 2.5 : 2} /> {label}
      </button>
    );
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const adminInitials = activeAccount?.name 
    ? activeAccount.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : activeAccount?.email?.substring(0, 2).toUpperCase() || 'AD';

  return (
    <div className="flex h-screen bg-[#FAFAFA] overflow-hidden font-sans text-[#111827]">
      
      {toastNotif && (
        <div className="fixed bottom-6 right-6 bg-white border border-[#EAEAEA] shadow-2xl rounded-[12px] p-4 z-[100] w-[340px] animate-in slide-in-from-right-8 fade-in">
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${toastNotif.type === 'success' ? 'text-emerald-500' : toastNotif.type === 'warning' ? 'text-amber-500' : toastNotif.type === 'alert' ? 'text-red-500' : 'text-blue-500'}`}>
                    {toastNotif.type === 'success' ? <CheckCircle2 size={18}/> : toastNotif.type === 'alert' || toastNotif.type === 'warning' ? <AlertCircle size={18}/> : <Activity size={18}/>}
                </div>
                <div>
                    <h4 className="text-[14px] font-semibold text-gray-900">{toastNotif.title}</h4>
                    <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">{toastNotif.message}</p>
                </div>
                <button onClick={() => setToastNotif(null)} className="ml-auto text-gray-400 hover:text-gray-900 transition-colors"><X size={14}/></button>
            </div>
        </div>
      )}

      <aside className="w-[240px] bg-white border-r border-[#EAEAEA] flex flex-col h-full shrink-0 z-20">
        <div className="p-6 flex items-center gap-2">
          <div className="w-6 h-6 bg-[#111827] flex items-center justify-center text-white font-bold text-[12px] rounded-sm">B</div>
          <span className="font-semibold text-[15px] tracking-tight">Blink Admin Desk</span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
          <div className="space-y-0.5">
            <p className="px-3 text-[11px] font-semibold text-gray-400 mb-1">Overview</p>
            <NavItem icon={LayoutDashboard} label="Dashboard" active={activeTab === "Dashboard"} />
            <NavItem icon={ArrowRightLeft} label="Transactions" active={activeTab === "Transactions"} />
            <NavItem icon={Users} label="Users" active={activeTab === "Users"} />
          </div>
          <div className="space-y-0.5">
            <p className="px-3 text-[11px] font-semibold text-gray-400 mb-1">Ledger</p>
            <NavItem icon={ArrowDownRight} label="Fiat Deposits" tabId="Deposits" active={activeTab === "Deposits"} />
            <NavItem icon={ArrowUpRight} label="Fiat Withdrawals" tabId="Withdrawals" active={activeTab === "Withdrawals"} />
            <NavItem icon={Lock} label="Escrow" active={activeTab === "Escrow"} />
            <NavItem icon={Landmark} label="Revenue" active={activeTab === "Revenue"} />
            <NavItem icon={Wallet} label="Treasury" active={activeTab === "Treasury"} />
          </div>
          <div className="space-y-0.5">
            <p className="px-3 text-[11px] font-semibold text-gray-400 mb-1">System</p>
            <NavItem icon={ShieldCheck} label="Compliance" active={activeTab === "Compliance"} />
            <NavItem icon={Key} label="Access Control" tabId="Access Management" active={activeTab === "Access Management"} />
            <NavItem icon={Settings} label="Settings" active={activeTab === "Settings"} />
            {/* Ops Override Panel */}
            <NavItem icon={ShieldAlert} label="Escrow Override" tabId="Escrow Override" active={activeTab === "Escrow Override"} />
          </div>
        </div>
        <div className="p-4 border-t border-[#EAEAEA]">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[#6B7280] hover:bg-gray-50 hover:text-red-600 transition-colors text-[13px] font-medium group">
            <LogOut size={16} className="group-hover:text-red-500" /> Secure Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-[64px] bg-white border-b border-[#EAEAEA] flex items-center justify-between px-8 shrink-0 z-40">
          
          {/* 🌟 INJECT THE INTELLIGENT SEARCH ENGINE HERE */}
          <div className="flex-1 max-w-2xl">
             <AdminGlobalSearch onNavigate={handleSearchNavigation} />
          </div>

          <div className="flex items-center gap-6 ml-4">
            
            <div className="relative" ref={notifMenuRef}>
              <button onClick={() => setShowNotifsDropdown(!showNotifsDropdown)} className="relative text-gray-400 hover:text-gray-900 transition-colors p-1">
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
              </button>

              {showNotifsDropdown && (
                <div className="absolute right-0 mt-3 w-[360px] bg-white border border-[#EAEAEA] rounded-[12px] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-[#EAEAEA] bg-[#FAFAFA]">
                        <h3 className="text-[13px] font-semibold text-gray-900">System Notifications</h3>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkNotifsRead} className="text-[11px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors">Mark all read</button>
                        )}
                    </div>
                    <div className="max-h-[350px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-[13px]">No recent platform activity.</div>
                        ) : (
                            notifications.map(n => (
                                <div key={n.id} className={`p-4 border-b border-[#F3F4F6] last:border-0 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/20' : ''}`}>
                                    <div className="flex gap-3">
                                        <div className={`mt-0.5 shrink-0 ${n.type?.includes('success') ? 'text-emerald-500' : n.type?.includes('warning') ? 'text-amber-500' : n.type?.includes('alert') ? 'text-red-500' : 'text-blue-500'}`}>
                                            {n.type?.includes('success') ? <CheckCircle2 size={16}/> : n.type?.includes('alert') || n.type?.includes('warning') ? <AlertCircle size={16}/> : <Activity size={16}/>}
                                        </div>
                                        <div>
                                            <h4 className={`text-[13px] ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{n.title}</h4>
                                            <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                                            <span className="text-[10px] text-gray-400 font-medium mt-1.5 block">{timeAgo(n.createdAt)}</span>
                                        </div>
                                        {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto mt-1 shrink-0"></div>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-[#EAEAEA]">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-[11px] border border-gray-200">
                {adminInitials}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 pb-24">
          
          {activeTab === "Dashboard" && (
            <DashboardOverview 
                metrics={metrics} 
                handleTestNotification={handleTestNotification} 
                handleExportCSV={handleExportCSV} 
                setSelectedTx={setSelectedTx} 
            />
          )}

          {activeTab === "Revenue" && (
             <AdminRevenue 
                metrics={metrics}
             />
          )}

          {activeTab === "Transactions" && (
             <AdminTransactions 
                transactions={metrics?.globalLedger || []}
                setSelectedTx={setSelectedTx}
                handleExportCSV={handleExportCSV}
             />
          )}

          {(activeTab === "Deposits" || activeTab === "Withdrawals") && (
             <FiatActionCenter 
                activeTab={activeTab}
                transactions={metrics?.globalLedger || []} 
                pendingTxs={pendingTxs}
                userList={userList} 
             />
          )}

          {activeTab === "Users" && (
             <UserManager 
                userList={userList}
                selectedUserView={selectedUserView}
                setSelectedUserView={setSelectedUserView}
                handleToggleFreeze={handleToggleFreeze}
                metrics={metrics}
                setSelectedTx={setSelectedTx}
             />
          )}

          {activeTab === "Escrow" && (
             <AdminEscrow 
                 targetEscrow={targetEscrow} 
                 clearTarget={() => setTargetEscrow(null)} 
             />
          )}

          {activeTab === "Treasury" && <AdminTreasury />}

          {activeTab === "Compliance" && <AdminKyc />}

          {activeTab === "Access Management" && (
             <AccessManagement currentUserRole={activeAccount?.role} /> 
          )}

          {/* Ops Override Component */}
          {activeTab === "Escrow Override" && (
             <AdminEscrowControl /> 
          )}

          {activeTab === "Settings" && (
            <>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">System Configuration</h1>
                  <p className="text-[13px] text-gray-500 mt-1">Adjust global platform fees and limits in real-time.</p>
                </div>
              </div>
              
              <div className="mb-6 max-w-2xl">
                 <AdminWallet />
              </div>

              <div className="bg-white border border-[#EAEAEA] rounded-[12px] shadow-sm p-6 max-w-2xl">
                <h3 className="font-semibold text-[15px] mb-6 flex items-center gap-2 border-b border-[#EAEAEA] pb-4"><Settings size={18}/> Fee Structure</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 mb-2">Claim Processing Fee (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                      <input type="number" step="0.01" value={platformFees.processing} onChange={(e) => setPlatformFees({...platformFees, processing: e.target.value})} className="w-full pl-7 pr-4 py-2 bg-[#FAFAFA] border border-[#EAEAEA] rounded-md text-[14px] font-medium focus:outline-none focus:border-[#111827]" />
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1">Charged to the user when an escrow claim is successfully completed.</p>
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 mb-2">Cancellation Penalty (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                      <input type="number" step="0.01" value={platformFees.cancellation} onChange={(e) => setPlatformFees({...platformFees, cancellation: e.target.value})} className="w-full pl-7 pr-4 py-2 bg-[#FAFAFA] border border-[#EAEAEA] rounded-md text-[14px] font-medium focus:outline-none focus:border-[#111827]" />
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1">Deducted from the refund when a user manually cancels a locked escrow.</p>
                  </div>
                  
                  <div className="pt-4">
                    <button onClick={handleSaveSettings} className="px-6 py-2.5 bg-[#111827] text-white rounded-md text-[13px] font-semibold hover:bg-gray-800 transition-colors flex items-center gap-2">
                      <Save size={16}/> Save Global Settings
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </main>

      {liveSelectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/10 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-300">
          <div className="w-[400px] bg-white h-full shadow-2xl flex flex-col border-l border-[#EAEAEA] animate-in slide-in-from-right duration-300">
            <div className="px-6 py-4 border-b border-[#EAEAEA] flex justify-between items-center">
              <h3 className="font-semibold text-[15px] text-gray-900">Transaction Details</h3>
              <button onClick={() => setSelectedTx(null)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"><X size={16}/></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              <div className="text-center pb-6 border-b border-[#EAEAEA]">
                 <p className="text-[12px] text-gray-500 mb-1 capitalize">Total Sender Deduction</p>
                 <h2 className="text-[32px] font-semibold text-gray-900 transition-colors duration-500">${Number(liveSelectedTx.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</h2>
                 
                 {liveSelectedTx.fiatAmount && (
                    <div className="mt-4 mb-2 flex justify-center">
                       <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 flex flex-col items-center">
                          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Fiat Payout Initiated</span>
                          <span className="text-[16px] font-black text-blue-700">{Number(liveSelectedTx.fiatAmount).toLocaleString()} {liveSelectedTx.fiatCurrency || 'NGN'}</span>
                       </div>
                    </div>
                 )}

                 <div className="mt-3 flex justify-center transition-colors duration-500">
                    {liveSelectedTx.status?.toLowerCase() === 'processing' ? (
                        <span className="text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-md text-[12px] font-bold border border-blue-200">
                           <Loader2 size={14} className="animate-spin" /> Processing Payout
                        </span>
                    ) : (
                        <StatusBadge status={liveSelectedTx.status} />
                    )}
                 </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Metadata</h4>
                <div className="flex justify-between py-1"><span className="text-[13px] text-gray-500">Transaction ID</span><span className="text-[13px] font-mono font-medium text-gray-900">{liveSelectedTx.reference || liveSelectedTx.id}</span></div>
                <div className="flex justify-between py-1"><span className="text-[13px] text-gray-500">Internal DB Trace</span><span className="text-[13px] font-mono text-gray-400">{liveSelectedTx.id}</span></div>
                <div className="flex justify-between py-1"><span className="text-[13px] text-gray-500">Account</span><span className="text-[13px] font-medium text-gray-900">{liveSelectedTx.accountId || liveSelectedTx.userId}</span></div>
                <div className="flex justify-between py-1"><span className="text-[13px] text-gray-500">Timestamp</span><span className="text-[13px] font-medium text-gray-900">{new Date(liveSelectedTx.date || liveSelectedTx.createdAt || new Date()).toLocaleString()}</span></div>

                {(liveSelectedTx.fiatAmount || liveSelectedTx.exchangeRate) && (
                   <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                      <p className="text-[11px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                         <ArrowRightLeft size={12}/> Fiat Settlement Details
                      </p>
                      <div className="flex justify-between text-[12px]"><span className="text-gray-500">Payout Network</span><span className="font-bold text-gray-800 capitalize">{liveSelectedTx.network?.replace('_', ' ') || 'Bank Transfer'}</span></div>
                      {liveSelectedTx.exchangeRate && (
                        <div className="flex justify-between text-[12px]"><span className="text-gray-500">Exchange Rate</span><span className="font-bold text-gray-800">1 USD = {Number(liveSelectedTx.exchangeRate).toLocaleString()} {liveSelectedTx.fiatCurrency}</span></div>
                      )}
                      {liveSelectedTx.railFee && (
                         <div className="flex justify-between text-[12px]"><span className="text-gray-500">Rail Fee</span><span className="font-bold text-red-500">-{Number(liveSelectedTx.railFee).toLocaleString()} {liveSelectedTx.fiatCurrency}</span></div>
                      )}
                      <div className="flex justify-between text-[12px] border-t border-indigo-100 pt-2 mt-1"><span className="text-gray-600 font-bold">Net Payout</span><span className="font-black text-indigo-700">{Number(liveSelectedTx.fiatAmount).toLocaleString()} {liveSelectedTx.fiatCurrency}</span></div>
                   </div>
                )}

                {liveSelectedTx.metadata?.bingtellarOrderId && (
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <p className="text-[11px] font-black text-indigo-900 uppercase tracking-wider">Fiat Off-Ramp Audit</p>
                    <div className="flex justify-between text-[12px]"><span className="text-gray-500">Provider Order ID</span><span className="font-mono font-bold text-gray-800">{liveSelectedTx.metadata.bingtellarOrderId}</span></div>
                    {liveSelectedTx.metadata.recipientDetails && (
                      <>
                        <div className="flex justify-between text-[12px]"><span className="text-gray-500">Destination Bank</span><span className="font-bold text-gray-800">{liveSelectedTx.metadata.recipientDetails.bankName || liveSelectedTx.metadata.recipientDetails.bank_code}</span></div>
                        <div className="flex justify-between text-[12px]"><span className="text-gray-500">Account Number</span><span className="font-mono font-bold text-gray-800">{liveSelectedTx.metadata.recipientDetails.accountNumber || liveSelectedTx.metadata.recipientDetails.account_number}</span></div>
                        <div className="flex justify-between text-[12px]"><span className="text-gray-500">Account Name</span><span className="font-bold text-gray-800">{liveSelectedTx.metadata.recipientDetails.accountName || liveSelectedTx.metadata.recipientDetails.account_name}</span></div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex justify-between py-1 border-t border-[#F3F4F6] mt-2 pt-3"><span className="text-[13px] text-gray-500">Description</span><span className="text-[13px] font-medium text-gray-900 text-right max-w-[200px]">{liveSelectedTx.description || "No description provided."}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
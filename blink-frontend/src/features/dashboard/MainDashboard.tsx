import { useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { BalanceWallet } from "./BalanceWallet";
import { UserProfile } from "./UserProfile";
import { Settings } from "./Settings";
import { Payments } from "./Payments";
import { RecipientsAddressbook } from "./RecipientsAddressbook";
import { Accounts } from "./Accounts"; 
import { CreateAccountModal } from "./CreateAccountModal";
import { WithdrawalFlow } from "./WithdrawalFlow";
import { SendMoneyToEmail } from "./SendMoneyToEmail";
import { TransactionHistory } from "./TransactionHistory";
import { DepositFlow } from "./Deposit/DepositFlow"; 
import { PayRequestFlow } from "./PayRequestFlow";
import { AccountSetupFlow } from "./AccountSetupFlow"; 
import { Radar } from "./Radar";
import { RadarCopilot } from "./RadarCopilot"; 
import { SupportTicketModal } from "../../components/modals/SupportTicketModal";
import { useIdleTimeout } from "../../hooks/useIdleTimeout";

import { useStore } from "../../store/useStore"; 
import { useDashboardSync } from "../../hooks/useDashboardSync";
import { useLiveVault } from "../../hooks/useLiveVault"; 
// import { useSorobanBalance } from "../../hooks/useSorobanBalance"; 
import { Horizon, Keypair, Asset, TransactionBuilder, Networks, Operation } from "@stellar/stellar-sdk";
import { LocalCryptoUtil } from "../../utils/LocalCryptoUtil"; 
import { api } from "../../lib/api";

import {
  ArrowUpRight,
  PlayCircle,
  ChevronRight,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  MessageSquareMore,
  X,
  PanelRight, 
  Layers,     
  Maximize2   
} from "lucide-react";

interface MainDashboardProps {
  onLogout?: () => void;
}

export interface LiquidityMatrix {
  available: number;
  lockedInEscrows: number;
  ledger: number;
  totalSubAccounts: number;
  globalPlatformLiquidity: number;
}

export interface AccountData {
  id: string | number;
  alias: string;
  name: string;
  businessName: string;
  type: string;
  balance: number;
  isReady: boolean;
  isActive: boolean;
  email?: string;
  muxedAddress?: string;
  muxedId?: string;
  walletAddress?: string;
  kycStatus?: string;
  encryptedWalletKey?: string;
  services?: string[]; 
  balances?: LiquidityMatrix; 
  subAccounts?: any[];        
}

export interface TransactionData {
  id: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "payment" | "transfer" | "request" | "bulk_payment"; 
  amount: number;
  date: string;
  status: string; 
  description: string;
  trackingState?: string; 
  reference?: string;
  network?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
  exchangeRate?: number;
  networkFee?: number;
  processingFee?: number;
  note?: string;
  memo?: string;
  recipientEmail?: string;
  recipients?: string[];
  role?: "creator" | "payer"; 
  amountDisbursed?: number;
  completedCount?: number;
  cancelledCount?: number;
  totalCount?: number;
}

const SparklineChart = ({ data }: { data: { amount: number, date: string }[] }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 1000;
  const height = 120;
  const paddingY = 12; 
  const usableHeight = height - paddingY * 2;
  
  const min = Math.min(...data.map(d => d.amount));
  const max = Math.max(...data.map(d => d.amount));
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - paddingY - ((val.amount - min) / range) * usableHeight; 
    return [x, y];
  });

  const pathData = `M ${points.map(p => `${p[0]},${p[1]}`).join(' L ')}`;
  const areaData = `${pathData} L ${width},${height} L 0,${height} Z`;

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current || points.length < 2) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const xPos = clientX - svgRect.left;
    const ratio = Math.max(0, Math.min(1, xPos / svgRect.width));
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(index);
  };

  return (
    <div 
      className="relative w-full h-full cursor-crosshair group"
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setHoverIndex(null)}
      onTouchMove={handlePointerMove}
      onTouchEnd={() => setHoverIndex(null)}
    >
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34A853" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#34A853" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaData} fill="url(#chartGradient)" className="transition-all duration-700 ease-in-out" />
        <path 
          d={pathData} 
          fill="none" 
          stroke="#34A853" 
          strokeWidth="2" 
          vectorEffect="non-scaling-stroke" 
          strokeLinejoin="round" 
          strokeLinecap="round" 
          className="transition-all duration-700 ease-in-out"
        />
        
        {hoverIndex !== null && points[hoverIndex] && (
          <g>
            <line 
              x1={points[hoverIndex][0]} 
              y1={0} 
              x2={points[hoverIndex][0]} 
              y2={height} 
              stroke="#34A853" 
              strokeWidth="1" 
              strokeDasharray="4 4" 
              vectorEffect="non-scaling-stroke"
              opacity="0.6"
            />
            <circle 
              cx={points[hoverIndex][0]} 
              cy={points[hoverIndex][1]} 
              r="4" 
              fill="#fff" 
              stroke="#34A853" 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              className="shadow-sm"
            />
          </g>
        )}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (() => {
        const ratio = points.length > 1 ? hoverIndex / (points.length - 1) : 0;
        const leftPercent = ratio * 100;
        
        return (
          <div 
            className="absolute top-0 pointer-events-none transition-all duration-75 z-50"
            style={{ left: `${leftPercent}%`, transform: `translate(-${leftPercent}%, -110%)` }}
          >
            <div className="bg-[#1A1A1A] text-white px-2.5 py-1.5 rounded-lg shadow-md whitespace-nowrap flex flex-col items-center relative">
              <span className="font-bold text-[12px] mb-0.5 tracking-tight">
                ${data[hoverIndex].amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[#A3A3A3] text-[9px] font-medium">
                {new Date(data[hoverIndex].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
              </span>
              <div 
                className="absolute -bottom-1 w-2 h-2 bg-[#1A1A1A] rotate-45 rounded-[1px]" 
                style={{ left: `clamp(10px, ${leftPercent}%, calc(100% - 10px))`, transform: 'translateX(-50%)' }}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// =========================================================================
// 🌟 THE UNIVERSAL STATE TAXONOMY
// =========================================================================
const getMacroState = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (["claim_completed", "completed", "successful", "claimed", "paid", "settled"].includes(s)) return 'COMPLETED';
    if (["failed", "rejected", "expired", "cancelled", "claim_canceled"].includes(s)) return 'FAILED';
    if (["pending", "processing", "in_escrow", "claiming", "active", "ready", "deploying"].includes(s)) return 'IN_PROGRESS';
    return 'OTHER';
};

export const MainDashboard = ({ onLogout }: MainDashboardProps) => {
  useIdleTimeout(45);

  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname.split('/').pop() || "dashboard";

  const accounts = useStore((state) => state.accounts) as any[];
  const setAccounts = useStore((state) => state.setAccounts) as any;
  
  const activeAccount = useStore((state) => state.activeAccount) as any;
  const setActiveAccount = useStore((state) => state.setActiveAccount) as any;
  
  const { balances, hasUsdcTrustline, isSyncing } = useLiveVault(activeAccount?.walletAddress);
  // 🌟 FINAL ARMOR: Pull the master REST sync lock from Zustand
  const isInitialSyncComplete = useStore((state: any) => state.isInitialSyncComplete);

  // const NATIVE_TOKEN_ID = import.meta.env.VITE_TESTNET_USDC || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";
  // const { isFetching: isNativeFetching } = useSorobanBalance(activeAccount?.walletAddress, NATIVE_TOKEN_ID);

  // 🌟 NEW: THE BULLETPROOF STATE AUTO-HEALER
  useEffect(() => {
    if (parseFloat(balances.xlm) > 0 && activeAccount && !activeAccount.isReady) {
      const healedAccount = { ...activeAccount, isReady: true };
      setActiveAccount(healedAccount); 
      
      try {
        const storedStr = localStorage.getItem("bingtellar_user");
        if (storedStr) {
           const storedUser = JSON.parse(storedStr);
           localStorage.setItem("bingtellar_user", JSON.stringify({ ...storedUser, isReady: true })); 
        }
      } catch (e) {
        console.warn("Auto-healer caught a local cache formatting error. Proceeding safely.");
      }
      
      api.patch(`/users/${activeAccount.id}`, { isReady: true }).catch(() => null); 
    }
  }, [balances.xlm, activeAccount?.isReady, activeAccount?.id, setActiveAccount]);

  const lastPaymentTime = useRef<number>(0);
  useEffect(() => {
    const handlePayment = () => { lastPaymentTime.current = Date.now(); };
    window.addEventListener('optimistic_payment_sent', handlePayment);
    return () => window.removeEventListener('optimistic_payment_sent', handlePayment);
  }, []);

  const [pinInput, setPinInput] = useState("");
  const [vaultSetupState, setVaultSetupState] = useState<"idle" | "loading" | "success">("idle");
  const [trustlineConfirmed, setTrustlineConfirmed] = useState(false);
  const [activationError, setActivationError] = useState("");

  const transactions = useStore((state) => state.transactions) as any[];

  // 🌟 MODAL STATES
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [isPayRequestModalOpen, setIsPayRequestModalOpen] = useState(false);
  
  // 🌟 COPILOT STATES
  const isRadarOpen = useStore((state: any) => state.isRadarOpen);
  const setIsRadarOpen = useStore((state: any) => state.setIsRadarOpen);
  const radarLayoutMode = useStore((state: any) => state.radarLayoutMode) || 'sidebar';
  const setRadarLayoutMode = useStore((state: any) => state.setRadarLayoutMode);
  
  // 🌟 SUPPORT MODAL STATE
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportTxId, setSupportTxId] = useState("");
  
  const [withdrawalPrefill, setWithdrawalPrefill] = useState<any>(null);
  const [emailPrefill, setEmailPrefill] = useState<any>(null);
  const [sendAmountPrefill, setSendAmountPrefill] = useState<string | number>(""); 
  const [selectedRequestId, setSelectedRequestId] = useState("");

  const [isInitialLoad, setIsInitialLoad] = useState(!useStore.getState().activeAccount);  
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isAccountSwitching, setIsAccountSwitching] = useState(false);

  // Keep UX skeletons working when URL changes
  useEffect(() => {
    setIsPageLoading(true);
    const timer = setTimeout(() => setIsPageLoading(false), 800);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const currentUserId = useMemo(() => {
    if (activeAccount && activeAccount.id) return activeAccount.id; 
    return "9"; 
  }, [activeAccount]);

  const sessionMaster = useMemo(() => {
    try {
      const stored = localStorage.getItem("bingtellar_user");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, []);

  const sessionMasterId = sessionMaster?.id;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reqId = urlParams.get('pay_req'); 
    if (reqId) {
      setSelectedRequestId(reqId);
      setIsPayRequestModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 🌟 RESTORED: Central Sync Engine Hook
  useDashboardSync(sessionMasterId as string);

  useEffect(() => {
    if (activeAccount || !sessionMasterId) {
      const timer = setTimeout(() => setIsInitialLoad(false), 300);
      return () => clearTimeout(timer);
    }
  }, [activeAccount, sessionMasterId]);

  // 🌟 RESTORED: Vault Activation Function
  const handleActivateVault = async () => {
    if (pinInput.length < 6) return;
    setVaultSetupState("loading");
    setActivationError("");

    try {
      let encryptedKey = activeAccount?.encryptedWalletKey;
      
      if (!encryptedKey) {
        try {
          const res = await api.get(`/users/${activeAccount?.id}`);
          const fetchedData = res.data;
          
          if (fetchedData?.user?.encryptedWalletKey) {
            encryptedKey = fetchedData.user.encryptedWalletKey;
            setActiveAccount({ ...activeAccount, encryptedWalletKey: encryptedKey }); 
            
            const storedStr = localStorage.getItem("bingtellar_user");
            if (storedStr) {
               const storedUser = JSON.parse(storedStr);
               localStorage.setItem("bingtellar_user", JSON.stringify({ ...storedUser, encryptedWalletKey: encryptedKey }));
            }
          }
        } catch (e) {
          console.warn("Could not fetch missing key from backend", e);
        }
      }

      if (!encryptedKey) throw new Error("Secure key missing from session. Please log out and log back in.");
      if (!window.crypto || !window.crypto.subtle) throw new Error("Insecure browser environment. Must run on localhost or HTTPS.");

      let rawSecretKey = "";
      try {
        rawSecretKey = await LocalCryptoUtil.decrypt(encryptedKey, pinInput);
      } catch (e) {
        throw new Error("Incorrect PIN. Please try again.");
      }

      if (!rawSecretKey || !rawSecretKey.startsWith("S") || rawSecretKey.length !== 56) {
        throw new Error("Incorrect PIN. Decryption yielded invalid data.");
      }

      // 🌟 DYNAMIC NETWORK ROUTING
      const isMainnet = import.meta.env.VITE_STELLAR_NETWORK === 'mainnet';
      const horizonUrl = isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
      const currentNetwork = isMainnet ? Networks.PUBLIC : Networks.TESTNET;

      const horizonServer = new Horizon.Server(horizonUrl); 
      const userKeypair = Keypair.fromSecret(rawSecretKey);
      
      let userAccount;
      try {
        userAccount = await horizonServer.loadAccount(userKeypair.publicKey());
      } catch (e) {
        throw new Error("Wallet not found on blockchain. Admin may not have funded it yet.");
      }
      
      const platformRes = await api.get(`/platform/info`);
      if (!platformRes.data?.platformPublicKey) throw new Error("Failed to fetch platform issuer key.");
      const { platformPublicKey } = platformRes.data;
      
      const usdcAsset = new Asset("USDC", platformPublicKey);

      const tx = new TransactionBuilder(userAccount, { fee: "100", networkPassphrase: currentNetwork })
        .addOperation(Operation.changeTrust({ asset: usdcAsset }))
        .setTimeout(30)
        .build();

      tx.sign(userKeypair);
      
      try {
        await horizonServer.submitTransaction(tx);
      } catch (submitErr: any) {
        let errCode = "Blockchain submission failed.";
        if (submitErr?.response?.data?.extras?.result_codes?.operations) {
           errCode = "Stellar Error: " + submitErr.response.data.extras.result_codes.operations.join(", ");
           if (errCode.includes("op_low_reserve")) {
             errCode = "Blockchain rejected: Admin must fund wallet with 2.5 XLM, not 1.5 XLM.";
           }
        }
        throw new Error(errCode);
      }
      
      setVaultSetupState("success");
      setPinInput(""); 
      
      // 🌟 FIXED: Fire the new unified event bus
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC')); 

      setTimeout(() => {
        setTrustlineConfirmed(true);
      }, 1500);

    } catch (error: any) {
      console.error("Vault Activation Error:", error);
      setActivationError(error.message || "Network error. Please try again.");
      setVaultSetupState("idle");
    }
  };

  const hasPendingItems = useMemo(() => {
    if (!Array.isArray(transactions)) return false;
    return transactions.some(tx => 
      ["pending", "processing"].includes(tx.status?.toLowerCase()) ||
      ["claim_pending", "claim_processing", "pending"].includes(tx.trackingState?.toLowerCase())
    );
  }, [transactions]);

  // SMART POLLING: Only poll when pending items exist
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (hasPendingItems) {
      intervalId = setInterval(() => {
        // 🌟 FIXED: Fire the new unified event bus
        window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      }, 20000); 
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [hasPendingItems]);

  // =========================================================================
  // 1. THE CONTEXT FETCHING ENGINE
  // =========================================================================
  const [escrowsDb, setEscrowsDb] = useState<any[]>([]);
  const [isContextFetching, setIsContextFetching] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchContextData = async () => {
      try {
        const escrowsRes = await api.get('/escrows').catch(() => ({ data: [] }));
        let combinedEscrows = Array.isArray(escrowsRes.data) ? escrowsRes.data : [];

        const bulkTxs = transactions.filter((tx: any) => tx.type === 'bulk_payment');
        if (bulkTxs.length > 0) {
           const batchPromises = bulkTxs.map((tx: any) => {
              const bId = tx.batchId || tx.reference;
              return api.get(`/escrows/batch/${bId}`).catch(() => null);
           });
           const batchResults = await Promise.all(batchPromises);
           batchResults.forEach(res => {
              if (res && res.data && Array.isArray(res.data)) {
                  combinedEscrows = [...combinedEscrows, ...res.data];
              }
           });
        }

        if (isMounted) setEscrowsDb(combinedEscrows);
      } catch (error) {
        console.error("Failed to fetch transaction context:", error);
      } finally {
        if (isMounted) setIsContextFetching(false);
      }
    };

    fetchContextData();
    const interval = setInterval(fetchContextData, 60000);
    // 🌟 FIXED: Listen to the new unified event bus
    window.addEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('BLINK_ONCHAIN_SYNC', fetchContextData);
    };
  }, [transactions.length]); // 🔥 FIX: Kills the infinite network storm


  // =========================================================================
  // 2. THE TITANIUM AGGREGATE ENGINE
  // =========================================================================
  const mapDbStatusToUi = (dbStatus: string, trackingState?: string, txType?: string) => {
    const s = String(dbStatus || "").toLowerCase();
    const t = String(trackingState || "").toLowerCase();

    if (["claim_completed", "claimed", "completed", "released", "paid", "successful", "settled"].includes(s)) return "completed";
    if (["failed", "rejected", "expired"].includes(s)) return "failed";
    if (["claim_canceled", "cancelled"].includes(s)) return "cancelled"; 

    if (txType === 'payment' || txType === 'incoming_escrow' || txType === 'transfer' || txType === 'bulk_payment') {
        if (s === 'claiming' || t === 'claim_processing' || t === 'claim_started') return 'claiming';
        if (s === 'in_escrow' || s === 'active' || s === 'ready') return 'in_escrow';
        if (s === 'deploying' || s === 'pending' || s === 'processing') return 'processing';
    }

    if (s === "processing") return "processing"; 
    return "pending"; 
  };

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
  
  const localFilteredTxs = useMemo(() => {
      const scopedTxs = safeTransactions.filter((tx: any) => {
          if (isMasterWallet) return !tx.subAccountId || tx.subAccountId === null;
          return String(tx.subAccountId) === String(activeAccount?.id);
      });

      return scopedTxs.map((tx: any) => {
        const cleanReference = tx.reference ? String(tx.reference).replace("_incoming", "") : String(tx.id);
        const currentType = tx.type as string;
        let enrichedTx = { ...tx };

        if (currentType === 'bulk_payment') {
            const bulkChildren = escrowsDb.filter((e: any) => 
               e.batchId === cleanReference || e.reference === cleanReference || e.claimId === cleanReference
            );

            if (bulkChildren.length > 0) {
                const total = bulkChildren.length;
                
                const healedChildren = bulkChildren.map(c => {
                    let parsedTimeline: any[] = [];
                    try { 
                        const raw = typeof c.timeline === 'string' ? JSON.parse(c.timeline) : (c.timeline || []); 
                        parsedTimeline = Array.isArray(raw) ? raw : []; 
                    } catch(e) {}
                    
                    const hasFailedEvent = parsedTimeline.some((evt: any) => {
                        const s = String(evt?.state || '').toLowerCase();
                        return s.includes('fail') || s.includes('expire');
                    });
                    const hasCancelledEvent = parsedTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
                    
                    const rawStatus = String(c.status || '').toLowerCase();
                    let healedStatus = rawStatus || 'pending';

                    if (hasCancelledEvent && !['cancelled', 'claim_canceled'].includes(healedStatus)) {
                        healedStatus = 'cancelled';
                    } else if (hasFailedEvent && healedStatus !== 'failed') {
                        healedStatus = 'failed';
                    }

                    return { ...c, status: healedStatus, trackingState: String(c.trackingState || '').toLowerCase() };
                });

                const completed = healedChildren.filter(c => c.status === 'completed' || c.status === 'claimed').length;
                const cancelled = healedChildren.filter(c => c.status === 'cancelled' || c.status === 'claim_canceled').length;
                const failed = healedChildren.filter(c => c.status === 'failed' || c.status === 'rejected' || c.status === 'expired').length;
                const claiming = healedChildren.filter(c => c.trackingState === 'claim_processing' || c.trackingState === 'claim_started').length;
                const pending = healedChildren.filter(c => c.status === 'pending' || c.status === 'processing' || c.status === 'deploying').length;

                const totalTerminal = completed + cancelled + failed;

                if (pending > 0) {
                    enrichedTx.status = 'processing';
                } else if (cancelled === total) {
                    enrichedTx.status = 'cancelled'; 
                } else if (failed + cancelled === total) {
                    enrichedTx.status = 'failed'; 
                } else if (totalTerminal === total) {
                    enrichedTx.status = 'completed'; 
                } else if (claiming > 0 || completed > 0) {
                    enrichedTx.status = 'claiming'; 
                } else {
                    enrichedTx.status = 'in_escrow'; 
                }
            }
        } else {
            const relatedEscrow = escrowsDb.find((e: any) => String(e.id) === cleanReference || String(e.claimId) === cleanReference); 
            if (relatedEscrow) {
                let parsedTimeline: any[] = [];
                try { 
                    const raw = typeof relatedEscrow.timeline === 'string' ? JSON.parse(relatedEscrow.timeline) : (relatedEscrow.timeline || []); 
                    parsedTimeline = Array.isArray(raw) ? raw : []; 
                } catch(e) {}
                
                const hasFailedEvent = parsedTimeline.some((evt: any) => {
                    const s = String(evt?.state || '').toLowerCase();
                    return s.includes('fail') || s.includes('expire');
                });
                const hasCancelledEvent = parsedTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
                
                const rawStatus = String(relatedEscrow.status || '').toLowerCase();
                let healedStatus = rawStatus || 'pending';

                if (hasCancelledEvent && !['cancelled', 'claim_canceled'].includes(healedStatus)) {
                    healedStatus = 'cancelled';
                } else if (hasFailedEvent && healedStatus !== 'failed') {
                    healedStatus = 'failed';
                }

                enrichedTx = { ...enrichedTx, status: healedStatus, trackingState: String(relatedEscrow.trackingState || '').toLowerCase() };
            }
        }

        return {
          ...enrichedTx,
          status: mapDbStatusToUi(enrichedTx.status, enrichedTx.trackingState, currentType)
        };
      }).sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  }, [safeTransactions, isMasterWallet, activeAccount?.id, escrowsDb]);

  const latestTxsRef = useRef(localFilteredTxs);
  const activeAccountRef = useRef(activeAccount);

  useEffect(() => {
    latestTxsRef.current = localFilteredTxs;
  }, [localFilteredTxs]);

  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);

  // 🌟 THE AGENTIC INTERCEPTOR
  useEffect(() => {
    const handleAgentAction = (e: any) => {
       const { type, amount, recipient, prefill, format, timeframe, label, name, network, accountName, recipientName, note, memo, description, method } = e.detail;
       
       if (type === 'SEND') {
          let mergedPrefill = prefill ? { ...prefill } : {};
          if (recipient) {
             mergedPrefill.details = recipient;
             mergedPrefill.email = recipient;
          }
          
          const finalName = label || name || accountName || recipientName || note || memo || description || prefill?.label || prefill?.name || prefill?.accountName || prefill?.recipientName || prefill?.note || prefill?.memo;
          if (finalName) mergedPrefill.name = finalName;
          
          setEmailPrefill(Object.keys(mergedPrefill).length > 0 ? mergedPrefill : null);
          if (amount) setSendAmountPrefill(amount);
          setIsSendEmailModalOpen(true);
       } 
       else if (type === 'WITHDRAWAL') {
          let mergedPrefill = prefill ? { ...prefill } : {};
          if (amount) mergedPrefill.amount = amount;
          if (recipient) mergedPrefill.details = recipient;
          
          if (method) mergedPrefill.method = method; 
          
          const finalName = label || name || accountName || recipientName || note || memo || description || prefill?.label || prefill?.name || prefill?.accountName || prefill?.recipientName || prefill?.note || prefill?.memo;
          if (finalName) mergedPrefill.name = finalName;
          
          if (network) mergedPrefill.network = network;

          setWithdrawalPrefill(Object.keys(mergedPrefill).length > 0 ? mergedPrefill : null);
          setIsWithdrawalModalOpen(true);
       }
       else if (type === 'DEPOSIT') {
          setIsDepositModalOpen(true);
       }
       else if (type === 'VIEW_TRANSACTIONS') {
         navigate("/dashboard/transactions");
       }
       else if (type === 'REQUEST_PAYMENT') {
         navigate("/dashboard/payments");
       }
       else if (type === 'CREATE_LEDGER') {
         setIsCreateModalOpen(true);
       }
       else if (type === 'OPEN_SUPPORT_TICKET') {
         if (e.detail.transactionId) {
            setSupportTxId(e.detail.transactionId); 
         } else {
            setSupportTxId(""); 
         }
         setIsSupportModalOpen(true);
       }
       else if (type === 'NAVIGATE_SETTINGS') {
         navigate("/dashboard/settings");
         setIsRadarOpen(false); 
       }
       else if (type === 'EXPORT_DOCUMENT') {
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();

          const txsToExport = latestTxsRef.current.filter((tx: any) => {
              if (timeframe === 'all') return true;
              const txDate = new Date(tx.date || tx.createdAt);
              if (timeframe === 'this_month') return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
              if (timeframe === 'last_month') {
                  const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                  const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                  return txDate.getMonth() === targetMonth && txDate.getFullYear() === targetYear;
              }
              if (timeframe === 'this_year') return txDate.getFullYear() === currentYear;
              if (timeframe === 'today') return txDate.toDateString() === now.toDateString();
              return true;
          });

          if (txsToExport.length === 0) return; 

          if (format === 'csv') {
              const headers = "Date,Type,Status,Amount,Reference,Description\n";
              const rows = txsToExport.map((tx: any) => {
                  const date = new Date(tx.date || tx.createdAt).toISOString();
                  const desc = (tx.description || '').replace(/"/g, '""'); 
                  return `"${date}","${(tx.type || '').toUpperCase()}","${(tx.status || '').toUpperCase()}","${tx.amount}","${tx.reference || tx.id}","${desc}"`;
              }).join("\n");
              
              const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Blink_Treasury_Ledger_${timeframe.toUpperCase()}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
          } 
          else if (format === 'pdf') {
              const currentAcc = activeAccountRef.current;
              const companyName = currentAcc ? (currentAcc.businessName || currentAcc.name || currentAcc.alias || 'Corporate Account') : 'Corporate Account';
              
              const isMaster = !currentAcc || !currentAcc.muxedId || currentAcc.muxedId === 'MASTER_WALLET';
              const accountId = currentAcc ? (isMaster ? (currentAcc.id || 'Primary Ledger') : currentAcc.muxedId) : 'Primary Ledger';
              
              const rawWallet = currentAcc?.walletAddress || currentAcc?.muxedAddress || '';
              const walletAddressStr = rawWallet.length > 20 
                 ? `${rawWallet.substring(0, 12)}...${rawWallet.substring(rawWallet.length - 12)}` 
                 : 'Not Available';

              const generationDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

              const rowsHtml = txsToExport.map((tx: any) => {
                  const date = new Date(tx.date || tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const txAmount = Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
                  const txType = (tx.type || 'Transaction').toUpperCase();
                  const txStatus = (tx.status || 'COMPLETED').toUpperCase();
                  
                  const statusColor = txStatus === 'COMPLETED' || txStatus === 'SETTLED' ? '#10B981' : txStatus === 'FAILED' ? '#EF4444' : '#F59E0B';
                  
                  return `<tr>
                    <td style="padding:14px 8px;border-bottom:1px solid #f0f0f0;color:#555;">${date}</td>
                    <td style="padding:14px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;">${txType}</td>
                    <td style="padding:14px 8px;border-bottom:1px solid #f0f0f0;font-weight:bold;color:#111;">$${txAmount}</td>
                    <td style="padding:14px 8px;border-bottom:1px solid #f0f0f0;"><span style="color:${statusColor};font-weight:bold;font-size:11px;">${txStatus}</span></td>
                  </tr>`;
              }).join('');
              
              const htmlContent = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                      <title>Blink Treasury Statement</title>
                      <style>
                          @page { margin: 0; }
                          @media print {
                              body { 
                                  margin: 1.5cm; 
                                  -webkit-print-color-adjust: exact; 
                                  print-color-adjust: exact; 
                              }
                              .footer {
                                  position: fixed;
                                  bottom: 0;
                                  left: 0;
                                  right: 0;
                              }
                          }
                          body {
                              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                              color: #111;
                              padding: 40px;
                          }
                          .footer {
                              margin-top: 60px;
                              padding-top: 15px;
                              border-top: 1px solid #eaeaea;
                              text-align: center;
                              color: #888;
                              font-size: 11px;
                              line-height: 1.6;
                          }
                      </style>
                  </head>
                  <body>
                      <!-- CORPORATE HEADER -->
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 40px; border-bottom: 2px solid #111; padding-bottom: 20px;">
                        <div>
                           <h1 style="margin:0; font-size: 28px; letter-spacing: -0.5px;">Treasury Statement</h1>
                           <p style="color:#111; font-size:16px; font-weight:600; margin-top:12px; margin-bottom:4px;">${companyName}</p>
                           <p style="color:#666; font-size:13px; margin:0; font-family: monospace;">Ledger ID: ${accountId}</p>
                           <p style="color:#666; font-size:13px; margin:2px 0 0 0; font-family: monospace;">Wallet: ${walletAddressStr}</p>
                           <p style="color:#666; font-size:13px; margin-top:12px; margin-bottom:0;">Period: ${timeframe.replace('_', ' ').toUpperCase()}</p>
                        </div>
                        <div style="text-align:right;">
                           <h2 style="margin:0; font-size:24px; letter-spacing: -0.5px;">Blink<span style="color:#3B82F6;">.</span></h2>
                           <p style="color:#666; font-size:12px; margin-top:4px; margin-bottom:0;">A Bingtellar Company</p>
                        </div>
                      </div>
                      
                      <!-- LEDGER TABLE -->
                      <table style="width:100%; border-collapse: collapse; text-align:left; font-size:13px; margin-bottom: 100px;">
                          <tr style="background:#f8f9fa;">
                            <th style="padding:12px 8px; border-bottom:1px solid #ddd; color:#666; font-weight:600;">DATE</th>
                            <th style="padding:12px 8px; border-bottom:1px solid #ddd; color:#666; font-weight:600;">TYPE</th>
                            <th style="padding:12px 8px; border-bottom:1px solid #ddd; color:#666; font-weight:600;">AMOUNT</th>
                            <th style="padding:12px 8px; border-bottom:1px solid #ddd; color:#666; font-weight:600;">STATUS</th>
                          </tr>
                          ${rowsHtml}
                      </table>

                      <!-- LEGAL & AUDIT FOOTER -->
                      <div class="footer">
                        <p style="margin: 0 0 4px 0; color: #444;"><strong>Blink Treasury & Payments (A Bingtellar Co)</strong></p>
                        <p style="margin: 0 0 4px 0;">Generated securely via Radar Copilot on ${generationDate}</p>
                        <p style="margin: 0;">This document is electronically generated and serves as an official ledger record of on-chain and off-chain disbursements.</p>
                      </div>
                  </body>
                  </html>
              `;

              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              
              const iframeDoc = iframe.contentWindow?.document;
              if (iframeDoc) {
                  iframeDoc.open();
                  iframeDoc.write(htmlContent);
                  iframeDoc.close();
                  
                  setTimeout(() => {
                      iframe.contentWindow?.focus();
                      iframe.contentWindow?.print();
                      setTimeout(() => { document.body.removeChild(iframe); }, 2000);
                  }, 250);
              }
          }
       }
       else if (type === 'CANCEL_ESCROW' || type === 'RELEASE_ESCROW') {
         navigate("/dashboard/transactions");
         setIsRadarOpen(false); 
         
         setTimeout(() => {
             window.dispatchEvent(new CustomEvent('agentic_escrow_action', { 
                 detail: { 
                     action: type, 
                     targetId: e.detail.targetId 
                 } 
             }));
         }, 400); 
       }
    };

    window.addEventListener('agentic_action', handleAgentAction);
    return () => window.removeEventListener('agentic_action', handleAgentAction);
  }, [navigate, setIsRadarOpen]);

  // =========================================================================
  // 🌟 3. ENTERPRISE ACCOUNTING MATRIX
  // =========================================================================
  const userMetrics = useMemo(() => {
      const allTxs = localFilteredTxs;

      const successful = allTxs.filter(tx => getMacroState(tx.status) === 'COMPLETED').length;
      const failed = allTxs.filter(tx => getMacroState(tx.status) === 'FAILED').length;
      const pending = allTxs.filter(tx => getMacroState(tx.status) === 'IN_PROGRESS').length;
      const totalTxCount = successful + failed + pending;

      const outboundTxs = allTxs.filter(tx => 
          ["withdrawal", "payment", "transfer", "send", "bulk_payment"].includes(tx.type)
      );
      const validCommittedTxs = outboundTxs.filter(tx => 
          getMacroState(tx.status) === 'COMPLETED' || getMacroState(tx.status) === 'IN_PROGRESS'
      );
      const totalSent = validCommittedTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      const avgAmount = validCommittedTxs.length > 0 ? totalSent / validCommittedTxs.length : 0;

      const totalYield = allTxs
          .filter(tx => 
              tx.type === "deposit" && 
              getMacroState(tx.status) === 'COMPLETED' && 
              (tx.reference?.includes("_yield") || tx.description?.includes("Yield Harvest"))
          )
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      
      return {
          successfulPayments: successful,
          pendingPayments: pending,
          failedPayments: failed,
          outboundCount: totalTxCount, 
          totalSentOut: totalSent,
          totalYieldEarned: totalYield,
          averageAmount: avgAmount
      };
  }, [localFilteredTxs]);

  const { successfulPayments, pendingPayments, failedPayments, outboundCount, totalSentOut, totalYieldEarned, averageAmount } = userMetrics;

  const chartData = useMemo(() => {
    if (!activeAccount?.id || localFilteredTxs.length === 0) {
        return [ { amount: 0, date: new Date().toISOString() }, { amount: 0, date: new Date().toISOString() } ];
    }

    const validOutbound = localFilteredTxs
      .filter((tx: any) => 
          ["withdrawal", "payment", "transfer", "send", "bulk_payment"].includes(tx.type) && 
          (getMacroState(tx.status) === 'COMPLETED' || getMacroState(tx.status) === 'IN_PROGRESS')
      )
      .map((tx: any) => ({ 
          amount: Number(tx.amount) || 0, 
          date: tx.date || new Date().toISOString() 
      }));

    const plottedTxs = [...validOutbound].sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });

    if (plottedTxs.length === 0) {
        return [ { amount: 0, date: new Date().toISOString() }, { amount: 0, date: new Date().toISOString() } ];
    }

    const chronologicalTxs = [...plottedTxs].reverse();
    let cumulativeSum = 0;

    const firstTxTime = new Date(chronologicalTxs[0].date).getTime();
    const safeOriginTime = isNaN(firstTxTime) ? Date.now() : firstTxTime;
    
    const originDate = new Date(safeOriginTime - 60000).toISOString();
    const dataPoints = [{ amount: 0, date: originDate }];

    chronologicalTxs.forEach(tx => {
      cumulativeSum += tx.amount;
      const txTime = new Date(tx.date).getTime();
      dataPoints.push({ 
          amount: cumulativeSum, 
          date: isNaN(txTime) ? new Date().toISOString() : tx.date 
      });
    });

    return dataPoints;
  }, [localFilteredTxs, activeAccount?.id]);

  const handleProfileClick = () => navigate("/dashboard/profile");
  const handleSeeAllAccounts = () => navigate("/dashboard/accounts");
  
  const handleAccountSwitch = (account: any) => {
    setIsAccountSwitching(true);
    setActiveAccount(account);
    setTimeout(() => setIsAccountSwitching(false), 800);
    navigate("/dashboard");
  };

  const handleGlobalCreateSuccess = () => {
    setIsCreateModalOpen(false);
    navigate("/dashboard/accounts"); 
  };

  const handleRepeatTransaction = (tx: any) => {
    if (tx.type === "withdrawal") {
      const meta = tx.metadata?.recipientDetails || {};
      
      setWithdrawalPrefill({
        method: tx.network === "mobile_money" ? "mobile" : "bank",
        bankName: meta.bankName || meta.provider || "",
        details: meta.accountNumber || meta.phoneNumber || "",
        name: meta.accountName || "",
        amount: tx.amount 
      });
      
      setIsWithdrawalModalOpen(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("bingtellar_user");
    if (onLogout) onLogout();
    else window.location.href = "/login"; 
  };

  const handleInitiatePay = (recipient: any) => {
    const type = recipient.type || (recipient.email ? "Email" : "Wallet");
    
    if (type === "Email") {
      setEmailPrefill(recipient);
      setIsSendEmailModalOpen(true);
    } else {
      setWithdrawalPrefill({
        method: type === "Bank" ? "bank" : type === "Mobile money" ? "mobile" : "usdc",
        ...recipient
      });
      setIsWithdrawalModalOpen(true);
    }
  };

  const handleSetupComplete = () => {
    if (activeAccount) {
      const updatedAccount = { ...activeAccount, isReady: true };
      setActiveAccount(updatedAccount);
      
      const safeAccounts = Array.isArray(accounts) ? accounts : [];
      const newAccounts = safeAccounts.map(acc => 
         acc && (String(acc.id) === String(updatedAccount.id) && acc.muxedId === updatedAccount.muxedId) 
         ? updatedAccount : acc
      ).filter(Boolean);

      setAccounts(newAccounts); 
    }
    navigate("/dashboard/balance");
  };

  if (!activeAccount && isInitialLoad) {
    return (
      <div className="h-screen w-screen bg-[#F5F4F0] flex flex-col items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-[14px] font-bold text-[#8B8B8B] mt-6 animate-pulse tracking-wide">
          Initializing Secure Ledger
        </p>
      </div>
    );
  }

  if (location.pathname.endsWith("/setup")) {
    return (
      <div className="h-screen w-screen bg-[#F5F4F0] flex items-center justify-center overflow-hidden">
        <AccountSetupFlow 
          activeAccount={activeAccount} 
          onComplete={handleSetupComplete} 
          onClose={() => navigate("/dashboard")} 
        />
      </div>
    );
  }

  // 🌟 THE FIX: Never guess the Ready state. Let the skeleton loader handle the wait.
  const isActuallyReady = activeAccount?.isReady || parseFloat(balances.xlm) > 0;
  // 🌟 PERFECTED: Locked by the master Zustand boot sequence
  const isDataLoading = isInitialLoad || isContextFetching || isSyncing || !isInitialSyncComplete;

  const displayAccount = useMemo(() => {
    if (!activeAccount) return null;
    // Only spoof the sidebar to "Ready" if we mathematically know they have funds
    if (parseFloat(balances.xlm) > 0 && !activeAccount.isReady) {
       return { ...activeAccount, isReady: true };
    }
    return activeAccount;
  }, [activeAccount, balances.xlm]);

  return (
    <>
      <DashboardLayout 
        onProfileClick={handleProfileClick}
        onLogout={handleLogout}
        onSeeAllAccounts={handleSeeAllAccounts}
        onCreateAccount={() => setIsCreateModalOpen(true)}
        accounts={accounts}
        activeAccount={displayAccount} // 🌟 Passed the flicker-free account to the sidebar
        onAccountSwitch={handleAccountSwitch}
        onOpenCopilot={() => setIsRadarOpen(true)}
      >
        <Routes>
          <Route path="/profile" element={<UserProfile onLogout={handleLogout} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/balance" element={<BalanceWallet isFetching={isPageLoading} />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/accounts" element={<Accounts userId={currentUserId as string} activeAccountId={activeAccount?.id} onAccountSelect={handleAccountSwitch} onClose={() => navigate("/dashboard")} />} />
          <Route path="/transactions" element={<TransactionHistory accountId={activeAccount?.id?.toString()} onOpenDeposit={() => setIsDepositModalOpen(true)} onRepeatTransaction={handleRepeatTransaction} isFetching={isPageLoading} />} />
          <Route path="/recipients" element={<RecipientsAddressbook onInitiatePay={handleInitiatePay} isFetching={isPageLoading} />} />
          <Route path="/radar" element={<Radar currentTab={activeTab} />} />

          {/* THE DEFAULT OVERVIEW DASHBOARD */}
          <Route path="/" element={
            <div className="animate-in fade-in duration-500">
              <h1 className="text-[16px] font-bold mb-8 lg:mb-10 px-1">
                {isDataLoading ? (
                  <div className="h-5 w-48 bg-gray-200 animate-pulse rounded"></div>
                ) : (
                  `Welcome, ${activeAccount?.name?.split(' ')[0] || 'Fren'}`
                )}
              </h1>
              
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6 mb-10 px-1">
                <div>
                  <h2 className="text-[20px] font-bold mb-1">Let's get you started.</h2>
                  <p className="text-[#757575] text-[14px]">
                    {!isActuallyReady 
                      ? "Set up your on-chain account to access financial tools" 
                      : "Manage your liquidity, track operations, disburse payments and earn."}
                  </p>
                </div>
                <button 
                  onClick={() => navigate(!isActuallyReady ? "/dashboard/setup" : "/dashboard/balance")} 
                  className="bg-black text-white px-5 py-2.5 rounded-[12px] font-bold text-[13px] flex items-center justify-center gap-2 shadow-sm w-full lg:w-auto hover:bg-gray-800 transition-colors"
                >
                  {!isActuallyReady ? (
                    <>Setup Account <ArrowUpRight size={16} /></>
                  ) : (
                    <>View Ledger <ArrowUpRight size={16} /></>
                  )}
                </button>
              </div>
              <hr className="border-[#F0F0EF] mb-12" />
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-16 px-1">
                <div className="lg:col-span-8 relative min-h-[168px]">
                  <h3 className="text-[15px] font-bold mb-6">Learn</h3>
                  <div className="relative overflow-hidden rounded-[10px] border border-[#D1D4D7]/50 shadow-sm">
                    <div className="absolute inset-0 z-0 opacity-40" style={{ background: "linear-gradient(90deg, #F5F5F5 20.19%, #E5FFFF 92.79%)" }}></div>
                    <div className="relative z-10 p-6 lg:p-8 flex flex-col sm:flex-row items-start gap-6">
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex-shrink-0"><PlayCircle size={28} className="text-[#D44438]" /></div>
                      <div>
                        <div className="font-bold text-[14px] mb-2 flex items-center gap-2">Watch demo video <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /></div>
                        <p className="text-[13px] text-[#757575] mb-4 max-w-sm leading-relaxed">Learn how to setup account, manage and disburse payments</p>
                        <button className="text-[13px] font-bold underline underline-offset-4 decoration-2">Watch now</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden lg:block lg:col-span-4">
                  <h3 className="text-[15px] font-bold mb-3">Actions</h3>
                  <p className="text-[11px] text-[#A3A3A3] mb-6 tracking-wide uppercase font-bold opacity-50">Quickly initiate actions</p>
                  <div className="space-y-4">
                    {[{ label: "Disburse payments", id: "payments" }, { label: "Create new recipient", id: "recipients" }, { label: "Analyze transaction", id: "radar" }].map((a) => (
                      <div key={a.id} onClick={() => navigate(`/dashboard/${a.id}`)} className="flex justify-between items-center text-[13px] font-bold cursor-pointer hover:opacity-80 transition-opacity" style={{ color: "#1F94F0" }}>{a.label} <ChevronRight size={14} /></div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mb-8 px-1">
                <h3 className="text-[15px] font-bold">Overview</h3>
                <div className="flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Live Cloud Data</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-1">
                <div className="lg:col-span-8 border border-[#F0F0EF] rounded-[24px] bg-white flex flex-col shadow-sm overflow-hidden relative min-h-[160px] md:min-h-[220px]">
                  <div className="p-6 lg:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-4 relative z-10 flex-grow pointer-events-none">
                    <div>
                      <div className="text-[11px] text-[#757575] font-bold uppercase mb-1">Total sent out</div>
                      {isDataLoading ? (
                         <div className="h-7 w-28 bg-gray-200 animate-pulse rounded-md mt-1"></div>
                      ) : (
                         <div className="text-[18px] font-bold text-[#1A1A1A]">${totalSentOut.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] text-[#757575] font-bold uppercase mb-1">Total Yield Revenue</div>
                        {isDataLoading ? (
                        <div className="h-7 w-20 bg-gray-200 animate-pulse rounded-md mt-1"></div>
                      ) : (
                        <div className="text-[18px] font-bold text-[#34A853]">+${totalYieldEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] text-[#757575] font-bold uppercase mb-1">Average amount</div>
                      {isDataLoading ? (
                         <div className="h-7 w-24 bg-gray-200 animate-pulse rounded-md mt-1"></div>
                      ) : (
                         <div className="text-[18px] font-bold text-[#1A1A1A]">${averageAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-[2px] bg-green-500 block md:hidden mt-auto" style={{ boxShadow: "0 -2px 10px rgba(34, 197, 94, 0.4)" }} />

                  <div className="mt-auto relative w-full h-[120px] px-0 hidden md:flex flex-col justify-end overflow-visible">
                    <div className="absolute inset-0 w-full h-full pt-4">
                      {isDataLoading ? (
                        <div className="w-full h-[100px] mt-4 bg-gray-50 animate-pulse rounded-t-xl opacity-60"></div>
                      ) : (
                        <SparklineChart data={chartData} />
                      )}
                    </div>
                    
                    {!isDataLoading && (
                      <div className="relative z-10 mx-6 pt-1 pb-4 flex justify-between text-[11px] text-[#A3A3A3] font-medium pointer-events-none">
                        <span>{chartData.length > 1 ? new Date(chartData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "Origin"}</span>
                        <span>{chartData.length > 1 ? new Date(chartData[chartData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "Today"}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-4 border border-[#F0F0EF] rounded-[24px] p-6 lg:p-8 bg-white shadow-sm overflow-hidden relative">
                  <div className="text-[11px] text-[#757575] font-bold uppercase mb-1">Total Transactions</div>
                  {isDataLoading ? (
                    <div className="h-10 w-16 bg-gray-200 animate-pulse rounded-md mb-6"></div>
                  ) : (
                    <div className="text-[28px] font-bold mb-6 text-[#1A1A1A]">{outboundCount}</div>
                  )}
                  <div className="space-y-4 pb-4">
                    <div className="flex justify-between text-[12px] font-bold">
                      <span className="text-[#A3A3A3] font-medium">Completed</span>
                      {isDataLoading ? <div className="h-4 w-8 bg-gray-200 animate-pulse rounded"></div> : <span className="text-[#1A1A1A]">{successfulPayments}</span>}
                    </div>
                    <div className="flex justify-between text-[12px] font-bold">
                      <span className="text-[#A3A3A3] font-medium">Failed / Cancelled</span>
                      {isDataLoading ? <div className="h-4 w-8 bg-gray-200 animate-pulse rounded"></div> : <span className="text-[#1A1A1A]">{failedPayments}</span>}
                    </div>
                    <div className="flex justify-between text-[12px] font-bold">
                      <span className="text-[#A3A3A3] font-medium">In Progress</span>
                      {isDataLoading ? <div className="h-4 w-8 bg-gray-200 animate-pulse rounded"></div> : <span className="text-[#1A1A1A]">{pendingPayments}</span>}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-green-500" />
                </div>
              </div>
            </div>
          } />
        </Routes>
      </DashboardLayout>

      {isAccountSwitching && (
        <div className="fixed inset-0 z-[200] bg-[#F5F4F0]/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-[14px] font-bold text-[#8B8B8B] mt-6 animate-pulse tracking-wide">
            Switching Workspace...
          </p>
        </div>
      )}

      {!isSyncing && parseFloat(balances.xlm) > 0 && !hasUsdcTrustline && !trustlineConfirmed && (
        <div className="fixed inset-0 z-[100] flex justify-center items-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 p-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
              <ShieldCheck size={32} className="text-blue-600" />
            </div>
            <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Secure Your Vault</h2>
            <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">
              Verification successful. Enter your 6-digit PIN to initialize and secure your institutional USDC account.
            </p>
            
            <input 
              type="password" 
              maxLength={6} 
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setActivationError("");
              }}
              placeholder="••••••" 
              disabled={vaultSetupState !== "idle"} 
              className="w-full bg-[#FAFAFA] border border-[#E8E7E1] rounded-xl px-4 py-4 text-[24px] text-center tracking-[0.3em] font-bold outline-none focus:border-black focus:bg-white transition-all mb-4"
            />
            
            {activationError && <p className="text-red-500 text-[12px] font-bold mb-4">{activationError}</p>}

            <button 
              onClick={handleActivateVault}
              disabled={vaultSetupState !== "idle" || pinInput.length < 6} 
              className={`w-full h-14 rounded-xl font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 ${
                vaultSetupState === "success" 
                  ? "bg-green-500 text-white hover:bg-green-600" 
                  : "bg-black text-white hover:bg-gray-800"
              }`}
            >
              {vaultSetupState === "loading" ? (
                <><Loader2 size={18} className="animate-spin" /> Securing Vault...</>
              ) : vaultSetupState === "success" ? (
                <><CheckCircle2 size={18} /> Vault Secured!</>
              ) : (
                "Confirm PIN"
              )}
            </button>
          </div>
        </div>
      )}

      <CreateAccountModal 
        isOpen={isCreateModalOpen}
        userId={currentUserId as string}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleGlobalCreateSuccess}
      />

     <DepositFlow 
        isOpen={isDepositModalOpen}
        onClose={() => {
          setIsDepositModalOpen(false);
          window.dispatchEvent(new CustomEvent('agentic_modal_closed'));
        }}
      />

      <WithdrawalFlow 
        isOpen={isWithdrawalModalOpen} 
        onClose={() => { 
          setIsWithdrawalModalOpen(false); 
          setWithdrawalPrefill(null); 
          window.dispatchEvent(new CustomEvent('agentic_modal_closed'));
        }} 
        prefillData={withdrawalPrefill}
      />

      <PayRequestFlow 
        isOpen={isPayRequestModalOpen} 
        onClose={() => {
          setIsPayRequestModalOpen(false);
          window.dispatchEvent(new CustomEvent('agentic_modal_closed'));
        }}
        requestId={selectedRequestId}  
      />
      
      {isSendEmailModalOpen && (
        <SendMoneyToEmail
          onClose={() => { 
            setIsSendEmailModalOpen(false); 
            setEmailPrefill(null); 
            setSendAmountPrefill(""); 
            window.dispatchEvent(new CustomEvent('agentic_modal_closed'));
          }}
          prefillEmail={emailPrefill?.details || emailPrefill?.email} 
          prefillAmount={sendAmountPrefill}
        />
      )}

      {/* 🌟 RESTORED: MULTI-LAYOUT COPILOT */}
      {isRadarOpen && (
        <div className="fixed inset-0 z-[300] flex justify-end pointer-events-none">
          
          {/* 🌟 RESTORED BACKDROP: Sidebar mode gets your exact original dark blur. Floating mode gets NO backdrop on desktop so the dashboard is clickable. */}
          {(radarLayoutMode === 'sidebar' || radarLayoutMode === 'fullpage' || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
            <div 
              className="absolute inset-0 bg-[#0F172A]/20 backdrop-blur-sm animate-in fade-in pointer-events-auto" 
              onClick={() => setIsRadarOpen(false)} 
            />
          )}

          {/* Smart Container */}
          <div 
            className={`bg-white flex flex-col animate-in duration-300 pointer-events-auto overflow-hidden ${
              radarLayoutMode === 'sidebar' 
                ? 'relative w-full max-w-xl h-full shadow-2xl border-l border-gray-100 slide-in-from-right rounded-none' 
              : radarLayoutMode === 'fullpage' 
                ? 'fixed inset-0 w-full h-[100dvh] z-[400] rounded-none zoom-in-95' 
              : 'fixed right-4 top-4 bottom-4 lg:top-6 lg:bottom-0 w-[calc(100%-2rem)] lg:w-[380px] rounded-[24px] lg:rounded-b-none lg:rounded-t-[32px] border border-gray-100 lg:border-b-0 shadow-[0_8px_40px_rgba(0,0,0,0.12)] slide-in-from-right-4' 
            }`}
          >
            {/* Drawer Header with Layout Toggles */}
            <div className="px-5 py-3.5 border-b border-[#F0F0EF] flex justify-between items-center bg-white z-10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-xs">
                  <MessageSquareMore size={13} className="text-white fill-white" />
                </div>
                <span className="font-bold text-[14px] text-gray-900 tracking-tight">Radar Copilot</span>
              </div>

              {/* View Toggle Buttons */}
              <div className="flex items-center gap-1 bg-[#F5F4F0] p-1 rounded-lg border border-[#E8E7E1]">
                <button 
                  onClick={() => setRadarLayoutMode('sidebar')} 
                  title="Sidebar (Docked)" 
                  className={`p-1.5 rounded-md transition-all ${radarLayoutMode==='sidebar' ? 'bg-white shadow-xs text-black font-bold' : 'text-gray-400 hover:text-gray-700'}`}
                >
                  <PanelRight size={13} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setRadarLayoutMode('floating')} 
                  title="Floating Card" 
                  className={`p-1.5 rounded-md transition-all ${radarLayoutMode==='floating' ? 'bg-white shadow-xs text-black font-bold' : 'text-gray-400 hover:text-gray-700'}`}
                >
                  <Layers size={13} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setRadarLayoutMode('fullpage')} 
                  title="Full Screen" 
                  className={`p-1.5 rounded-md transition-all ${radarLayoutMode==='fullpage' ? 'bg-white shadow-xs text-black font-bold' : 'text-gray-400 hover:text-gray-700'}`}
                >
                  <Maximize2 size={13} strokeWidth={2.5}/>
                </button>
                <div className="w-px h-3.5 bg-gray-300 mx-0.5" />
                <button 
                  onClick={() => setIsRadarOpen(false)} 
                  title="Close" 
                  className="p-1.5 hover:bg-red-50 rounded-md transition-colors text-gray-400 hover:text-red-600"
                >
                  <X size={14} strokeWidth={2.5}/>
                </button>
              </div>
            </div>

            {/* 🌟 Untouched Radar Copilot Mount */}
            <div className="flex-1 overflow-hidden relative bg-white flex flex-col">
              <RadarCopilot currentTab={activeTab} isGlobalDrawer={true} />
            </div>
          </div>
        </div>
      )}

      {/* 🌟 PRIORITY SUPPORT MODAL */}
      <SupportTicketModal 
        isOpen={isSupportModalOpen} 
        onClose={() => setIsSupportModalOpen(false)} 
        prefilledTxId={supportTxId} 
      />

    </>
  );
};
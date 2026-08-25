import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  X, Check, ArrowUpRight, ArrowLeft, ExternalLink, 
  Ban, Loader2, RefreshCw, ShieldCheck, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users, Download 
} from "lucide-react";
import { ModalProps, parseTransactionData, generateReceiptPDF } from "./TransactionUtils";
import { useStore } from "../../../store/useStore";
import { PLATFORM_FEES } from "../../../utils/constants";

import { api } from "../../../lib/api";

// Blockchain & Crypto dependencies
import { rpc, Keypair, TransactionBuilder, Networks, Contract, Account, Horizon } from "@stellar/stellar-sdk";
import { LocalCryptoUtil } from "../../../utils/LocalCryptoUtil";


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface ClaimEvent {
  state: string;
  timestamp: string;
  metadata?: { notes?: string; [key: string]: any };
}

interface ClaimItem {
  id: string;
  claimId?: string; 
  contractId?: string; // To track the exact smart contract
  claimLink?: string; 
  reference: string;
  txHash?: string; 
  email: string;
  name: string;
  amount: number;
  feeAmount: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  status: string; 
  trackingState: string;
  dateCreated: string;
  dateCompleted?: string;
  yieldEarned: number;
  note?: string;
  timeline?: ClaimEvent[];
}

export const PaymentTransactionModal = ({ isOpen, onClose, transaction }: ModalProps) => {

  // Pull active account from store for cryptographic signing
  const activeAccount = useStore((state: any) => state.activeAccount);
  const globalTransactions = useStore((state: any) => state.transactions) || [];

  const [claimItems, setClaimItems] = useState<ClaimItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);
  const [searchQuery] = useState(""); 
  const [copiedLink, setCopiedLink] = useState(false);
  const [showTimelineFull, setShowTimelineFull] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Sidebar State
  
  const [cancelMode, setCancelMode] = useState(false);
  const [selectedCancelIds, setSelectedCancelIds] = useState<string[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [notification, setNotification] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  
  // PIN Modal State for Blockchain Teardown
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // YIELD ORACLE STATE
  const [liveYield, setLiveYield] = useState<number | null>(null);
  const [isYieldFetching, setIsYieldFetching] = useState(false);

  // DYNAMIC EXPLORER ROUTING: Automatically swaps between Testnet and Mainnet
  const explorerNetwork = import.meta.env.VITE_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';


  const liveTx = useMemo(() => {
    if (!transaction) return null;
    const freshRaw = globalTransactions.find((t: any) => 
      String(t.id) === String(transaction.id) || 
      (t.reference && String(t.reference) === String(transaction.reference))
    );
    
    if (!freshRaw) return transaction;

    // 🌟 PRESERVE THE STITCHED STATUS FROM HISTORY PAGE
    const isProgression = freshRaw.status === 'completed' || freshRaw.status === 'failed' || freshRaw.status === 'cancelled';

    return { 
      ...transaction,
      status: isProgression ? freshRaw.status : transaction.status,
      timeline: freshRaw.timeline || transaction.timeline,
      metadata: { ...(transaction.metadata || {}), ...(freshRaw.metadata || {}) }
    };
  }, [transaction, globalTransactions]);

  console.log("RAW LIVE TX PAYLOAD:", liveTx);

  // 🌟 RESTORED & PERFECTED: The Missing Mapping Engine
  const fetchAndSyncData = useCallback(async () => {
    if (!isOpen || !liveTx) return;

    const { usdcAmount, fiatAmount, fiatCurrency, reference } = parseTransactionData(liveTx);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    
    // THE FIX: Bulletproof Bulk Detection
    const targetBatchId = (liveTx as any).batchId || reference;
    const isBulk = liveTx.type === 'bulk_payment' || (targetBatchId && String(targetBatchId).startsWith('BATCH-'));

    // --- BULK PAYMENT MAPPING ---
    if (isBulk && targetBatchId) {
        try {
            let childEscrows: any[] = [];
            
            try {
                // 1. First, try hitting the dedicated batch endpoint via your secure Axios interceptor
                const res = await api.get(`/escrows/batch/${targetBatchId}`);
                // Safely extract the array regardless of how the backend wraps it
                childEscrows = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.escrows || []);
            } catch (err: any) {
                // 2. FALLBACK GUARD: If the endpoint doesn't exist (404), fetch ALL escrows and filter locally
                console.warn("Dedicated batch route missing. Falling back to global escrows list...");
                const fallbackRes = await api.get('/escrows');
                const allEscrows = Array.isArray(fallbackRes.data) ? fallbackRes.data : (fallbackRes.data?.data || fallbackRes.data?.escrows || []);
                
                // Filter out just the children that belong to this batch
                childEscrows = allEscrows.filter((e: any) => 
                    e.batchId === targetBatchId || 
                    e.reference === targetBatchId || 
                    e.claimId === targetBatchId
                );
            }

            if (childEscrows.length === 0) {
               console.warn("No child escrows found for batch:", targetBatchId);
            }

            // 3. Resilient Mapping Engine
            const mappedItems: ClaimItem[] = childEscrows.map((child: any) => {
                // 🌟 TITANIUM WSOD GUARDS FOR JSON PARSING
                let childTimeline: any[] = [];
                try { 
                    const raw = typeof child.timeline === 'string' ? JSON.parse(child.timeline) : (child.timeline || []); 
                    childTimeline = Array.isArray(raw) ? raw : []; 
                } catch(e) {}
                
                let timelineContractId = "", timelineTxHash = "";
                childTimeline.forEach((evt: any) => {
                    if (evt?.metadata?.contractId) timelineContractId = evt.metadata.contractId;
                    if (evt?.metadata?.txHash) timelineTxHash = evt.metadata.txHash;
                });
                
                const actualTxHash = timelineTxHash || child.claimHash || child.contractId || "";
                const resolvedContractId = timelineContractId || child.contractId || (actualTxHash.startsWith("C") && actualTxHash.length === 56 ? actualTxHash : "");

                // 🌟 NORMALIZATION AND HEALING LOGIC
                const hasFailedEvent = childTimeline.some((evt: any) => {
                    const s = String(evt?.state || '').toLowerCase();
                    return s.includes('fail') || s.includes('expire');
                });
                const hasCancelledEvent = childTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
                
                const rawStatus = String(child.status || '').toLowerCase();
                let derivedStatus = rawStatus || 'pending';
                
                // 🌟 Universal Healing: Catch both Failures and Cancellations
                if (hasCancelledEvent && derivedStatus !== 'cancelled') {
                    derivedStatus = 'cancelled';
                } else if (hasFailedEvent && derivedStatus !== 'failed') {
                    derivedStatus = 'failed';
                }

                return {
                    id: child.id,
                    reference: child.claimId || child.reference || child.id,
                    contractId: resolvedContractId,
                    txHash: actualTxHash,
                    claimLink: `${baseUrl}/claim/${child.claimId || child.id}`,
                    email: child.recipientEmail || "Unknown",
                    name: child.recipientEmail?.split("@")[0] || child.recipientEmail || "Unknown",
                    amount: parseFloat(child.amountLocked || child.amount || "0"),
                    feeAmount: parseFloat(child.feeAmount || "0"),
                    fiatCurrency: fiatCurrency || "USDC",
                    status: derivedStatus,
                    trackingState: derivedStatus === 'completed' ? 'claim_completed' : String(child.trackingState || 'active').toLowerCase(),
                    dateCreated: child.createdAt || child.date,
                    yieldEarned: 0, 
                    note: child.note || "",
                    timeline: childTimeline
                };
            });
            
            setClaimItems(mappedItems);
            
            // 4. Safe Selection (Keeps UI stable during background refreshes)
            setSelectedClaimId(prev => {
                if (prev) {
                    const stillExists = mappedItems.find(e => e.id === prev);
                    if (stillExists) return prev;
                }
                return mappedItems.length > 0 ? mappedItems[0].id : null;
            });
            
        } catch (e) {
            console.error("CRITICAL: Completely failed to fetch batch roster", e);
            setClaimItems([]);
        }
        return;
    }

    // --- SINGLE PAYMENT MAPPING ---
    let parsedNoteMetadata: any = {};
    if (typeof liveTx.note === 'string' && liveTx.note.trim().startsWith('{')) {
      try { parsedNoteMetadata = JSON.parse(liveTx.note); } catch (e) {}
    }

    // 🌟 TITANIUM WSOD GUARDS FOR JSON PARSING
    let parsedTimeline: any[] = [];
    try { 
        const raw = typeof liveTx.timeline === 'string' ? JSON.parse(liveTx.timeline) : (liveTx.timeline || []); 
        parsedTimeline = Array.isArray(raw) ? raw : []; 
    } catch(e) {}

    let timelineContractId = "";
    let timelineTxHash = "";
    parsedTimeline.forEach((evt: any) => {
        if (evt?.metadata?.contractId) timelineContractId = evt.metadata.contractId;
        if (evt?.metadata?.txHash) timelineTxHash = evt.metadata.txHash;
        if (evt?.metadata?.blockchainClaimHash) timelineTxHash = evt.metadata.blockchainClaimHash;
    });

    const rootContractId = liveTx.contractId || liveTx.metadata?.contractId || parsedNoteMetadata.contractId || "";
    const rootTxHash = liveTx.txHash || liveTx.hash || liveTx.blockchainTxHash || liveTx.claimHash || liveTx.metadata?.txHash || liveTx.metadata?.blockchainClaimHash || parsedNoteMetadata.txHash || parsedNoteMetadata.blockchainClaimHash || "";

    const finalContractId = timelineContractId || rootContractId;
    const finalTxHash = timelineTxHash || rootTxHash;
    const actualTxHash = finalTxHash || finalContractId || "";

    let fallbackEmail = liveTx.recipientEmail || liveTx.metadata?.recipientEmail || parsedNoteMetadata.recipientEmail;
    
    let cleanedDesc = "";
    if (typeof liveTx.description === 'string') {
        cleanedDesc = liveTx.description.replace(/^(Blink Escrow:|Blink Bulk Escrow:|Payment to|Transfer to|Sent to|Paid to)\s+/i, "").trim();
        if (cleanedDesc.toLowerCase() === "transfer") cleanedDesc = "";
    }

    if (!fallbackEmail) {
        const rawText = `${liveTx.description || ""} ${liveTx.note || liveTx.memo || ""}`;
        const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) fallbackEmail = emailMatch[0];
        else if (cleanedDesc) fallbackEmail = cleanedDesc;
    }

    const txEmails = Array.isArray(liveTx.recipients) && liveTx.recipients.length > 0 
        ? liveTx.recipients.map((e: string) => e.toLowerCase().trim())
        : fallbackEmail ? fallbackEmail.split(",").map((e: string) => e.toLowerCase().trim()) : [];

    const resolveRecipientName = (email: string) => {
       if (liveTx.metadata?.recipientDetails?.accountName) return liveTx.metadata.recipientDetails.accountName;
       if (liveTx.recipientName) return liveTx.recipientName;
       if (parsedNoteMetadata.recipientName) return parsedNoteMetadata.recipientName;
       if (email && email.includes('@')) {
         const username = email.split('@')[0];
         return username.charAt(0).toUpperCase() + username.slice(1);
       }
       if (cleanedDesc) return cleanedDesc;
       if (email && email !== "Unknown" && email !== "N/A") return email;
       return "Unknown Recipient";
    };

    let totalFee = parseFloat((liveTx as any).feeAmount || liveTx.metadata?.feeAmount || parsedNoteMetadata.feeAmount);
    if (isNaN(totalFee) || totalFee === 0) {
      const baseFee = 1.0;
      const additionalFee = txEmails.length > 1 ? (txEmails.length - 1) * 0.2 : 0;
      totalFee = baseFee + additionalFee;
    }

    const totalPrincipal = Math.max(0, usdcAmount - totalFee);
    const resolvedContractId = finalContractId || liveTx.contractId || (actualTxHash.startsWith("C") && actualTxHash.length === 56 ? actualTxHash : "");

    const finalEmail = txEmails[0] || fallbackEmail || "N/A";
    
    // 🌟 HEALING AND NORMALIZATION LOGIC FOR SINGLE ESCROW
    const hasFailedEvent = parsedTimeline.some((evt: any) => {
        const s = String(evt?.state || '').toLowerCase();
        return s.includes('fail') || s.includes('expire');
    });
    const hasCancelledEvent = parsedTimeline.some((evt: any) => String(evt?.state || '').toLowerCase().includes('cancel'));
    
    const rawStatus = String(liveTx.status || '').toLowerCase();
    let derivedStatus = rawStatus || 'pending';
    
    if (hasCancelledEvent && derivedStatus !== 'cancelled') {
        derivedStatus = 'cancelled';
    } else if (hasFailedEvent && derivedStatus !== 'failed') {
        derivedStatus = 'failed';
    }

    const mappedItems: ClaimItem[] = [{
      id: liveTx.id,
      reference: reference || liveTx.id,
      contractId: resolvedContractId,
      txHash: actualTxHash,
      claimLink: (reference || liveTx.id).startsWith("trx") ? `${baseUrl}/claim/${reference || liveTx.id}` : "",
      email: finalEmail,
      name: resolveRecipientName(finalEmail),
      amount: totalPrincipal, 
      feeAmount: totalFee,
      fiatAmount: fiatAmount || undefined,
      fiatCurrency: fiatCurrency,
      status: derivedStatus,
      trackingState: derivedStatus === 'completed' ? 'claim_completed' : String(liveTx.trackingState || 'active').toLowerCase(),
      dateCreated: liveTx.date,
      yieldEarned: liveTx.metadata?.yieldDistributed || 0, 
      note: liveTx.note || liveTx.memo,
      timeline: parsedTimeline
    }];

    setClaimItems(mappedItems);
    setSelectedClaimId(prev => prev || (mappedItems.length > 0 ? mappedItems[0].id : null));

  }, [isOpen, liveTx]);

  const txId = transaction?.id;

  // 1. Wipe state instantly on close or when switching to a new transaction
  useEffect(() => {
    if (!isOpen || !txId) {
      setClaimItems([]);
      setSelectedClaimId(null);
      setCancelMode(false);
      setSelectedCancelIds([]);
      setCancelReason("");
      setShowTimelineFull(false);
      setIsMobileDetailView(false);
      setIsSidebarOpen(true);
      setNotification(null);
    }
  }, [isOpen, txId]);

  // 2. Data Syncing Effect (Only runs if we have an active transaction)
  useEffect(() => {
    if (isOpen && txId) {
      fetchAndSyncData();
      window.addEventListener('BLINK_ONCHAIN_SYNC', fetchAndSyncData);
      return () => window.removeEventListener('BLINK_ONCHAIN_SYNC', fetchAndSyncData);
    }
  }, [isOpen, txId, fetchAndSyncData]);

  const selectedClaim = claimItems.find(c => c.id === selectedClaimId) || claimItems[0];

  // 🌟 LIVE YIELD ORACLE EFFECT
  useEffect(() => {
    if (!isOpen || !selectedClaim?.reference) return;

    const isTerminal = ['completed', 'successful', 'failed', 'cancelled', 'claim_canceled', 'rejected', 'expired'].includes(selectedClaim.status?.toLowerCase() || '');
    
    // Only fetch live yield if the escrow is active on the blockchain
    if (isTerminal || !selectedClaim.contractId || !selectedClaim.contractId.startsWith('C')) {
       setLiveYield(null);
       return;
    }

    let isMounted = true;
    const fetchLiveYield = async () => {
      setIsYieldFetching(true);
      try {
        const res = await fetch(`${API_BASE}/escrows/${selectedClaim.reference}/onchain-truth`);
        if (res.ok && isMounted) {
           const json = await res.json();
           if (json.success && json.data) {
              const totalBalance = json.data.liveBalance || 0;
              const principal = json.data.principal || 0;
              // Prevent negative numbers on fresh vaults
              const generatedYield = Math.max(0, totalBalance - principal);
              setLiveYield(generatedYield);
           }
        }
      } catch (err) {
        console.warn("Failed to fetch live yield", err);
      } finally {
        if (isMounted) setIsYieldFetching(false);
      }
    };

    fetchLiveYield();
    
    // Auto-refresh the yield metrics every 10 seconds
    const interval = setInterval(fetchLiveYield, 10000);
    
    return () => { 
        isMounted = false; 
        clearInterval(interval);
    };
  }, [isOpen, selectedClaim?.reference, selectedClaim?.status, selectedClaim?.contractId]);


  if (!isOpen || !liveTx) return null;
  const isBulk = liveTx?.type === 'bulk_payment';

  // Robust security guardrail to prevent double-spending and fix button states
  // FIX: Extended Cancellation Window
  // SECURITY GUARDRAIL (NOW SECURELY AUTHORIZES 'in_escrow')
  const checkIsCancellable = (claim: ClaimItem) => {
    const currentStatus = claim.status?.toLowerCase() || '';
    const tracking = claim.trackingState?.toLowerCase() || '';

    // 1. If it's already closed out, it cannot be cancelled
    if (['completed', 'successful', 'failed', 'cancelled', 'claim_canceled', 'rejected', 'expired'].includes(currentStatus)) {
      return false;
    }

    // 2. CRITICAL LOCKDOWN: We only lock the sender out once the recipient has successfully verified the OTP and the backend is actively processing the withdrawal.
    if (['claim_processing', 'claim_completed', 'claimed'].includes(tracking)) {
      return false;
    }

    // 3. Authorize the normalized 'in_escrow' status
    // Otherwise, it is safe to cancel (even if tracking is 'claim_started' or the vault is 'ready').
    return ['pending', 'processing', 'active', 'ready', 'in_escrow'].includes(currentStatus);
  };

  // Replace the old pendingClaims variables with our new secure cancellable logic
  const cancellableClaims = claimItems.filter(c => checkIsCancellable(c));
  const totalCancellableAmount = cancellableClaims.reduce((sum, c) => sum + c.amount, 0);

  const filteredItems = claimItems.filter(c => 
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyLink = () => {
    if (!selectedClaim) return;
    
    let link = selectedClaim.claimLink;
    if (!link) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const targetId = selectedClaim.reference || selectedClaim.claimId || selectedClaim.id;
      link = `${baseUrl}/claim/${targetId}`; 
    }
    
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenCancelMode = () => {
    const cancellableIds = cancellableClaims.map(c => c.id);
    setSelectedCancelIds(cancellableIds.includes(selectedClaim.id) ? [selectedClaim.id] : []);
    setCancelMode(true);
  };

  const toggleCancelSelection = (id: string) => {
    setSelectedCancelIds(prev => 
      prev.includes(id) ? prev.filter(cancelId => cancelId !== id) : [...prev, id]
    );
  };

  const totalCancelPenalty = selectedCancelIds.reduce((sum, id) => {
    const claim = claimItems.find(c => c.id === id);
    return sum + (claim ? Math.min(PLATFORM_FEES.cancellation, claim.amount) : 0);
  }, 0);
  
  const netRefundAmount = selectedCancelIds.reduce((sum, id) => {
    const claim = claimItems.find(c => c.id === id);
    // STRICT ON-CHAIN MATH: The Base Fee is sunk. The penalty is deducted directly from the Vault's Principal.
    return sum + (claim ? Math.max(0, claim.amount - PLATFORM_FEES.cancellation) : 0);
  }, 0);

  // PRODUCTION FIX: Cryptographic Blockchain Cancellation Engine
  const executeBlockchainCancel = async () => {
    if (pinInput.length < 6 || selectedCancelIds.length === 0) return;
    setIsCancelling(true);
    setPinError("");
    setNotification(null);
    
    try {
      // 1. Authenticate & Decrypt Keypair
      let secureKeyToDecrypt = activeAccount?.encryptedWalletKey;
      if (!secureKeyToDecrypt) {
        const sessionData = localStorage.getItem("bingtellar_user");
        if (sessionData) secureKeyToDecrypt = JSON.parse(sessionData).encryptedWalletKey;
      }
      if (!secureKeyToDecrypt) throw new Error("Critical: Secure key missing. Please re-login.");

      let rawSecretKey = "";
      try {
        rawSecretKey = await LocalCryptoUtil.decrypt(secureKeyToDecrypt, pinInput);
      } catch (e) {
        throw new Error("Incorrect PIN. Decryption failed.");
      }
      if (!rawSecretKey || !rawSecretKey.startsWith("S")) throw new Error("Incorrect PIN. Invalid key.");

      // 2. Setup Soroban Network
      const isMainnet = import.meta.env.VITE_STELLAR_NETWORK === 'mainnet';
      const horizonUrl = isMainnet ? "https://horizon.stellar.org/" : "https://horizon-testnet.stellar.org/";
      const sorobanUrl = isMainnet ? "https://mainnet.sorobanrpc.com/" : "https://soroban-testnet.stellar.org/";
      const currentNetwork = isMainnet ? Networks.PUBLIC : Networks.TESTNET;

      const userKeypair = Keypair.fromSecret(rawSecretKey);
      const sorobanServer = new rpc.Server(sorobanUrl);
      const horizonServer = new Horizon.Server(horizonUrl);

      let baseAccount;
      try {
        baseAccount = await horizonServer.loadAccount(userKeypair.publicKey());
      } catch (e) {
        throw new Error("Wallet not found on the blockchain network.");
      }
      let currentSeq = BigInt(baseAccount.sequenceNumber());

      // 🌟 3. Process Each Cancellation (UPDATED STRICT ENFORCEMENT)
      for (const id of selectedCancelIds) {
        const claimToCancel = claimItems.find(c => c.id === id);
        if (!claimToCancel?.reference) continue;

        // Resolve contract ID from claim item or fallback to liveTx / reference inspection
        const targetContractId = claimToCancel.contractId || 
                                 selectedClaim?.contractId || 
                                 liveTx?.contractId || 
                                 (selectedClaim?.txHash?.startsWith("C") && selectedClaim?.txHash?.length === 56 ? selectedClaim.txHash : "");

        let signedXdr = "";

        const isRealContract = targetContractId && 
                               targetContractId.startsWith("C") && 
                               targetContractId.length === 56 && 
                               !targetContractId.includes("MOCK");

        if (isRealContract) {
          console.log(`[FE CANCEL]: Building Soroban cancel() tx for contract: ${targetContractId}`);
          const vaultContract = new Contract(targetContractId);
          const simAccount = new Account(userKeypair.publicKey(), currentSeq.toString());
          
          const tx = new TransactionBuilder(simAccount, { fee: "1000000", networkPassphrase: currentNetwork })
            .addOperation(vaultContract.call("cancel"))
            .setTimeout(180)
            .build();

          let simulatedTx;
          try {
            simulatedTx = await sorobanServer.simulateTransaction(tx);
          } catch (e: any) { 
            throw new Error(`RPC Simulation Error: ${e.message}`); 
          }

          if (rpc.Api.isSimulationError(simulatedTx)) {
             throw new Error(`Smart contract simulation failed. The transaction may already be processed or invalid.`);
          }

          const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build();
          assembledTx.sign(userKeypair);
          signedXdr = assembledTx.toXDR();
          currentSeq++;
        }

        // Send payload to backend
        const token = localStorage.getItem('bingtellar_auth_token') || localStorage.getItem('token'); 
        const res = await fetch(`${API_BASE}/escrows/${claimToCancel.reference}/cancel`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}) 
          },
          credentials: 'include', 
          body: JSON.stringify({ 
            reason: cancelReason || "Sender manually cancelled the transfer.",
            signedXdr: signedXdr || undefined
          })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to cancel transaction.`);
        }
      }

      // UI FIX: Instantly flip the status and inject the timeline locally
      setClaimItems(prev => prev.map(c => {
        if (selectedCancelIds.includes(c.id)) {
          const currentTimeline = c.timeline || [];
          return {
            ...c,
            status: 'cancelled',
            trackingState: 'claim_canceled',
            timeline: [...currentTimeline, { 
              state: 'claim_canceled', 
              timestamp: new Date().toISOString(), 
              metadata: { notes: cancelReason || "Sender manually cancelled the transfer." } 
            }]
          };
        }
        return c;
      }));

      // 4. Cleanup & UI Sync
      window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
      setNotification({ type: 'success', text: 'Escrow closed, Funds successfully released and refunded.' });
      
      setCancelMode(false);
      setSelectedCancelIds([]);
      setCancelReason("");
      setShowPinModal(false);
      setPinInput("");
      
    } catch (error: any) {
      console.error("Cancellation failed:", error);
      setPinError(error.message);
      if (!showPinModal) setNotification({ type: 'error', text: error.message });
    } finally {
      setIsCancelling(false);
    }
  };

  // 🌟 PERFECTED MODAL DISPLAY MAPPING
  const getStatusDisplay = (status: string, trackingState: string) => {
    const s = String(status || '').toLowerCase();
    const t = String(trackingState || '').toLowerCase();

    // Explicitly recognize 'claim_completed' and 'claimed' as terminal success states
    if (s === 'completed' || s === 'successful' || s === 'claim_completed' || s === 'claimed') return { text: 'Completed', color: 'bg-[#3BA66A]' };
    if (s === 'cancelled' || s === 'claim_canceled') return { text: 'Cancelled', color: 'bg-[#A3A3A3]' };
    if (s === 'failed') return { text: 'Failed', color: 'bg-[#D44438]' }; 
    
    if (t === 'claim_started' || t === 'claim_processing' || s === 'claiming') return { text: 'Claiming', color: 'bg-[#D97706]' };
    
    // 🌟 THE FIX: Explicitly catch 'in_escrow' and 'active' to return the Blue Escrow Badge
    if (s === 'active' || s === 'ready' || s === 'in_escrow') return { text: 'In Escrow', color: 'bg-[#2775CA]' };
    
    if (s === 'processing' || s === 'pending') return { text: 'Processing', color: 'bg-[#EAB308]' };
    
    return { text: 'Pending', color: 'bg-[#EAB308]' }; 
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString)
      .toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      .toUpperCase();
  };

  const getInitials = (name: string) => {
    const parts = name.split(/[\s.@]/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.substring(0, 2)).toUpperCase();
  };

  const actualTimelineEvents = selectedClaim?.timeline || [];

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      // We pass the rich `claimItems` array into the upgraded PDF Engine!
      generateReceiptPDF(jsPDF, liveTx, isBulk ? "Bulk Escrow Payment" : "Escrow Payment", claimItems);
    } catch (err) {
      console.error("Failed to generate PDF.", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      {/* ADDED: SECURE PIN MODAL FOR CANCELLATION */}
      {showPinModal && (
        <div className="fixed inset-0 z-[10010] flex justify-center items-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 p-8 text-center relative">
            <button 
              onClick={() => setShowPinModal(false)}
              disabled={isCancelling}
              className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors"
            >
              <X size={18} />
            </button>

            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
              <ShieldCheck size={32} className="text-red-600" />
            </div>
            <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2">Authorize Cancellation</h2>
            <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">
              Enter your 6-digit PIN to authorize escrow termination and initiate fund release from vault.
            </p>
            
            <input 
              type="password" 
              maxLength={6} 
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setPinError("");
              }}
              placeholder="••••••" 
              disabled={isCancelling}
              className={`w-full bg-[#FAFAFA] border rounded-xl px-4 py-4 text-[24px] text-center tracking-[0.3em] font-bold outline-none transition-all mb-4 ${
                pinError ? "border-red-400 focus:bg-white" : "border-[#E8E7E1] focus:border-black focus:bg-white"
              }`}
            />
            
            {pinError && <p className="text-red-500 text-[12px] font-bold mb-4 animate-in fade-in">{pinError}</p>}

            <button 
              onClick={executeBlockchainCancel}
              disabled={isCancelling || pinInput.length < 6} 
              className="w-full bg-black text-white h-14 rounded-xl font-bold text-[15px] shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isCancelling ? (
                <>
                  <Loader2 size={18} className="animate-spin shrink-0" /> 
                  <span className="pl-2">Cancelling...</span>
                </>
              ) : (
                "Confirm & Sign"
              )}
            </button>
          </div>
        </div>
      )}
      {/* 🌟 END PIN MODAL */}
      
      {/* 🌟 FIX: Dynamically switch width between 960px and 520px with a smooth transition */}
      <div className={`relative bg-white w-full ${isSidebarOpen ? 'md:w-[960px]' : 'md:w-[520px]'} h-[95vh] md:h-[98vh] mt-auto md:mt-[1vh] md:mr-[1vw] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col md:flex-row overflow-hidden z-[101] animate-drawer-bottom md:animate-drawer-right transition-[width] duration-300 ease-in-out`}>
        
        {/* ========================================================= */}
        {/* LEFT PANE: MASTER LIST */}
        {/* ========================================================= */}
        {/* 🌟 FIX: Hide the entire left pane if the sidebar is closed */}
        <div className={`w-full md:w-[440px] shrink-0 flex flex-col h-full bg-white p-6 md:p-8 ${isMobileDetailView ? 'hidden' : 'flex'} ${isSidebarOpen ? 'md:flex' : 'md:hidden'}`}>
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h2 className="text-[20px] font-semibold text-[#1A1A1A]">{isBulk ? "Batch Details" : "Transaction details"}</h2>
              {isBulk && (
                <p className="text-[12px] text-[#757575] mt-1 flex items-center gap-1.5">
                  <Users size={14} /> {claimItems.length} Recipients
                </p>
              )}
            </div>
            <button onClick={onClose} className="md:hidden text-[#1A1A1A]">
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          <div className="border border-[#EAEAEA] rounded-[16px] flex-1 flex flex-col overflow-hidden shadow-sm">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#EAEAEA] bg-[#FAFAFA] shrink-0">
              <span className="text-[12px] text-[#A3A3A3] font-bold tracking-wide uppercase">Recipients</span>
              <span className="text-[12px] text-[#A3A3A3] font-bold tracking-wide uppercase">Amount</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredItems.map((claim) => {
                const isSelected = claim.id === selectedClaimId;
                const uiStatus = getStatusDisplay(claim.status, claim.trackingState);
                
                return (
                  <div 
                    key={claim.id}
                    onClick={() => { setSelectedClaimId(claim.id); setCancelMode(false); setShowTimelineFull(false); setIsMobileDetailView(true); }}
                    className={`flex items-center justify-between p-3 rounded-[12px] cursor-pointer transition-all border ${
                      isSelected ? 'bg-[#FAFAFA] border-[#1A1A1A] ring-1 ring-[#1A1A1A] ring-opacity-10' : 'bg-white border-transparent hover:bg-[#F9F9F9]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[13px] shrink-0 transition-colors duration-300 ${isSelected ? 'bg-[#1A1A1A] text-white' : 'bg-[#333333] text-white'}`}>
                        {getInitials(claim.name)}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <p className={`text-[13px] mb-0.5 truncate transition-colors duration-300 ${isSelected ? 'font-bold text-[#1A1A1A]' : 'font-medium text-[#1A1A1A]'}`}>
                          {claim.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] text-[#757575] truncate max-w-[120px]">
                            {claim.email !== 'N/A' && claim.email !== 'Unknown' ? claim.email : 'No email provided'}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${uiStatus.color}`} />
                            <span className="text-[11px] text-[#757575] font-medium transition-colors duration-500">{uiStatus.text}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[13px] transition-colors duration-300 ${isSelected ? 'font-bold text-[#1A1A1A]' : 'font-semibold text-[#1A1A1A]'}`}>
                        {claim.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* FIX: Hide the vertical divider when the sidebar is closed */}
        <div className={`hidden ${isSidebarOpen ? 'md:block' : 'md:hidden'} w-[1px] h-full bg-[#EAEAEA] shrink-0`} />

        {/* ========================================================= */}
        {/* RIGHT PANE: DETAIL & CANCEL VIEW */}
        {/* ========================================================= */}
        <div className={`flex-1 flex flex-col h-full bg-white relative p-6 md:p-8 ${!isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
          
          {/* FIX: The Desktop Sidebar Toggle Button */}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="hidden md:flex absolute top-5 left-5 w-8 h-8 items-center justify-center bg-[#F5F5F5] hover:bg-[#EAEAEA] rounded-full transition-colors z-50 text-[#1A1A1A]"
            title={isSidebarOpen ? "Hide recipient list" : "Show recipient list"}
          >
            {isSidebarOpen ? <ChevronLeft size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
          </button>

          {/* SLICK NOTIFICATION TOAST */}
          {notification && (
            <div className={`absolute top-6 left-1/2 -translate-x-1/2 w-[85%] md:w-auto px-4 py-3 rounded-[12px] shadow-[0px_4px_16px_rgba(0,0,0,0.08)] border flex items-center justify-between gap-4 z-[200] animate-in slide-in-from-top-4 fade-in duration-300 ${
              notification.type === 'error' ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]' : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
            }`}>
              <div className="flex items-center gap-3">
                {notification.type === 'error' ? <Ban size={18} className="shrink-0" /> : <Check size={18} className="shrink-0" />}
                <span className="text-[13px] font-medium leading-snug">{notification.text}</span>
              </div>
              <button onClick={() => setNotification(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <X size={16} />
              </button>
            </div>
          )}
          {/* 🌟 END NOTIFICATION TOAST 🌟 */}


          <div className="md:hidden border-b border-[#EAEAEA] flex items-center gap-3 pb-4 mb-4 shrink-0 bg-white z-10 px-6 pt-6">
            <button onClick={() => setIsMobileDetailView(false)} className="text-[#1A1A1A]"><ArrowLeft size={20} /></button>
            <span className="text-[16px] font-semibold text-[#1A1A1A] truncate">{cancelMode ? "Cancel Transfer" : "Transaction Details"}</span>
          </div>

          <button onClick={onClose} className="hidden md:flex absolute top-5 right-5 w-8 h-8 items-center justify-center bg-[#F5F5F5] hover:bg-[#EAEAEA] rounded-full transition-colors z-50 text-[#1A1A1A]">
            <X size={16} strokeWidth={2.5} />
          </button>

          {cancelMode ? (
            /* ---------------- CANCEL VIEW ---------------- */
            <div className="flex-1 overflow-y-auto flex flex-col px-6 md:px-10 pb-6 md:pb-10 pt-2 md:pt-4 animate-in fade-in duration-200">
              <h2 className="text-[20px] font-semibold text-[#1A1A1A] mb-5">Cancel this transfer?</h2>
              
              <div className="border border-[#EAEAEA] rounded-[16px] p-5 mb-5 bg-[#FAFAFA]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-[#F0F5FF] text-[#2775CA] flex items-center justify-center shadow-sm border border-white">
                    <ArrowUpRight size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Money Transfer</h3>
                    <p className="text-[12px] text-[#757575] mt-0.5">{isBulk ? "Batch payment" : "Single payment"}</p>
                  </div>
                </div>

                <div className="space-y-3 mb-5 pb-5 border-b border-[#EAEAEA]">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#757575]">Total Number of transaction</span>
                    {/* 🌟 THE FIX: Update to cancellable claims */}
                    <span className="font-medium text-[#1A1A1A]">{cancellableClaims.length} Transactions</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#757575]">Total amount</span>
                    {/* 🌟 THE FIX: Update to cancellable amount */}
                    <span className="font-medium text-[#1A1A1A]">{totalCancellableAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                  </div>
                </div>

                <h4 className="text-[12px] text-[#757575] font-medium mb-3">Recipient(s)</h4>
                <div className="space-y-3">
                  {/* 🌟 THE FIX: Map over the secure cancellableClaims array */}
                  {cancellableClaims.length === 0 ? (
                    <p className="text-[13px] text-[#A3A3A3]">No eligible recipients available for cancellation.</p>
                  ) : (
                    cancellableClaims.map(claim => {
                      const isChecked = selectedCancelIds.includes(claim.id);
                      return (
                        <label key={claim.id} className="flex items-center justify-between cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <div className={`w-[16px] h-[16px] rounded-[4px] flex items-center justify-center border transition-colors ${isChecked ? 'bg-[#1A1A1A] border-[#1A1A1A]' : 'border-[#D1D1D1] bg-white group-hover:border-[#1A1A1A]'}`}>
                              {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>
                            <p className="text-[14px] text-[#1A1A1A] font-medium mb-1">
                              {/* 🌟 THE FIX: Map using the local 'claim' object, not the global 'selectedClaim' */}
                              Transfer to {claim.email !== 'N/A' && claim.email !== 'Unknown' ? claim.email : claim.name}
                            </p>
                          </div>
                          <span className="text-[13px] font-medium text-[#1A1A1A]">{claim.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                          <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleCancelSelection(claim.id)} />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-col flex-1 mb-2">
                <label className="text-[13px] font-semibold text-[#1A1A1A] mb-2 flex items-center gap-1 shrink-0">
                  Reason of Cancellation <span className="text-[#EF4444]">*</span>
                </label>
                <textarea 
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="E.g., incorrect recipient information or employee no longer eligible"
                  className="w-full flex-1 min-h-[100px] border border-[#EAEAEA] rounded-[12px] p-3 text-[13px] text-[#1A1A1A] outline-none focus:border-[#1A1A1A] transition-colors resize-none"
                />
                
                {selectedCancelIds.length > 0 && (
                  <div className="bg-[#FFF8F8] border border-[#FECACA] rounded-[12px] p-4 mt-6 flex gap-3 animate-in fade-in duration-300 shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0">
                      <span className="text-[#DC2626] font-bold text-[12px]">$</span>
                    </div>
                    <div className="-mt-0.5">
                      <p className="text-[13px] font-semibold text-[#991B1B] mb-0.5">Cancellation Penalty Applies</p>
                      <p className="text-[12px] text-[#991B1B]/80 leading-relaxed">
                        A flat ${PLATFORM_FEES.cancellation.toFixed(2)} fee is deducted to cover network fee.
                        <br />
                        Total penalty: <strong className="text-[#991B1B]">${totalCancelPenalty.toFixed(2)}</strong> &bull; Net refund: <strong className="text-[#991B1B]">${netRefundAmount.toFixed(2)} USDC</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-auto pt-4 shrink-0">
                <button onClick={() => { setCancelMode(false); setSelectedCancelIds([]); }} className="flex-1 py-3 border border-[#1A1A1A] bg-white text-[#1A1A1A] rounded-full text-[13px] font-semibold hover:bg-[#F9F9F9] transition-colors">Back</button>
                <button 
                  onClick={() => { setPinInput(""); setPinError(""); setShowPinModal(true); }} 
                  disabled={selectedCancelIds.length === 0 || isCancelling} 
                  className="flex-1 py-3 rounded-full text-[13px] font-semibold transition-colors disabled:bg-[#F5F5F5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed [&:not(:disabled)]:bg-[#1A1A1A] [&:not(:disabled)]:text-white [&:not(:disabled)]:hover:bg-[#333] flex items-center justify-center"
                >
                  Cancel Transfer
                </button>
              </div>
            </div>
          ) : (
            /* ---------------- DETAIL INSPECTOR VIEW ---------------- */
            selectedClaim ? (
              <div className="flex-1 flex flex-col animate-in fade-in duration-300 overflow-y-auto">
                
                {/* Compact Header */}
                <div className="flex flex-col items-center text-center mb-6 mt-1 shrink-0">
                  <p className="text-[14px] text-[#1A1A1A] font-medium mb-1">
                    Transfer to {selectedClaim.email !== "Unknown" ? selectedClaim.email : selectedClaim.name}
                  </p>
                  <h3 className="text-[26px] font-bold text-[#1A1A1A] tracking-tight mb-3">
                    {selectedClaim.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
                  </h3>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#EAEAEA] bg-[#FAFAFA]">
                    <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${getStatusDisplay(selectedClaim.status, selectedClaim.trackingState).color}`} />
                    <span className="text-[11px] font-bold text-[#757575] uppercase tracking-wide transition-colors duration-500">{getStatusDisplay(selectedClaim.status, selectedClaim.trackingState).text}</span>
                  </div>
                </div>

                {/* TIMELINE BOX */}
                <div className="bg-[#F9FAFB] rounded-[16px] p-5 mb-5 border border-[#F0F0F0] shrink-0">
                  <h4 className="text-[12px] font-bold text-[#878787] uppercase tracking-wider mb-6">Transfer Status</h4>
                  
                  <div className="relative pl-2">
                    {/* 🌟 UX FIX: Perfectly centered vertical timeline line (8px padding + 10px icon center - 0.5px line width) */}
                    <div className="absolute left-[17.5px] top-[10px] bottom-[15px] w-[1px] bg-[#D1D1D1] z-0" />
                    
                    <div className="space-y-6">
                      
                      {/* 🌟 UX FIX: Sleek continuity indicator at the top */}
                      {actualTimelineEvents.length > 3 && !showTimelineFull && (
                        <div className="flex gap-4 relative z-10 animate-in fade-in duration-300">
                          <div className="w-5 h-5 rounded-full bg-[#F9FAFB] border-[2px] border-[#EAEAEA] flex items-center justify-center shrink-0 mt-0.5 ring-[6px] ring-[#F9FAFB]" />
                          <div className="-mt-0.5 flex items-center">
                             <p className="text-[12px] font-medium text-[#A3A3A3] italic">
                               {actualTimelineEvents.length - 3} older events hidden
                             </p>
                          </div>
                        </div>
                      )}

                      {actualTimelineEvents.length > 0 ? (
                        (showTimelineFull ? actualTimelineEvents : actualTimelineEvents.slice(-3)).map((event, idx) => {
                          const isError = event.state.toLowerCase().includes('fail') || event.state.toLowerCase().includes('cancel') || event.state.toLowerCase().includes('expire');
                          const isSuccess = event.state.toLowerCase().includes('complete') || event.state.toLowerCase().includes('release') || event.state.toLowerCase().includes('success');
                          
                          let iconBg = isError ? 'bg-[#EF4444]' : isSuccess ? 'bg-[#3BA66A]' : 'bg-white border-[2px] border-[#1A1A1A]';
                          let Icon = isError ? X : isSuccess ? Check : RefreshCw;

                          return (
                            <div key={`act_${event.timestamp}_${idx}`} className="flex gap-4 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                              <div className={`w-5 h-5 rounded-full ${iconBg} ${iconBg.includes('bg-white') ? 'text-[#1A1A1A]' : 'text-white'} flex items-center justify-center shrink-0 mt-0.5 ring-[6px] ring-[#F9FAFB] transition-colors duration-500`}>
                                <Icon size={10} strokeWidth={4} />
                              </div>
                              <div className="-mt-0.5">
                                <p className="text-[13px] font-semibold text-[#1A1A1A] mb-0.5 uppercase tracking-tight">{event.state.replace('_', ' ')}</p>
                                {event.metadata?.notes && <p className="text-[11px] text-[#757575] leading-snug">{event.metadata.notes}</p>}
                                <p className="text-[11px] text-[#A3A3A3] mt-1">{formatDate(event.timestamp)}</p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="flex gap-4 relative z-10 animate-in fade-in">
                          <div className={`w-5 h-5 rounded-full ${selectedClaim.status === 'completed' || selectedClaim.status === 'successful' ? 'bg-[#3BA66A] text-white' : 'bg-white border-[2px] border-[#1A1A1A] text-[#1A1A1A]'} flex items-center justify-center shrink-0 mt-0.5 ring-[6px] ring-[#F9FAFB] transition-colors duration-500`}>
                            {selectedClaim.status === 'completed' || selectedClaim.status === 'successful' ? <Check size={10} strokeWidth={4} /> : <RefreshCw size={10} strokeWidth={4} />}
                          </div>
                          <div className="-mt-0.5">
                            <p className="text-[13px] font-semibold text-[#1A1A1A] mb-0.5 uppercase tracking-tight">Transfer Initiated</p>
                            <p className="text-[11px] text-[#757575] leading-snug">Transaction was logged successfully</p>
                            <p className="text-[11px] text-[#A3A3A3] mt-1">{formatDate(selectedClaim.dateCreated)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 🌟 UX FIX: Invisible fade gradient and weightless text expander */}
                  {actualTimelineEvents.length > 3 && (
                    <div className="relative mt-1 pt-6 flex justify-center">
                      {/* Soft gradient mask to blend the list into the button area */}
                      {!showTimelineFull && (
                        <div className="absolute bottom-full left-0 right-0 h-10 bg-gradient-to-t from-[#F9FAFB] to-transparent pointer-events-none z-20" />
                      )}
                      
                      <button 
                        onClick={() => setShowTimelineFull(!showTimelineFull)}
                        className="group flex items-center gap-1.5 text-[11px] font-bold text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors outline-none z-30"
                      >
                        {showTimelineFull ? "Hide previous steps" : "View full history"} 
                        {showTimelineFull ? (
                          <ChevronUp size={14} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
                        ) : (
                          <ChevronDown size={14} className="transition-transform duration-300 group-hover:translate-y-0.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* COMPACT METADATA WITH ONCHAIN EXPLORER */}
                <div className="border border-[#EAEAEA] rounded-[16px] p-5 space-y-3 shrink-0 mb-auto">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#757575]">Transaction ID</span>
                    <span className="font-medium text-[#1A1A1A] truncate pl-4 max-w-[220px]">{selectedClaim.reference.toUpperCase()}</span>
                  </div>
                  
                  {isBulk && liveTx.metadata?.sharedOtp && (
                    <div className="flex justify-between items-center text-[13px] mt-3 pt-3 border-t border-[#EAEAEA]">
                      <span className="text-[#757575]">Batch Unlock Code</span>
                      <span className="font-bold tracking-widest text-[#1A1A1A] text-[15px]">{liveTx.metadata.sharedOtp}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#757575]">Recipient Name</span>
                    <span className="font-medium text-[#1A1A1A] truncate pl-4 max-w-[220px]">{selectedClaim.name}</span>
                  </div>
                  
                  {/* Transparent fee and principal breakdown */}
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#757575]">Distribution Amount</span>
                    <span className="font-medium text-[#1A1A1A]">{selectedClaim.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#757575]">Service Fee</span>
                    <span className="font-medium text-[#1A1A1A]">{selectedClaim.feeAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px] pt-2 pb-2 mt-1 mb-1 border-y border-[#EAEAEA]">
                    <span className="text-[#1A1A1A] font-semibold">Total Amount</span>
                    <span className="font-bold text-[#1A1A1A]">{(selectedClaim.amount + selectedClaim.feeAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</span>
                  </div>

                  {/* 🌟 NEW PLACEMENT: Live Yield Earned */}
                  {(() => {
                    const isTerminal = ['completed', 'successful', 'failed', 'cancelled', 'claim_canceled', 'rejected', 'expired'].includes(selectedClaim.status?.toLowerCase() || '');
                    const settledYield = selectedClaim.yieldEarned || 0;
                    
                    if (isTerminal && settledYield <= 0) return null;
                    if (!isTerminal && (!selectedClaim.contractId || !selectedClaim.contractId.startsWith('C'))) return null;

                    return (
                      <div className="flex justify-between items-center text-[13px] pb-2 mb-1 border-b border-[#EAEAEA]">
                        <span className="text-[#3BA66A] font-semibold flex items-center gap-1.5">
                          Yield Earned
                          {isYieldFetching && <Loader2 size={12} className="animate-spin text-[#3BA66A]" />}
                        </span>
                        <span className="font-bold text-[#3BA66A]">
                          +{isTerminal 
                            ? settledYield.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : (liveYield !== null ? liveYield.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "0.00")
                          } USDC
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex justify-between items-center text-[13px] mt-1">
                    <span className="text-[#757575]">Created at</span>
                    <span className="font-medium text-[#1A1A1A]">{formatDate(selectedClaim.dateCreated)}</span>
                    </div>


                    {/* NEW PLACEMENT: Insert the Note right after Created At */}
                  {selectedClaim.note && (
                    <div className="flex justify-between items-start text-[13px] pt-3 mt-3 border-t border-[#EAEAEA]">
                      <span className="text-[#757575] shrink-0 mr-4">Note</span>
                      <span className="font-medium text-[#1A1A1A] text-right max-w-[60%] italic leading-snug break-words">
                        "{selectedClaim.note}"
                      </span>
                    </div>
                  )}
                    
                  
                  {selectedClaim.txHash && (
                    <div className="flex justify-between items-center text-[13px] pt-3 mt-3 border-t border-[#EAEAEA]">
                      <span className="text-[#757575]">
                        {selectedClaim.txHash.startsWith('C') && selectedClaim.txHash.length === 56 
                          ? 'Vault Contract' 
                          : 'Transaction hash'}
                      </span>
                      <span className="font-medium text-[#1A1A1A] truncate pl-4 max-w-[220px]" title={selectedClaim.txHash}>
                        {`${selectedClaim.txHash.substring(0, 8)}...${selectedClaim.txHash.substring(selectedClaim.txHash.length - 6)}`}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-center pt-2 pb-0 ${selectedClaim.txHash ? 'justify-between' : 'justify-start'}`}>
                    <button 
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex items-center gap-1 text-[11px] text-[#1A1A1A] hover:underline font-medium decoration-[#1A1A1A] underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                      Download Receipt
                    </button>

                    {selectedClaim.txHash && (
                      <a 
                        href={`https://stellar.expert/explorer/${explorerNetwork}/${selectedClaim.txHash.startsWith('C') && selectedClaim.txHash.length === 56 ? 'contract' : 'tx'}/${selectedClaim.txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-[#2775CA] hover:underline font-medium decoration-[#2775CA] underline-offset-2"
                      >
                        View on block explorer <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                    
                </div>

                {/* Footer Buttons */}
                <div className="flex gap-3 mt-6 shrink-0 pb-2">
                  <button 
                    onClick={handleOpenCancelMode}
                    disabled={!checkIsCancellable(selectedClaim)}
                    className="flex-1 py-3 border border-[#EF4444] text-[#EF4444] rounded-[10px] text-[13px] font-semibold transition-all flex items-center justify-center gap-1 hover:bg-red-50 disabled:opacity-40 disabled:border-[#EAEAEA] disabled:text-[#A3A3A3] disabled:hover:bg-transparent"
                  >
                    Cancel <Ban size={14} className="hidden lg:block" />
                  </button>
                  <button 
                    onClick={handleCopyLink}
                    disabled={selectedClaim.status === 'cancelled'}
                    className="flex-1 py-3 bg-[#1A1A1A] text-white rounded-[10px] text-[13px] font-semibold hover:bg-black transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {copiedLink ? "Copied" : "Copy Link"} {copiedLink ? <Check size={14} className="text-green-400" /> : <ExternalLink size={14} className="hidden lg:block" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#A3A3A3] text-[14px] font-medium">
                Select a recipient on the left to view details
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
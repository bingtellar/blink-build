import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Sparkles, Calculator, Shield, ArrowRightLeft, TrendingUp, ChevronRight, Mic, MicOff, RotateCcw, Copy, Check, MoreHorizontal, FileText, Mail, Volume2, Square
} from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  isActionPrompt?: boolean;
}

interface RadarCopilotProps {
  currentTab?: string;
  onBack?: () => void;
  isGlobalDrawer?: boolean;
}

export const RadarCopilot: React.FC<RadarCopilotProps> = ({ currentTab = "dashboard", onBack, isGlobalDrawer = false }) => {
  const activeAccount = useStore((state: any) => state.activeAccount);
  const radarLayoutMode = useStore((state: any) => state.radarLayoutMode);
  const globalTransactions = useStore((state: any) => state.transactions) || []; 
  const processedDepositsRef = useRef<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  // 🌟 THE FIX 1: Synchronous State Hydration (Prevents UI flashing)
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored = localStorage.getItem(`radar_history_${activeAccount?.id || 'default'}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        const EXPIRY_TIME = 60 * 60 * 1000; // 1 Hour Time-To-Live
        
        if (Date.now() - parsed.lastUpdated < EXPIRY_TIME) {
          // Restore the Javascript Date objects securely
          return parsed.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        } else {
          localStorage.removeItem(`radar_history_${activeAccount?.id || 'default'}`);
        }
      }
    } catch (e) {
      console.warn("Failed to parse Radar history", e);
    }
    return [];
  });

 const [isProcessing, setIsProcessing] = useState(false);
  
  // 🌟 COPY TO CLIPBOARD HANDLER
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    // Strip markdown formatting for a clean clipboard paste
    const cleanText = text.replace(/\*\*/g, '').replace(/###/g, '').replace(/---\n/g, '');
    navigator.clipboard.writeText(cleanText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000); // Revert back to copy icon after 2 seconds
  };


  // 🌟 MORE MENU & TEXT-TO-SPEECH ENGINE
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Close menu when clicking anywhere else on the screen
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', handleClickOutside);
    
    // Cleanup Speech Engine if component unmounts
    return () => {
      document.removeEventListener('click', handleClickOutside);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const handleListen = (text: string, id: string) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel(); // Stop any currently playing audio

    if (playingId === id) {
      setPlayingId(null); 
      return;
    }

    // 🌟 THE PROSODY SANITIZER & BREATH INJECTOR
    const cleanText = text
      .replace(/\*\*/g, '')           
      .replace(/###/g, '')            
      .replace(/---\n/g, '')          
      .replace(/•/g, ', ')            
      .replace(/\n+/g, '. ')          
      .replace(/[-_]/g, ' ')          
      .replace(/\(/g, ', ')           
      .replace(/\)/g, ', ')           
      .replace(/\s+(and also|as well as|which means|but|because|specifically|such as|for example|along with)\s+/gi, ', $1 ')
      .replace(/([.?!])\s*(?=[a-z])/gi, '$1 ') 
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);

    const playNeuralVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      
      const premiumVoice = 
        voices.find(v => v.name.includes('Aria') && v.name.includes('Natural')) || 
        voices.find(v => v.name.includes('Guy') && v.name.includes('Natural')) ||  
        voices.find(v => v.name.includes('Google US English')) ||                  
        voices.find(v => v.name.includes('Google UK English Female')) ||           
        voices.find(v => v.name === 'Samantha') ||                                 
        voices.find(v => v.name === 'Daniel') ||                                   
        voices.find(v => v.lang.startsWith('en-US'));                              

      if (premiumVoice) {
        utterance.voice = premiumVoice;
      }

      utterance.rate = 0.98; 
      utterance.pitch = 1.0; 

      utterance.onend = () => setPlayingId(null);
      utterance.onerror = () => setPlayingId(null);

      setPlayingId(id);
      window.speechSynthesis.speak(utterance);
      setOpenMenuId(null); 
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = playNeuralVoice;
    } else {
      playNeuralVoice();
    }
  };

  const handleExportDocs = (text: string) => {
    const cleanText = text.replace(/\*\*/g, '').replace(/###/g, '').replace(/---\n/g, '');
    const blob = new Blob([cleanText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Radar_Insight.txt';
    a.click();
    URL.revokeObjectURL(url);
    setOpenMenuId(null);
  };

  const handleShareDraft = (text: string) => {
    const cleanText = text.replace(/\*\*/g, '').replace(/###/g, '').replace(/---\n/g, '');
    const subject = encodeURIComponent("Radar Treasury Insight");
    const body = encodeURIComponent(cleanText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setOpenMenuId(null);
  };

  // 🌟 THE FIX 2: Account Switching Listener 
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`radar_history_${activeAccount?.id || 'default'}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.lastUpdated < 60 * 60 * 1000) {
          setMessages(parsed.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
          return;
        }
      }
    } catch(e) {}
    setMessages([]);
  }, [activeAccount?.id]);

  // 🌟 THE FIX 3: Auto-Save Engine 
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`radar_history_${activeAccount?.id || 'default'}`, JSON.stringify({
        messages,
        lastUpdated: Date.now()
      }));
    } else {
      localStorage.removeItem(`radar_history_${activeAccount?.id || 'default'}`);
    }
  }, [messages, activeAccount?.id]);
  
 // =========================================================================
  // 🌟 OMNI-CHANNEL AGENTIC FEEDBACK & LIFECYCLE CONTROLLER
  // =========================================================================
  useEffect(() => {
    const handleTransactionSuccess = (e: any) => {
      try {
        // 🛡️ CHAOS SHIELD 1: Prevent destructuring crashes if e.detail is completely stripped by WebKit
        if (!e || !e.detail) return;
        
        const { type, data = {} } = e.detail;
        let receiptMessage = "";

        // 🛡️ CHAOS SHIELD 2: Global number formatter that strips commas and handles undefined/NaN
        const parseSafeNumber = (val: any) => {
          if (!val) return "0.00";
          const cleanStr = String(val).replace(/,/g, '');
          const num = Number(cleanStr);
          return isNaN(num) ? "0.00" : num.toLocaleString("en-US", { minimumFractionDigits: 2 });
        };

        // 🌐 OMNI-CHAIN EXPLORER ROUTER
        const getExplorerLink = (hash: string, network: string = "") => {
          let safeHash = hash?.trim() || "";
          const net = network?.toLowerCase() || "";
          if (!safeHash || safeHash.startsWith("CW-") || safeHash.length < 32) return null;
          
          const isTestnet = window.location.hostname === "localhost" || window.location.hostname.includes("testnet");
          const isStellarHash = /^[0-9a-fA-F]{64}$/.test(safeHash) && !safeHash.startsWith("0x");

          if (net.includes("stellar") || net.includes("soroban") || isStellarHash) {
            safeHash = safeHash.replace(/^0x/i, "");
            return `https://stellar.expert/explorer/${isTestnet ? 'testnet' : 'public'}/tx/${safeHash}`;
          }
          if (net.includes("solana")) return `https://solscan.io/tx/${safeHash.replace(/^0x/i, "")}${isTestnet ? '?cluster=devnet' : ''}`;
          
          if (!safeHash.startsWith("0x")) safeHash = "0x" + safeHash;
          if (net.includes("polygon")) return isTestnet ? `https://amoy.polygonscan.com/tx/${safeHash}` : `https://polygonscan.com/tx/${safeHash}`;
          if (net.includes("base")) return isTestnet ? `https://sepolia.basescan.org/tx/${safeHash}` : `https://basescan.org/tx/${safeHash}`;
          
          return isTestnet ? `https://sepolia.etherscan.io/tx/${safeHash}` : `https://etherscan.io/tx/${safeHash}`;
        };

        if (type === 'deposit') {
          receiptMessage = `**✅ Deposit Successfully Initiated**\n\nI have successfully tracked your deposit order.\n\n• **Amount:** ${data.fiatAmount ? `${data.fiatSymbol || ''}${data.fiatAmount}` : `${data.usdcAmount || '0'} USDC`}\n• **Expected Return:** +${data.usdcAmount || '0'} USDC\n• **Status:** Processing\n\nYour dashboard balance will automatically update once the funds clear the network.`;
        } 
        else if (type === 'withdrawal') {
          const rawHash = String(data.txDetails?.hash || data.txDetails?.id || "");
          const txId = data.txDetails?.id || "Pending";
          const shortHash = rawHash.length > 15 ? `${rawHash.substring(0,8)}...${rawHash.substring(rawHash.length-6)}` : rawHash;
          const targetNet = data.recipient?.network || 'Stellar';
          
          const explorerUrl = getExplorerLink(rawHash, targetNet);
          // 🌟 MAGIC: Formats the hash as a clickable Markdown Link if an explorer URL is found!
          const hashDisplay = explorerUrl ? `[\`${shortHash}\`](${explorerUrl})` : `\`${shortHash || 'Pending'}\``;
          
          receiptMessage = `**✅ Withdrawal Successfully Executed**\n\nI have securely processed your withdrawal on the blockchain.\n\n• **Tx ID:** \`${txId}\`\n• **Amount Deducted:** ${data.amounts?.usdc || '0.00'} USDC\n• **Destination:** ${data.recipient?.accountName || 'Recipient'} (${data.method === 'usdc' ? data.recipient?.network || 'Crypto Network' : data.recipient?.bank || 'Bank'})\n• **Net Expected:** ${data.amounts?.fiat ? `${data.recipient?.currency || ''} ${data.amounts?.fiat}` : `${data.amounts?.usdc || '0.00'} USDC`}\n• **Transaction Hash:** ${hashDisplay}\n\n⏳ Your funds are currently en route to the destination.\n\n**✨ Thank you for using Blink!**`;
        } 
        else if (type === 'payment') {
          const safeAmount = parseSafeNumber(data.amount);
          receiptMessage = `**✅ Escrow Payment Locked & Sent**\n\nI have successfully secured your funds in the smart escrow vault/contract.\n\n• **Amount:** $${safeAmount} USDC\n• **Recipient:** ${data.recipient || 'Recipient'}\n• **Claim Link:** [View Secure Portal](${data.link || '#'}) \n\n⏳ I'll track the blockchain state and update your ledger the moment the recipient verifies and claims the funds. \n\n**✨ Thank you for using Blink!**`;
        } 
        else if (type === 'request') {
          const safeAmount = parseSafeNumber(data.amount);
          receiptMessage = `**✅ Payment Request Generated**\n\nYour secure payment link has been created.\n\n• **Requested Amount:** ${data.currency || 'USDC'} ${safeAmount}\n• **Recipients:** ${data.recipientsCount || 1} people\n• **Payment Link:** [Share this link](${data.link || '#'}) \n\nYou can track the progress of this request in your Transactions ledger. \n\n**✨ Thank you for using Blink!**`;
        } 
        else if (type === 'pay_request') {
          const safeAmount = parseSafeNumber(data.amount);
          receiptMessage = `**✅ Invoice Successfully Paid**\n\nI have processed your payment for this request.\n\n• **Amount Paid:** ${data.currency || 'USDC'} ${safeAmount}\n• **Paid To:** ${data.recipient || 'Creator'}\n\n💸 Your Blink balance has been updated. \n\n**✨ Thank you for using Blink!**`;
        }

        if (receiptMessage) {
          const aiMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: receiptMessage,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, aiMsg]);
          
          if (pendingPaymentRef.current) pendingPaymentRef.current = null;
        }
      } catch (error) {
        console.error("[Radar Copilot] Error parsing transaction success payload", error);
      }
    };

    const handleModalDismiss = () => {
      if (pendingPaymentRef.current) {
        pendingPaymentRef.current = null;
      }
    };

    window.addEventListener('agentic_transaction_success', handleTransactionSuccess);
    window.addEventListener('agentic_modal_closed', handleModalDismiss);

    return () => {
      window.removeEventListener('agentic_transaction_success', handleTransactionSuccess);
      window.removeEventListener('agentic_modal_closed', handleModalDismiss);
    };
  }, []);



  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const isAutoSubmittingRef = useRef(false);
  const baseQueryRef = useRef(""); 
  const isManualOverrideRef = useRef(false); 

  // 🌟 FIX: CONVERSATIONAL PENDING PAYMENT STATE TRACKER
  const pendingPaymentRef = useRef<any>(null);

  const hasStarted = messages.length > 0;

  // =========================================================================
  // 🌟 RADAR ACTIVE LISTENER: Silently watches the blockchain for external deposits
  // =========================================================================
  useEffect(() => {
    if (!globalTransactions || globalTransactions.length === 0) return;

    // On initial load, populate the set so Radar doesn't announce old history
    if (processedDepositsRef.current.size === 0) {
      globalTransactions.forEach((tx: any) => processedDepositsRef.current.add(tx.id));
      return;
    }

    let hasNewDeposit = false;

    // Scan the synced ledger for any brand new transactions
    globalTransactions.forEach((tx: any) => {
      // 🌟 PRODUCTION FIX: Strict Ledger Isolation Guard
      const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
      const txSubId = String(tx.subAccountId);
      const activeId = String(activeAccount?.id);
      
      const belongsToActiveLedger = isMasterWallet 
         ? (!tx.subAccountId || txSubId === "null" || txSubId === "undefined")
         : (txSubId === activeId);

      // If this transaction doesn't belong to the active tab, ignore it completely!
      if (!belongsToActiveLedger) return;

      if (!processedDepositsRef.current.has(tx.id)) {
        processedDepositsRef.current.add(tx.id);

        // If a brand new incoming deposit just settled!
        if ((tx.type === 'deposit' || tx.type === 'fiat_deposit') && tx.status === 'completed') {
           const safeAmount = Number(tx.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
           
           // 🛡️ PRODUCTION FIX 1: Safe Hash Truncation Guard
           const rawHash = String(tx.txHash || "");
           const shortHash = rawHash.length > 15 
               ? `${rawHash.substring(0,8)}...${rawHash.substring(rawHash.length-6)}` 
               : (rawHash || tx.id);

           // 🌟 NEW: Extract True Network Name
           let actualNetwork = "Stellar";
           const rawNet = String(tx.network || "").toLowerCase();
           if (rawNet.includes("polygon")) actualNetwork = "Polygon";
           else if (rawNet.includes("solana")) actualNetwork = "Solana";
           else if (rawNet.includes("base")) actualNetwork = "Base";
           else if (rawNet.includes("ethereum") || rawNet.includes("erc20")) actualNetwork = "Ethereum";
           else if (rawNet.includes("mobile_money")) actualNetwork = "Mobile Money";
           else if (rawNet.includes("bank")) actualNetwork = "Local Bank Transfer";
           else if (rawHash.startsWith("0x")) actualNetwork = "EVM Network";

           // 🌟 NEW: Extract & Truncate Sender Address safely
           const rawSender = String(tx.senderAddress || tx.sender || tx.senderEmail || tx.metadata?.senderDetails?.walletAddress || tx.metadata?.senderDetails?.accountNumber || tx.metadata?.senderDetails?.name || "External Wallet");
           const isWallet = rawSender.length > 25 && !rawSender.includes('@') && !rawSender.includes(' ');
           const shortSender = isWallet ? `${rawSender.substring(0, 6)}...${rawSender.substring(rawSender.length - 4)}` : rawSender;
           const senderDisplay = isWallet ? `\`${shortSender}\`` : `**${shortSender}**`;

           // 🌟 NEW: Calculate Account Balance
           const currentBalNum = Number(tx.balanceAfter !== undefined ? tx.balanceAfter : activeAccount?.balance || 0);
           const newBalance = currentBalNum.toLocaleString("en-US", { minimumFractionDigits: 2 });

           // 🛡️ PRODUCTION FIX 2: Omni-Chain Explorer Router
           let explorerUrl = null;
           if (rawHash) {
               const net = String(tx.network || "").toLowerCase();
               const isTestnet = window.location.hostname === "localhost" || window.location.hostname.includes("testnet") || window.location.hostname.includes("staging");
               const cleanHash = rawHash.replace(/^0x/i, "");

               if (net.includes("polygon")) {
                   explorerUrl = isTestnet ? `https://amoy.polygonscan.com/tx/0x${cleanHash}` : `https://polygonscan.com/tx/0x${cleanHash}`;
               } else if (net.includes("base")) {
                   explorerUrl = isTestnet ? `https://sepolia.basescan.org/tx/0x${cleanHash}` : `https://basescan.org/tx/0x${cleanHash}`;
               } else if (net.includes("solana")) {
                   explorerUrl = `https://solscan.io/tx/${cleanHash}${isTestnet ? '?cluster=devnet' : ''}`;
               } else if (net.includes("ethereum") || net.includes("erc20")) {
                   explorerUrl = isTestnet ? `https://sepolia.etherscan.io/tx/0x${cleanHash}` : `https://etherscan.io/tx/0x${cleanHash}`;
               } else {
                   // Defaults to Stellar/Soroban
                   explorerUrl = `https://stellar.expert/explorer/${isTestnet ? 'testnet' : 'public'}/tx/${cleanHash}`;
               }
           }
           
           const hashDisplay = explorerUrl ? `[${shortHash}](${explorerUrl})` : `\`${shortHash}\``;
           
           const aiMsg: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `**📥 Incoming Deposit Confirmed**\n\nKa-ching! I just detected a new settled deposit on the blockchain.\n\n• **Amount:** ${safeAmount} ${tx.fiatCurrency || 'USDC'}\n• **Sent by:** ${senderDisplay}\n• **You now have:** $${newBalance}\n• **Network:** ${actualNetwork}\n• **Transaction Hash:** ${hashDisplay}`,
              timestamp: new Date()
           };
           
           // Delay slightly so it feels like a natural incoming notification
           setTimeout(() => {
             setMessages(prev => [...prev, aiMsg]);
           }, 1000);
           
           hasNewDeposit = true;
        }
      }
    });

    // If a new deposit hit, force the chat to scroll to the bottom
    if (hasNewDeposit) {
       setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 1200);
    }
  }, [globalTransactions]);

  // 🌟 EDGE AI VOICE ENGINE
  const {
    isListening,
    isProcessingVoice,
    downloadProgress,
    transcript,
    setTranscript,
    isSupported,
    errorMessage,
    toggleListening,
    stopListening
  } = useVoiceRecognition();

  const prevListeningRef = useRef(false);
  
  useEffect(() => {
    if (isListening && !prevListeningRef.current) {
      baseQueryRef.current = query;
    }
    prevListeningRef.current = isListening;
  }, [isListening, query]);

  useEffect(() => {
    if (transcript) {
      const mergedText = (baseQueryRef.current + " " + transcript).trim();
      setQuery(mergedText);
    }
  }, [transcript]); 

  useEffect(() => {
    if (!isListening && !isProcessingVoice && transcript.trim().length > 2 && !isAutoSubmittingRef.current && !isManualOverrideRef.current) {
      isAutoSubmittingRef.current = true;
      const finalText = (baseQueryRef.current + " " + transcript).trim();
      handleAsk(finalText); 
      setTranscript("");
    }
  }, [isListening, isProcessingVoice, transcript, setTranscript]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    if (textareaRef.current) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const defaultMobileHeight = '68px'; // 🌟 Generous mobile height for easy multi-line typing
      
      if (query === "") {
        textareaRef.current.style.height = radarLayoutMode === 'floating' 
          ? '76px' 
          : isMobile 
            ? defaultMobileHeight 
            : (hasStarted ? '52px' : '56px');
      } else {
        textareaRef.current.style.height = 'auto';
        const minHeight = isMobile ? 68 : (hasStarted ? 52 : 56);
        const autoHeight = Math.max(textareaRef.current.scrollHeight, minHeight);
        textareaRef.current.style.height = `${Math.min(autoHeight, 140)}px`;
      }
    }
  }, [query, hasStarted, radarLayoutMode]);

  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const updateGreeting = () => {
      const currentHour = new Date().getHours(); 
      
      if (currentHour >= 0 && currentHour < 12) {
        // 12:00 AM (Midnight) through 11:59 AM
        setGreeting("Good morning");
      } else if (currentHour >= 12 && currentHour < 17) {
        // 12:00 PM (Noon) through 4:59 PM
        setGreeting("Good afternoon");
      } else {
        // 5:00 PM through 11:59 PM
        setGreeting("Good evening");
      }
    };
    
    updateGreeting(); 
    const clock = setInterval(updateGreeting, 60000); 

    // 🌟 MOBILE SUSPENSION FIX: Instantly updates when user unlocks phone/switches tabs
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateGreeting();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', updateGreeting);

    return () => {
      clearInterval(clock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', updateGreeting);
    };
  }, []);

  const handleAsk = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    isAutoSubmittingRef.current = true;
    if (isListening && !isProcessingVoice) stopListening();

    abortControllerRef.current = new AbortController();

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    };

    if (window.innerWidth < 768) {
      textareaRef.current?.blur();
    }

    setMessages(prev => [...prev, userMsg]);
    setQuery(""); 
    setTranscript(""); 
    setIsProcessing(true);

    try {
      const targetUserId = activeAccount?.id || 'me';
      const minDelay = new Promise(resolve => setTimeout(resolve, 800));
      const lowerText = text.trim().toLowerCase();

      // =========================================================================
      // 🌟 MULTI-TURN CONVERSATIONAL STATE MACHINE
      // Traps follow-up replies BEFORE they reach the backend to prevent NLP hallucinations
      // =========================================================================
      if (pendingPaymentRef.current) {
        const ctx = pendingPaymentRef.current as any;

        if (ctx.status === 'AWAITING_CLARIFICATION') {
          const wantsWithdraw = lowerText.includes('withdraw') || lowerText.includes('bank') || lowerText.includes('off-ramp');
          const wantsSend = lowerText.includes('send') || lowerText.includes('escrow') || lowerText.includes('wallet') || lowerText.includes('crypto') || lowerText.includes('yes');
          const wantsCancel = lowerText.includes('cancel') || lowerText.includes('nevermind') || lowerText.includes('no');

          if (wantsCancel) {
            pendingPaymentRef.current = null;
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: "Transaction cancelled. How else can I assist you today?", timestamp: new Date() }]);
            setIsProcessing(false); isAutoSubmittingRef.current = false; return;
          }

          if (wantsWithdraw && ctx.fiatTarget) {
            pendingPaymentRef.current = null;
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Preparing a withdrawal of ${ctx.amount ? `**$${ctx.amount}**` : 'funds'} to **${ctx.recipientName}**'s bank. Please confirm the details in the portal.`, timestamp: new Date() }]);
            setTimeout(() => window.dispatchEvent(new CustomEvent('agentic_action', { detail: { type: "WITHDRAWAL", amount: ctx.amount, strictIntent: "bank_only", prefill: ctx.fiatTarget } })), 1000);
            setIsProcessing(false); isAutoSubmittingRef.current = false; return;
          } 
          
          if (wantsSend) {
            if (ctx.cryptoTarget) {
              pendingPaymentRef.current = null;
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Drafting digital transfer to **${ctx.recipientName}** (\`${ctx.cryptoTarget.details}\`). Please sign the transaction.`, timestamp: new Date() }]);
              setTimeout(() => window.dispatchEvent(new CustomEvent('agentic_action', { detail: { type: "SEND", amount: ctx.amount, recipient: ctx.cryptoTarget.details, strictIntent: "crypto_only" } })), 1000);
              setIsProcessing(false); isAutoSubmittingRef.current = false; return;
            } else {
              // They want to send, but we don't have an email/wallet saved for this person!
              pendingPaymentRef.current = { ...ctx, status: 'AWAITING_DETAILS' };
              setMessages(prev => [...prev, { 
                id: crypto.randomUUID(), 
                role: 'assistant', 
                content: `**📍 Missing Details**\n\nTo send a digital escrow payment to **${ctx.recipientName}**, please reply with their **email address** or **crypto wallet address**.`, 
                timestamp: new Date(), 
                suggestions: ["Cancel transaction"],
                isActionPrompt: true // 🌟 FLAGGED AS ACTION
              }]);
              setIsProcessing(false); isAutoSubmittingRef.current = false; return;
            }
          }
          
          // If input doesn't match expected answers, drop state and let backend process normally
          pendingPaymentRef.current = null;
        } 
        
        else if (ctx.status === 'AWAITING_DETAILS') {
          const isDirectEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
          const isDirectWallet = /^(0x[a-fA-F0-9]{40}|G[A-Z0-9]{55}|T[1-9A-HJ-NP-Za-km-z]{33})$/.test(text.trim());
          const wantsCancel = lowerText.includes('cancel') || lowerText.includes('nevermind');

          if (wantsCancel) {
            pendingPaymentRef.current = null;
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: "Transaction cancelled.", timestamp: new Date() }]);
            setIsProcessing(false); isAutoSubmittingRef.current = false; return;
          }

          if (isDirectEmail || isDirectWallet) {
            const destination = text.trim();
            pendingPaymentRef.current = null; 
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `I've prepared your digital transfer${ctx.amount ? ` for **$${ctx.amount}**` : ''} to **${ctx.recipientName}** (\`${destination}\`). Please review and sign.`, timestamp: new Date() }]);
            setTimeout(() => window.dispatchEvent(new CustomEvent('agentic_action', { detail: { type: "SEND", amount: ctx.amount, recipient: destination, strictIntent: "crypto_only" } })), 1000);
            setIsProcessing(false); isAutoSubmittingRef.current = false; return;
          } else {
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), 
              role: 'assistant', 
              content: `**⚠️ Invalid Format**\n\nThat doesn't look like a valid email or wallet address. Please provide the exact destination, or click "Cancel transaction".`, 
              timestamp: new Date(), 
              suggestions: ["Cancel transaction"],
              isActionPrompt: true // 🌟 FLAGGED AS ACTION
            }]);
            setIsProcessing(false); isAutoSubmittingRef.current = false; return;
          }
        }
      }

      // =========================================================================
      // 🚀 LET BACKEND PROCESS NORMAL QUERIES
      // =========================================================================
      const isMasterWallet = !activeAccount?.muxedId || activeAccount?.muxedId === "MASTER_WALLET";
      
      const apiCall = api.post(`/users/me/ask`, { 
        query: text,
        tzOffset: new Date().getTimezoneOffset(),
        currentTab,
        // 🌟 EXPLICIT LEDGER CONTEXT: Tell the AI engine exactly which sandbox it is in
        subAccountId: isMasterWallet ? null : activeAccount?.id,
        isMasterWallet: isMasterWallet
      }, {
        signal: abortControllerRef.current.signal,
        timeout: 10000 
      });

      const [res] = await Promise.all([apiCall, minDelay]);

      let finalAnswer = res.data.answer;
      let finalAction = res.data.action;
      let finalSuggestions = res.data.suggestions;
      let isActionPrompt = false; // 🌟 NEW: Track if this is a guard prompt

      // =========================================================================
      // 🌟 ENTERPRISE AGENTIC ENTITY RESOLVER & CONVERSATIONAL GUARD
      // =========================================================================
      if (finalAction && (finalAction.type === "SEND" || finalAction.type === "WITHDRAWAL")) {
        // 🌟 THE FIX: Prioritize the hard destination (details) OVER the cosmetic label (name)
        const rawRecipient = finalAction.recipient || (finalAction.prefill && finalAction.prefill.details) || (finalAction.prefill && finalAction.prefill.name);

        if (!rawRecipient) {
          pendingPaymentRef.current = { status: 'AWAITING_DETAILS', amount: finalAction.amount, recipientName: 'New Recipient' };
        } else {
          const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRecipient);
          const isWalletFormat = /^(0x[a-fA-F0-9]{40}|G[A-Z0-9]{55}|T[1-9A-HJ-NP-Za-km-z]{33})$/.test(rawRecipient);
          const isPhoneFormat = /^\+?\d{8,15}$/.test(rawRecipient.replace(/[\s-]/g, ''));

          // Only perform Address Book disambiguation if the input is a plain name
          if (!isEmailFormat && !isWalletFormat && !isPhoneFormat) {
            try {
              const recipientsRes = await api.get(`/users/${targetUserId}/recipients`, {
                signal: abortControllerRef.current.signal
              });
              const savedRecipients: any[] = recipientsRes.data || [];

              const normalizedSearch = rawRecipient.toLowerCase().replace(/'s$/i, '').trim();
              const matches = savedRecipients.filter((r: any) =>
                r.name.toLowerCase().includes(normalizedSearch) ||
                (r.details && r.details.toLowerCase().includes(normalizedSearch)) ||
                (r.email && r.email.toLowerCase().includes(normalizedSearch))
              );

              // 🌟 SAFETY NET: Unrecognized Recipient (Ask for email before popping error modal)
              if (matches.length === 0) {
                pendingPaymentRef.current = { 
                  status: 'AWAITING_DETAILS', 
                  amount: finalAction.amount, 
                  recipientName: rawRecipient 
                };
                finalAnswer = `I couldn't find "**${rawRecipient}**" in your address book. To send them a payment, please reply with their **email address** or **crypto wallet address**.`;
                finalSuggestions = ["Cancel transaction"];
                isActionPrompt = true; // 🌟 FLAGGED AS ACTION
                finalAction = null;
              } else {
                const fiatMatches = matches.filter((m: any) => {
                  const t = String(m.type || '').toLowerCase();
                  return t.includes('bank') || t.includes('mobile') || t.includes('momo') || Boolean(m.bankName || m.momoNetwork);
                });

                const cryptoMatches = matches.filter((m: any) => {
                  const t = String(m.type || '').toLowerCase();
                  return t.includes('email') || t.includes('wallet') || (!t.includes('bank') && !t.includes('mobile'));
                });

                // CASE A: Collision / Multiple conflicting options
                if (fiatMatches.length > 0 && cryptoMatches.length > 0) {
                  const cTarget = cryptoMatches[0];
                  const fTarget = fiatMatches[0];

                  pendingPaymentRef.current = { 
                    status: 'AWAITING_CLARIFICATION', 
                    amount: finalAction.amount, 
                    recipientName: cTarget.name,
                    cryptoTarget: { details: cTarget.email || cTarget.walletAddress },
                    fiatTarget: {
                      method: String(fTarget.type).toLowerCase().includes('mobile') ? "mobile" : "bank",
                      bankCountry: fTarget.bankCountry || fTarget.momoCountry || 'Nigeria',
                      currency: 'NGN',
                      details: fTarget.details || fTarget.accountNumber || '',
                      bankName: fTarget.bankName || fTarget.momoNetwork || "",
                      name: fTarget.name
                    }
                  };
                  
                  finalAnswer = `**🛡️ Disambiguation Guard**\n\nI found multiple saved destinations for "**${cTarget.name}**" (Bank & Digital Wallet).\n\nAre you looking to withdraw this to their bank, or send to their wallet?`;
                  finalSuggestions = ["Withdraw to bank", "Send to wallet", "Cancel transaction"];
                  isActionPrompt = true; // 🌟 FLAGGED AS ACTION
                  finalAction = null;
                }
                
                // CASE B: Unambiguous Bank Match
                else if (fiatMatches.length > 0 && cryptoMatches.length === 0) {
                  const target = fiatMatches[0];
                  const isMobile = String(target.type || '').toLowerCase().includes('mobile') || Boolean(target.momoNetwork);
                  const bankCountry = target.bankCountry || target.momoCountry || 'Nigeria';
                  const currency = target.bankCountry === 'Ghana' ? 'GHS' : target.bankCountry === 'Kenya' ? 'KES' : target.bankCountry === 'South Africa' ? 'ZAR' : 'NGN';
                  const details = target.details || (target as any).accountNumber || '';

                  const fiatPrefill = {
                    method: isMobile ? "mobile" : "bank",
                    bankCountry: bankCountry,
                    currency: currency,
                    details: details,
                    bankName: target.bankName || target.momoNetwork || "",
                    name: target.name,
                    momoCountry: target.momoCountry || bankCountry,
                    momoNetwork: target.momoNetwork || target.bankName || "",
                    network: "Stellar"
                  };

                  if (finalAction.type === "SEND") {
                      pendingPaymentRef.current = { 
                        status: 'AWAITING_CLARIFICATION', 
                        amount: finalAction.amount, 
                        recipientName: target.name,
                        fiatTarget: fiatPrefill,
                        cryptoTarget: null 
                      };
                      finalAnswer = `**🛡️ Clarification Guard**\n\nI noticed **${target.name}** is saved as a **${target.bankName || 'Bank'}** recipient.\n\nAre you looking to off-ramp and **withdraw** to their bank, or do you want to **send** a digital escrow payment to a new email or wallet instead?`;
                      finalSuggestions = ["Withdraw to bank", "Send escrow payment to recipient", "Cancel transaction"];
                      isActionPrompt = true; // 🌟 FLAGGED AS ACTION
                      finalAction = null; 
                  } else {
                      finalAnswer = `I'm preparing a withdrawal of ${finalAction.amount ? `**$${finalAction.amount}** ` : ''}to **${target.name}** (${target.bankName || target.momoNetwork || 'Bank'}). Please review and confirm.`;
                      finalAction = { type: "WITHDRAWAL", amount: finalAction.amount, prefill: fiatPrefill, strictIntent: "bank_only" };
                  }
                }
                
                // CASE C: Unambiguous Crypto Match
                else if (cryptoMatches.length > 0 && fiatMatches.length === 0) {
                  const target = cryptoMatches[0];
                  const validDestination = target.email || target.walletAddress || target.details;

                  if (finalAction.type === "WITHDRAWAL") {
                      pendingPaymentRef.current = { 
                        status: 'AWAITING_CLARIFICATION', 
                        amount: finalAction.amount, 
                        recipientName: target.name,
                        fiatTarget: null,
                        cryptoTarget: { details: validDestination } 
                      };
                      finalAnswer = `**🛡️ Clarification Guard**\n\nI noticed **${target.name}** is saved as a **Digital Wallet** recipient.\n\nAre you trying to **send** a crypto payment to their wallet, or did you mean to **withdraw** to a new bank account instead?`;
                      finalSuggestions = ["Send to wallet", "Withdraw to bank", "Cancel transaction"];
                      isActionPrompt = true; // 🌟 FLAGGED AS ACTION
                      finalAction = null; 
                  } else {
                      finalAnswer = `I'm drafting a secure transfer${finalAction.amount ? ` for **$${finalAction.amount}**` : ''} to **${target.name}** (\`${validDestination}\`). Please review and sign the transaction in the portal.`;
                      finalAction = { type: "SEND", amount: finalAction.amount, recipient: validDestination, strictIntent: "crypto_only" };
                  }
                }
              }
            } catch (err: any) {
              if (err.name !== 'CanceledError') console.warn("[Entity Resolution Error]", err);
            }
          }
        }
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalAnswer,
        timestamp: new Date(),
        suggestions: finalSuggestions,
        isActionPrompt // 🌟 Binds the UI flag to the message
      };
      
      setMessages(prev => [...prev, aiMsg]);

      if (finalAction) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('agentic_action', { detail: finalAction }));
        }, 1200); 
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.message === 'canceled') return;

      const serverMessage = err.response?.data?.answer || err.response?.data?.error || "Radar is temporarily offline. Please try again.";
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: serverMessage,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      isAutoSubmittingRef.current = false; 
      if (window.innerWidth >= 768) {
        setTimeout(() => textareaRef.current?.focus(), 10);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk(query);
    }
  };

 // 🌟 FIX: Added messageId parameter for unique inline copy tracking
  const renderFormattedText = (text: string, messageId: string = "default-id") => {
    const boldParts = text.split(/\*\*(.*?)\*\*/g);
    
    // 🌟 FIX: Dual Token Parser (Handles BOTH Links and `Inline Code`)
    const parseTokens = (str: string) => {
      const tokenRegex = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(str)) !== null) {
        if (match.index > lastIndex) {
          parts.push(str.substring(lastIndex, match.index));
        }
        
        if (match[1] && match[2]) {
          // Render Markdown Link
          parts.push(
            <a 
              key={match.index} 
              href={match[2]} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline decoration-blue-400 underline-offset-2 transition-colors inline-flex items-center gap-0.5 break-words"
              onClick={(e) => e.stopPropagation()} 
            >
              {match[1]}
            </a>
          );
        } else if (match[3]) {
          // Render Markdown `Code` with Inline Copy Button
          const codeText = match[3];
          const uniqueId = `${messageId}-inline-${match.index}`;

          parts.push(
            <span key={match.index} className="inline font-medium text-gray-900 tracking-tight">
              <span className="break-all">{codeText}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(codeText);
                  setCopiedId(uniqueId);
                  setTimeout(() => setCopiedId(null), 2000);
                }}
                className="inline-flex ml-1.5 align-middle text-[#A3A3A3] hover:text-[#2775CA] transition-colors shrink-0 outline-none"
                title="Copy address"
              >
                {copiedId === uniqueId ? <Check size={14} className="text-[#3BA66A]" /> : <Copy size={14} />}
              </button>
            </span>
          );
        }
        lastIndex = tokenRegex.lastIndex;
      }
      
      if (lastIndex < str.length) {
        parts.push(str.substring(lastIndex));
      }
      
      return parts.length > 0 ? parts : str;
    };

    return boldParts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-semibold text-gray-900">{part}</strong>;
      } else {
        const lines = part.split('\n');
        return (
          <span key={index}>
            {lines.map((line, i) => {
              const isBullet = line.trim().startsWith('•');
              const isHeader = line.trim().startsWith('###'); 

              return (
                <React.Fragment key={`${index}-${i}`}>
                  {isHeader ? (
                    <span className="block text-[16px] font-bold text-gray-900 mt-3 mb-2">
                      {parseTokens(line.replace(/^###\s*/, '').trim())}
                    </span>
                  ) : isBullet ? (
                     <span className="block pl-5 relative my-1.5 leading-relaxed text-gray-700">
                     <span className="absolute left-1.5 top-[2px] text-gray-400">•</span>
                     {parseTokens(line.substring(1).trim())}
                   </span>
                  ) : (
                    <span>{parseTokens(line)}</span>
                  )}
                  {i !== lines.length - 1 && !isBullet && !isHeader && <br />}
                </React.Fragment>
              );
            })}
          </span>
        );
      }
    });
  };

  const prompts = [
    { title: "Yield Velocity", desc: "Calculate automated interest generated.", icon: TrendingUp, action: "How much yield have we earned?" },
    { title: "Escrow Rules", desc: "Learn about on-chain milestone locks.", icon: Shield, action: "How do I create a secure escrow?" },
    { title: "Spend Analytics", desc: "Analyze specific vendor outflows.", icon: Calculator, action: "How much did we pay this month?" },
    { title: "Settlement", desc: "Check cross-border clearance times.", icon: ArrowRightLeft, action: "How long do bank withdrawals take?" }
  ];

  const renderAudioStatus = () => (
    <>
      {errorMessage && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-600 text-[12px] px-3 py-1.5 rounded-lg shadow-sm font-medium whitespace-nowrap z-20">
          {errorMessage}
        </div>
      )}
      
      {downloadProgress !== null && downloadProgress < 100 && (
         <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-gray-900 text-white rounded-xl shadow-lg z-20 w-max">
           <span className="text-[12px] font-medium">Securing AI Engine</span>
           <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
             <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
           </div>
           <span className="text-[11px] font-mono text-gray-400">{downloadProgress}%</span>
         </div>
      )}

      {isListening && downloadProgress === null && (
        <div 
          className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center justify-between px-3 py-1.5 bg-blue-50/90 border border-blue-100 rounded-xl animate-in fade-in backdrop-blur-sm shadow-sm z-20 w-max cursor-pointer" 
          onClick={() => {
            if(!isProcessingVoice) {
               isManualOverrideRef.current = false;
               toggleListening();
            }
          }} 
          title="Click to stop and send"
        >
          <div className="flex items-center gap-2 pr-3">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessingVoice ? 'bg-purple-400' : 'bg-blue-400 animate-ping'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isProcessingVoice ? 'bg-purple-600' : 'bg-blue-600'}`}></span>
            </span>
            <span className={`text-[12px] font-semibold tracking-tight ${isProcessingVoice ? 'text-purple-700' : 'text-blue-700'}`}>
              {isProcessingVoice ? 'Transcribing securely...' : 'Listening (Click to Send)'}
            </span>
          </div>
          {!isProcessingVoice && (
            <div className="flex items-center gap-1">
              <div className="w-1 bg-blue-600 rounded-full h-3 animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1 bg-blue-600 rounded-full h-4 animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 bg-blue-600 rounded-full h-2 animate-pulse" style={{ animationDelay: '300ms' }} />
              <div className="w-1 bg-blue-600 rounded-full h-3 animate-pulse" style={{ animationDelay: '75ms' }} />
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className={`flex flex-col w-full font-sans relative ${isGlobalDrawer ? 'h-full overflow-hidden' : ''}`}>

      {!hasStarted && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in duration-700">

          {/* 🌟 THE ALIGNMENT WRAPPER: Centers perfectly on mobile and desktop */}
          <div className={`flex flex-col items-center w-full transition-all duration-500 ${!isGlobalDrawer ? 'mt-2 sm:mt-10 lg:mt-[8vh]' : 'mt-4'}`}>

            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-md mb-8 ring-4 ring-blue-50">
              <Sparkles className="w-5 h-5 text-white" />
            </div>

            <h1 className="text-[28px] font-medium text-gray-900 tracking-tight mb-2 transition-all duration-500">
            {greeting}, {activeAccount?.name ? activeAccount.name.split(' ')[0] : 'Joshua'}.
          </h1>
          <p className="text-[15px] text-gray-500 mb-10 text-center">
            Your treasury story today on Blink starts with Radar copilot.
          </p>

          <form 
            onSubmit={(e) => { e.preventDefault(); handleAsk(query); }} 
            className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-[0_2px_12px_rgb(0,0,0,0.04)] focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all flex flex-col relative"
          >
            {renderAudioStatus()}
            
            <div className="flex items-start">
              <div className="pt-5 pl-5 pr-2">
                 <Sparkles className="w-5 h-5 text-blue-500" />
              </div>
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => {
                  isManualOverrideRef.current = true; 
                  if (isListening && !isProcessingVoice) stopListening();
                  setQuery(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                rows={1}
                placeholder={isListening ? (isProcessingVoice ? "Transcribing..." : "Listening to your voice...") : "Ask Radar a question or give a command..."}
                className="flex-1 py-3.5 sm:py-4 pr-4 text-[16px] sm:text-[15px] leading-5 text-gray-900 bg-transparent outline-none placeholder:text-gray-400 resize-none overflow-hidden"
              />
            </div>
            
            <div className="flex justify-between items-center px-4 pb-3 pt-1 border-t border-gray-50 mt-1">
               <div className="flex gap-2 text-gray-400 items-center">
                  {isSupported && (
                    <button
                      type="button"
                      disabled={isProcessingVoice}
                      onClick={() => {
                        isManualOverrideRef.current = false;
                        toggleListening();
                      }}
                      className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                        isListening 
                          ? 'bg-red-50 text-red-500 animate-pulse shadow-sm border border-red-100' 
                          : 'hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}
               </div>
               <button
                type="submit"
                disabled={!query.trim() || isProcessing || isProcessingVoice}
                className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </form>

          {/* 🌟 THE FIX: 1-col on mobile, 2-col on tablet, 4-col on desktop */}
          <div className={`grid gap-3 w-full max-w-4xl mt-8 ${
            radarLayoutMode === 'floating' 
              ? 'grid-cols-1 sm:grid-cols-2' 
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}>
            {prompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleAsk(prompt.action)}
                className="flex flex-col text-left p-4 bg-gray-50/50 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-2xl transition-all group"
              >
                <h3 className="text-[13px] font-semibold text-gray-900 mb-1">{prompt.title}</h3>
                <p className="text-[12px] text-gray-500 leading-snug">{prompt.desc}</p>
              </button>
            ))}
          </div>
          
          <div className="mt-8 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span onClick={() => { if (onBack) onBack(); }}>Refresh prompts</span>
          </div>

          </div> {/* CLOSING THE ALIGNMENT WRAPPER */}

        </div>
      )}

      {hasStarted && (
        <>
          {/* 🌟 MESSAGES WRAPPER: Dynamic bottom padding ensures last message isn't covered */}
          <div 
            className={`flex-1 overflow-y-auto ${isGlobalDrawer ? 'px-4 md:px-6 pb-[140px]' : 'px-4 sm:px-6 pb-[160px] lg:pb-[160px]'} pt-6 relative [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#E5E7EB] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#D1D5DB]`}
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}
          >
            <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full">
              <div className="flex flex-col gap-8">

                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col w-full">
                    {msg.role === 'user' && (
                      <div className="flex justify-end animate-in fade-in duration-300">
                        <div className="bg-gray-100 text-gray-900 px-5 py-3.5 rounded-3xl max-w-[80%]">
                          {/* 🌟 FIX: Added break-words to force long unbroken wallet addresses to wrap safely inside the bubble */}
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    )}

                    {msg.role === 'assistant' && (
                      <div className="flex justify-start mt-2 animate-in fade-in duration-500">
                        <div className="max-w-[90%] w-full">
                           <div className="flex items-center gap-2 mb-2">
                             <Sparkles className="w-4 h-4 text-blue-500" />
                             <span className="text-xs font-medium text-gray-400">Radar</span>
                           </div>
                           
                           <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                              {renderFormattedText(msg.content, msg.id)}
                           </div>

                           {msg.suggestions && msg.suggestions.length > 0 && (() => {
                             // 🌟 THE FIX: Dynamically detect Action Guards based on message content!
                             const isActionPrompt = msg.isActionPrompt || 
                                                    msg.content.includes('Guard**') || 
                                                    msg.content.includes('Missing Details**') || 
                                                    msg.content.includes('Invalid Format**');
                             
                             return (
                               <div className={`flex flex-wrap gap-2 mt-4 ${isActionPrompt ? 'pt-2' : ''}`}>
                                 {msg.suggestions.map((suggestion, idx) => {
                                   
                                   // 🌟 Render heavy Action Blocks for Guards
                                   if (isActionPrompt) {
                                     const isCancel = suggestion.toLowerCase().includes('cancel');
                                     return (
                                       <button
                                         key={idx}
                                         onClick={() => handleAsk(suggestion)}
                                         className={`flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl transition-all shadow-sm border ${
                                           isCancel 
                                             ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300' 
                                             : 'border-gray-200 text-gray-800 bg-white hover:bg-gray-50 hover:border-gray-300'
                                         }`}
                                       >
                                         {suggestion}
                                         <ChevronRight className={`w-3.5 h-3.5 ${isCancel ? 'text-red-400' : 'text-gray-400'}`} />
                                       </button>
                                     );
                                   }

                                   // STANDARD: Render standard lightweight pill for normal suggestions
                                   return (
                                     <button
                                       key={idx}
                                       onClick={() => handleAsk(suggestion)}
                                       className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100/50 px-3.5 py-1.5 rounded-full transition-colors"
                                     >
                                       {suggestion}
                                       <ChevronRight className="w-3 h-3 opacity-60" />
                                     </button>
                                   );
                                 })}
                               </div>
                             );
                           })()}

                           {/* 🌟 ACTION BAR: Copy, Reset, More (Gemini-style) */}
                           <div className="flex items-center gap-1 mt-5 pt-1 text-[#A3A3A3] animate-in fade-in duration-500 delay-300 fill-mode-both">
                             
                             <button 
                               onClick={() => handleCopy(msg.content, msg.id)} 
                               className="p-1 -ml-1 hover:text-[#1A1A1A] hover:bg-gray-100 rounded transition-all" 
                               title="Copy response"
                             >
                               {copiedId === msg.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                             </button>
                             
                             <button 
                               onClick={() => { setMessages([]); setQuery(""); }} 
                               className="p-1 hover:text-[#1A1A1A] hover:bg-gray-100 rounded transition-all" 
                               title="Reset conversation"
                             >
                               <RotateCcw size={16} />
                             </button>
                             
                             {/* 🌟 MORE OPTIONS DROPDOWN */}
                             <div className="relative">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }} 
                                 className={`p-1 hover:text-[#1A1A1A] hover:bg-gray-100 rounded transition-all ${openMenuId === msg.id ? 'bg-gray-100 text-[#1A1A1A]' : ''}`}
                                 title="More options"
                               >
                                 <MoreHorizontal size={16} />
                               </button>
                               
                               {openMenuId === msg.id && (
                                 <div 
                                   onClick={(e) => e.stopPropagation()}
                                   className="absolute bottom-full mb-1 left-0 w-[180px] bg-white border border-[#E8E7E1] rounded-xl shadow-lg py-1.5 z-50 text-[13px] font-medium text-[#1A1A1A] animate-in zoom-in-95 duration-200"
                                 >
                                   <button 
                                     onClick={() => handleListen(msg.content, msg.id)} 
                                     className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                                   >
                                     {playingId === msg.id ? (
                                       <><Square size={14} className="text-red-500 fill-red-500" /> Stop listening</>
                                     ) : (
                                       <><Volume2 size={14} className="text-gray-500" /> Listen</>
                                     )}
                                   </button>
                                   <button 
                                     onClick={() => handleExportDocs(msg.content)} 
                                     className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                                   >
                                     <FileText size={14} className="text-gray-500" /> Export to Docs
                                   </button>
                                   <button 
                                     onClick={() => handleShareDraft(msg.content)} 
                                     className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                                   >
                                     <Mail size={14} className="text-gray-500" /> Draft in Email
                                   </button>
                                 </div>
                               )}
                             </div>
                             
                           </div>

                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {isProcessing && (
                   <div className="flex justify-start mt-2 animate-in fade-in">
                    <div className="max-w-[90%] text-gray-800">
                       <div className="flex items-center gap-2 mb-2">
                         <Sparkles className="w-4 h-4 text-blue-300 animate-pulse" />
                         <span className="text-xs font-medium text-gray-400 flex gap-1">
                           Deep search in progress
                           <span className="flex gap-0.5 mt-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                           </span>
                         </span>
                       </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} className="h-24 w-full shrink-0" />
              </div>
            </div>
          </div>

          {/* 🌟 FLUSH STICKY FOOTER */}
          <div 
            className={
              isGlobalDrawer 
                ? "absolute bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-xl pt-3 px-4 z-40 border-t border-gray-100"
                : "sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-white/95 backdrop-blur-xl pt-3 sm:pt-4 z-40 border-t border-gray-200 transition-all duration-300 ease-in-out"
            }
            style={{ 
              paddingBottom: typeof window !== 'undefined' && window.innerWidth >= 1024 
                ? '24px' 
                : 'calc(env(safe-area-inset-bottom) + 16px)'
            }}
          >
            {/* 🌟 THE SIMPLE BLOCKER: A solid white curtain dropping directly below the sticky footer to hide anything scrolling underneath */}
            {!isGlobalDrawer && (
              <div className="absolute top-full left-0 right-0 h-[100px] bg-white pointer-events-none" />
            )}

            {/* Top Gradient Fade */}
            <div className={`absolute top-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-white to-transparent -translate-y-full ${isGlobalDrawer ? 'h-8' : 'h-16'}`} />
            
            <div className={`w-full mx-auto flex justify-center ${!isGlobalDrawer ? 'max-w-7xl' : ''}`}>
              <form 
                onSubmit={(e) => { e.preventDefault(); handleAsk(query); }} 
                className="relative w-full max-w-3xl flex items-end shadow-[0_2px_14px_rgb(0,0,0,0.06)] rounded-2xl bg-white border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 transition-all z-10 min-h-[68px] sm:min-h-[52px]"
              >
                {renderAudioStatus()}

                <textarea
                  ref={textareaRef}
                  value={query}
                  onChange={(e) => {
                    isManualOverrideRef.current = true; 
                    if (isListening && !isProcessingVoice) stopListening();
                    setQuery(e.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isProcessing}
                  rows={1}
                  placeholder={isListening ? (isProcessingVoice ? "Transcribing..." : "Dictate a command...") : "Ask a question or give a command..."}
                  className="flex-1 pl-4 sm:pl-5 pr-2 py-3.5 sm:py-3.5 text-[16px] sm:text-[15px] leading-relaxed text-gray-900 bg-transparent outline-none placeholder:text-gray-400 disabled:opacity-50 resize-none overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#E5E7EB] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#D1D5DB] max-h-[140px] min-h-[64px] sm:min-h-[48px]"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#f7f7f7 transparent' }}
                />
                
                <div className="pr-3 pb-3 sm:pb-2.5 shrink-0 flex items-center gap-1.5">
                  {isSupported && (
                    <button
                      type="button"
                      disabled={isProcessingVoice}
                      onClick={() => {
                        isManualOverrideRef.current = false;
                        toggleListening();
                      }}
                      className={`p-2 rounded-full transition-colors flex items-center justify-center ${
                        isListening 
                          ? 'bg-red-50 text-red-500 animate-pulse border border-red-100' 
                          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}
                  
                  <button
                    type="submit"
                    disabled={!query.trim() || isProcessing || isProcessingVoice}
                    className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
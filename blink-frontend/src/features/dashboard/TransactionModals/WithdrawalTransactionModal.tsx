import { useState, useEffect, useMemo } from "react";
import { X, Copy, Receipt, Loader2, RefreshCw, Pencil, ExternalLink } from "lucide-react";
import { ModalProps, parseTransactionData, CurrencyIcon, DetailRow, generateReceiptPDF } from "./TransactionUtils";
import { useStore } from "../../../store/useStore"; 
import { api } from "../../../lib/api";

export const WithdrawalTransactionModal = ({ isOpen, onClose, transaction, onRepeatTransaction }: ModalProps & { onRepeatTransaction?: (tx: any) => void }) => {
  const transactions = useStore((state) => state.transactions) as any[];
  const setTransactions = useStore((state) => state.setTransactions) as any;

  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // 🌐 BULLETPROOF MULTI-CHAIN EXPLORER ROUTER
  const getExplorerUrl = (network?: string, hash?: string): string | null => {
    let safeHash = hash?.trim() || "";
    const net = network?.toLowerCase() || "";

    if (!safeHash || safeHash.startsWith("CW-") || safeHash.length < 32) return null;

    const isTestnet = import.meta.env.MODE === "development" || import.meta.env.VITE_STELLAR_NETWORK === "testnet" || import.meta.env.VITE_NETWORK_ENVIRONMENT === "testnet";
    const isStellarHash = /^[0-9a-fA-F]{64}$/.test(safeHash) && !safeHash.startsWith("0x");

    if (net.includes("stellar") || net.includes("soroban") || isStellarHash) {
      safeHash = safeHash.replace(/^0x/i, "");
      return `https://stellar.expert/explorer/${isTestnet ? "testnet" : "public"}/tx/${safeHash}`;
    }

    if (net.includes("solana")) {
      safeHash = safeHash.replace(/^0x/i, "");
      return `https://solscan.io/tx/${safeHash}${isTestnet ? "?cluster=devnet" : ""}`;
    }

    if (!safeHash.startsWith("0x")) safeHash = "0x" + safeHash;

    if (net.includes("polygon")) return isTestnet ? `https://amoy.polygonscan.com/tx/${safeHash}` : `https://polygonscan.com/tx/${safeHash}`;
    if (net.includes("base")) return isTestnet ? `https://sepolia.basescan.org/tx/${safeHash}` : `https://basescan.org/tx/${safeHash}`;
    
    return isTestnet ? `https://sepolia.etherscan.io/tx/${safeHash}` : `https://etherscan.io/tx/${safeHash}`;
  };

  // 🌟 THE REAL-TIME ENGINE FIX: The "Stale Modal" Preventer
  const liveTx = useMemo(() => {
    if (!transaction) return null;
    const fresh = transactions.find((t: any) => String(t.id) === String(transaction.id));
    return fresh ? { ...transaction, ...fresh } : transaction;
  }, [transaction, transactions]);

  // 🌟 THE JSON DIGESTER: Safely parses backend fallbacks, extracts AI labels, and prevents raw JSON
  const { backendRecipientName, userEditableNote } = useMemo(() => {
    let extractedName = "";
    let extractedNote = liveTx?.note || "";

    if (liveTx) {
      try {
        if (typeof extractedNote === 'string' && extractedNote.trim().startsWith("{")) {
          const parsedData = JSON.parse(extractedNote);
          
          // 1. Salvage the AI label (e.g., "Treasury") from the JSON payload
          if (parsedData.accountName) extractedName = parsedData.accountName;
          else if (parsedData.name) extractedName = parsedData.name;

          // 2. Prevent raw JSON from bleeding into the Note UI
          if (parsedData.userNote) {
            extractedNote = parsedData.userNote;
          } else {
            extractedNote = "Withdrawal";
          }
        }
      } catch (e) {
        // If it is just a normal text note, leave it alone
      }
      
      // 3. Fallback audit trail for older transactions that didn't have a note
      if (extractedNote === "Withdrawal" || extractedNote === "") {
        if ((liveTx.description || "").toLowerCase().includes("radar") || liveTx.source === "radar") {
           extractedNote = "Initiated via Radar Copilot";
        }
      }
    }
    
    return { backendRecipientName: extractedName, userEditableNote: extractedNote };
  }, [liveTx]);

  useEffect(() => {
    if (isOpen && transaction) {
      setNote(userEditableNote);
      setIsEditingNote(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, transaction?.id]);

  if (!isOpen || !liveTx || liveTx.type !== "withdrawal") return null;

  const isCompleted = liveTx.status === "completed" || liveTx.status === "successful";
  const isFailed = liveTx.status === "failed" || liveTx.status === "rejected" || liveTx.status === "refunded";

  const { usdcAmount, fiatAmount, fiatCurrency, isFiat, reference, exchangeRate } = parseTransactionData(liveTx);
  const processingFee = liveTx.processingFee || 0;

  const txObj = liveTx as typeof liveTx & { hash?: string; txHash?: string };
  const realTxHash = txObj.hash || txObj.txHash;
  const displayId = realTxHash || reference || liveTx.id;
  
  const shortenedId = realTxHash 
    ? `${realTxHash.substring(0, 8)}...${realTxHash.substring(realTxHash.length - 6)}`
    : displayId.toUpperCase();

  const handleCopyRef = () => {
    navigator.clipboard.writeText(displayId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = new Date(liveTx.date || liveTx.createdAt || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  // 🌟 MULTI-CHANNEL DETECTOR: Deterministically identify the true withdrawal rail
  const isMoMo = liveTx.method === "mobile_money" || liveTx.network === "mobile_money" || (liveTx.description || "").toLowerCase().includes("momo");
  const isCrypto = !!liveTx.metadata?.recipientDetails?.walletAddress || liveTx.method === "crypto" || (liveTx.description || "").toLowerCase().includes("crypto");
  
  let finalRecipient = backendRecipientName;
  if (!finalRecipient && liveTx.metadata?.recipientDetails?.accountName) {
    finalRecipient = liveTx.metadata.recipientDetails.accountName;
  }
  if (!finalRecipient && liveTx.description?.includes("-")) {
    finalRecipient = liveTx.description.split("-")[1]?.trim() || "";
  }
  if (!finalRecipient) finalRecipient = "Recipient";

  let displayTo = `Bank - ${finalRecipient}`;
  if (isMoMo) {
    displayTo = `Mobile money - ${finalRecipient}`;
  } else if (isCrypto) {
    // Override the backend system name with a clean, user-friendly label
    displayTo = `External wallet - ${finalRecipient}`;
  }

  // 🌟 THE MISSING SAVE FUNCTION FIX: Patches the DB and updates the Zustand store instantly
  const handleSaveNote = async () => {
    if (!liveTx) return;
    setIsSavingNote(true);
    try {
      let payloadNote = note;
      const originalNote = liveTx.note || "";

      if (originalNote.startsWith('{') && originalNote.includes('}')) {
        try {
          const metadata = JSON.parse(originalNote);
          metadata.userNote = note; 
          payloadNote = JSON.stringify(metadata); 
        } catch (e) {
          console.warn("Could not parse existing metadata, overwriting note.");
        }
      }

      // Optimistic UI Update
      const safeTransactions = Array.isArray(transactions) ? transactions : [];
      const updatedTransactions = safeTransactions.map((t: any) => 
        t.id === liveTx.id ? { ...t, note: payloadNote } : t
      );
      setTransactions(updatedTransactions);

      await api.patch(`/transactions/${liveTx.id}`, {
        note: payloadNote
      });

      setIsEditingNote(false);
    } catch (error) {
      console.error("Failed to save note to database:", error);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      generateReceiptPDF(jsPDF, liveTx, "Withdraw money");
    } catch (err) {
      console.error("Failed to generate PDF.", err);
    } finally {
      setIsDownloading(false);
    }
  };

 return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" 
        onClick={onClose} 
      />
      
      <div 
        className="relative bg-[#F5F5F5] md:bg-white w-full md:w-[420px] h-[95vh] md:h-[98vh] mt-auto md:mt-[1vh] md:mr-[1vw] rounded-t-[24px] md:rounded-[24px] shadow-2xl flex flex-col p-4 md:p-5 animate-drawer-bottom md:animate-drawer-right z-[101]"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 bg-white md:bg-[#F5F5F5] hover:bg-[#EAEAEA] rounded-full transition-colors z-50 text-[#757575] shadow-sm md:shadow-none">
          <X size={16} strokeWidth={2.5} />
        </button>

        <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden">

          <div className="flex flex-col items-center mb-5 text-center mt-3 shrink-0">
            {isFiat ? (
              <div className="relative w-12 h-12 mx-auto mb-3">
                <div className="absolute top-0 left-0 w-8 h-8 bg-[#2775CA] rounded-full flex items-center justify-center text-white border-[2px] border-white z-10 shadow-sm">
                  <span className="font-bold text-[14px]">$</span>
                </div>
                <CurrencyIcon currency={fiatCurrency} />
              </div>
            ) : (
              <div className="w-12 h-12 bg-[#2775CA] rounded-full mb-3 flex items-center justify-center text-white shadow-sm border-[2px] border-blue-100">
                 <span className="font-bold text-[20px] tracking-tighter">$</span>
              </div>
            )}

            <p className="text-[12px] text-[#757575] font-medium mb-1">Withdraw money</p>
            <h3 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight mb-0.5">
              {isFiat ? `${fiatAmount!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}` : `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
            </h3>
            <p className="text-[11px] text-[#757575] font-medium">
              ≈ {usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </p>
          </div>

          <div className="w-full bg-white border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm overflow-y-auto flex-1 min-h-0">
            <h4 className="text-[12px] font-semibold text-[#1A1A1A] mb-3">Transaction Details</h4>
            
            <div className="space-y-0.5">
              <DetailRow label="To" value={displayTo} />
              
              {/* 🌟 FULL RECIPIENT AUDIT DETAILS */}
              {liveTx?.metadata?.recipientDetails && (
                <>
                  {isCrypto ? (
                    <>
                      <DetailRow label="Network" value={liveTx.metadata.recipientDetails.network || liveTx.network || 'N/A'} />
                      <DetailRow label="Wallet Address" value={
                         liveTx.metadata.recipientDetails.walletAddress 
                           ? `${liveTx.metadata.recipientDetails.walletAddress.substring(0, 6)}...${liveTx.metadata.recipientDetails.walletAddress.substring(liveTx.metadata.recipientDetails.walletAddress.length - 4)}` 
                           : 'N/A'
                      } />
                    </>
                  ) : (
                    <>
                      <DetailRow label={isMoMo ? "Provider" : "Bank Name"} value={liveTx.metadata.recipientDetails.bankName || liveTx.metadata.recipientDetails.provider || 'N/A'} />
                      <DetailRow label={isMoMo ? "Phone Number" : "Account Number"} value={liveTx.metadata.recipientDetails.accountNumber || liveTx.metadata.recipientDetails.phoneNumber || 'N/A'} />
                    </>
                  )}
                  <DetailRow label={isCrypto ? "Wallet Label" : "Account Name"} value={liveTx.metadata.recipientDetails.accountName || backendRecipientName || 'N/A'} />
                </>
              )}
              
              <DetailRow
                label={realTxHash ? "Blockchain Hash" : "Reference ID"} 
                valueNode={
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-[#1A1A1A]">{shortenedId}</span>
                    <button onClick={handleCopyRef} className="text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors relative" title="Copy full ID">
                      {copied && <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1.5 py-0.5 rounded">Copied!</span>}
                      <Copy size={12} />
                    </button>
                  </div>
                } 
              />
              
              {isFiat && (
                <>
                  <DetailRow label="Processing fee" value={`${processingFee.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${fiatCurrency}`} />
                  <DetailRow label="Exchange rate" value={`$1 @ ${exchangeRate.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${fiatCurrency}`} />
                </>
              )}
              
              <DetailRow label="Date" value={formattedDate} />
              
              {(() => {
                const targetNetwork = liveTx?.metadata?.recipientDetails?.network || liveTx?.network || "";
                const explorerUrl = getExplorerUrl(targetNetwork, realTxHash);
                
                if (!explorerUrl) return null;

                return (
                  <div className="flex justify-end pt-2 pb-0">
                    <a 
                      href={explorerUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[#2775CA] hover:underline font-medium decoration-[#2775CA] underline-offset-2"
                    >
                      View on block explorer <ExternalLink size={10} />
                    </a>
                  </div>
                );
              })()}
            </div>

            <hr className="my-3 border-[#F0F0EF]" />
            
            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-semibold text-[#1A1A1A]">Note</span>
                {!isEditingNote && (
                  <button onClick={() => setIsEditingNote(true)} className="flex items-center gap-1 text-[11px] text-[#A3A3A3] hover:text-[#1A1A1A] font-medium transition-colors">
                    {note === "Withdrawal" || !note ? "Edit note" : "Edit note"} <Pencil size={10} strokeWidth={2.5} className="text-[#2775CA] ml-0.5" />
                  </button>
                )}
              </div>
              
              {isEditingNote ? (
                <div className="flex items-center gap-2 mt-2 animate-in fade-in">
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter a note..."
                    autoFocus
                    disabled={isSavingNote}
                    className="flex-1 border border-[#EAEAEA] rounded-[8px] px-3 py-1.5 text-[12px] outline-none focus:border-[#2775CA] transition-colors bg-[#FAFAFA] focus:bg-white disabled:opacity-50"
                  />
                  <button 
                    onClick={handleSaveNote} 
                    disabled={isSavingNote}
                    className="bg-[#1A1A1A] text-white text-[11px] font-bold px-3 py-1.5 rounded-[8px] hover:bg-black transition-colors disabled:opacity-70 flex items-center gap-1"
                  >
                    {isSavingNote ? <Loader2 size={12} className="animate-spin" /> : null}
                    {isSavingNote ? "Saving" : "Save"}
                  </button>
                </div>
              ) : note && note !== "Withdrawal" ? (
                <p className="text-[12px] text-[#1A1A1A] font-medium mt-1 animate-in fade-in">{note}</p>
              ) : null}
            </div>
          </div>

          <div className="w-full bg-white border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm flex justify-between items-center shrink-0">
            <span className="text-[12px] font-semibold text-[#1A1A1A]">Status</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-[#34A853]' : isFailed ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-[12px] text-[#1A1A1A] font-medium capitalize transition-colors duration-500">{liveTx.status}</span>
            </div>
          </div>

          <div className="w-full flex gap-3 shrink-0 pt-1 pb-1">
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 py-3 bg-white border border-[#EAEAEA] text-[#1A1A1A] rounded-[12px] text-[12px] font-bold hover:bg-[#F9F9F9] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
            >
                {isDownloading ? <Loader2 size={14} className="animate-spin text-[#1A1A1A]" /> : <Receipt size={14} strokeWidth={2.5} />}
                {isDownloading ? "Generating..." : "Download receipt"}
            </button>
            <button 
              onClick={() => { onClose(); onRepeatTransaction?.(liveTx); }} // Closes modal and triggers flow!
              className="flex-1 py-3 bg-[#1A1A1A] text-white rounded-[12px] text-[12px] font-bold hover:bg-[#333333] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm"
            >
                <RefreshCw size={14} strokeWidth={2.5} /> Repeat transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
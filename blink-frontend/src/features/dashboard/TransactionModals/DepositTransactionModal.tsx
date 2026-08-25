import { useState, useEffect, useMemo } from "react";
import { X, Copy, Download, Loader2, RefreshCw, Pencil, ExternalLink } from "lucide-react";
import { ModalProps, parseTransactionData, CurrencyIcon, DetailRow, generateReceiptPDF } from "./TransactionUtils";
import { useStore } from "../../../store/useStore"; 
import { api } from "../../../lib/api";

export const DepositTransactionModal = ({ isOpen, onClose, transaction }: ModalProps) => {
  const activeAccount = useStore((state) => state.activeAccount); 
  const transactions = useStore((state) => state.transactions) as any[];
  const setTransactions = useStore((state) => state.setTransactions) as any;

  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // DYNAMIC EXPLORER ROUTING: Automatically swaps between Testnet and Mainnet
  const explorerNetwork = import.meta.env.PROD ? 'public' : 'testnet';

  // 🌟 THE REAL-TIME ENGINE FIX: The "Stale Modal" Preventer
  // Hot-swaps the static prop with fresh SSE data from the global store if it updates while open.
  const liveTx = useMemo(() => {
    if (!transaction) return null;
    const fresh = transactions.find((t: any) => String(t.id) === String(transaction.id));
    return fresh ? { ...transaction, ...fresh } : transaction;
  }, [transaction, transactions]);

  // 🌟 ENTERPRISE PARSING: Safely extract metadata using liveTx
  const { displayFrom, userEditableNote } = useMemo(() => {
    if (!liveTx) return { displayFrom: "Unknown", userEditableNote: "" };
    
    let sourceWallet = "";
    let extractedNote = liveTx.note || "";

    if (extractedNote.startsWith('{') && extractedNote.includes('}')) {
      try {
        const metadata = JSON.parse(extractedNote);
        if (metadata.blockchainSourceWallet) {
          sourceWallet = metadata.blockchainSourceWallet;
        }
        extractedNote = metadata.userNote || ""; 
      } catch (e) { }
    }

    const { isFiat } = parseTransactionData(liveTx);
    let from = "External Source";
    
    if (isFiat) {
       from = liveTx.description && liveTx.description !== "Deposit" 
          ? liveTx.description 
          : "Bank Transfer";
    } else if (sourceWallet) {
       from = `${sourceWallet.substring(0, 6)}...${sourceWallet.substring(sourceWallet.length - 4)}`;
    }

    return { displayFrom: from, userEditableNote: extractedNote };
  }, [liveTx]);


  // 🌟 FIX 2: Stop polling from overwriting the input by tracking transaction?.id
  // We strictly use the static transaction?.id here so if the SSE updates the liveTx, 
  // it doesn't wipe out the user's keystrokes while they are typing a note.
  useEffect(() => {
    if (isOpen && transaction) {
      setNote(userEditableNote);
      setIsEditingNote(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, transaction?.id]);

  if (!isOpen || !liveTx || liveTx.type !== "deposit") return null;

  const isCompleted = liveTx.status === "completed" || liveTx.status === "successful";
  const isFailed = liveTx.status === "failed";

  // Detect if this deposit is actually a system refund
  const isRefund = liveTx.trackingState === "refunded" || liveTx.description?.includes("Refund");

  const formattedDate = new Date(liveTx.date || liveTx.createdAt || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const { usdcAmount, fiatAmount, fiatCurrency, isFiat, reference, exchangeRate } = parseTransactionData(liveTx);

  const displayTo = isFiat ? "Main Balance" : (activeAccount?.walletAddress ? `${activeAccount.walletAddress.substring(0, 6)}...${activeAccount.walletAddress.substring(activeAccount.walletAddress.length - 4)}` : "Wallet Balance");

  const displayTxId = isFiat && reference ? reference : liveTx.id.toUpperCase();


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

      // OPTIMISTIC UI UPDATE
      const safeTransactions = Array.isArray(transactions) ? transactions : [];
      const updatedTransactions = safeTransactions.map((t: any) => 
        t.id === liveTx.id ? { ...t, note: payloadNote } : t
      );
      setTransactions(updatedTransactions);

      // Send the secure update to the backend
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
      generateReceiptPDF(jsPDF, liveTx, isRefund ? "Escrow Refund" : "Deposit money");
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
              <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center text-white shadow-sm border-[2px] ${isRefund ? 'bg-[#3BA66A] border-green-100' : 'bg-[#2775CA] border-blue-100'}`}>
                 {isRefund ? <RefreshCw size={20} strokeWidth={2.5} /> : <span className="font-bold text-[20px] tracking-tighter">$</span>}
              </div>
            )}
            
            {/* Dynamic Title */}
            <p className="text-[12px] text-[#757575] font-medium mb-1">
              {isRefund ? "Escrow Refund" : "Deposit money"}
            </p>

            <h3 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight mb-0.5">
              {isFiat ? `${fiatAmount!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}` : `${usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
            </h3>
            <p className="text-[11px] text-[#757575] font-medium">
              ≈ {usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </p>

            {/* Customized Context Banner */}
            {isRefund && (
              <div className="mt-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[10px] p-3 mx-4 flex items-start gap-2 text-left animate-in fade-in duration-300">
                <div className="w-5 h-5 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0 mt-0.5">
                  <RefreshCw size={12} className="text-[#166534]" />
                </div>
                <p className="text-[11px] text-[#166534] font-medium leading-relaxed">
                  This is a secure refund from a manually cancelled escrow transfer. The cancellation penalty has been deducted from the principal.
                </p>
              </div>
            )}
          </div>

          <div className="w-full bg-white border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm overflow-y-auto flex-1 min-h-0">
            <h4 className="text-[12px] font-semibold text-[#1A1A1A] mb-3">Transaction Details</h4>
            
            <div className="space-y-0.5">
              <DetailRow label="From" value={displayFrom} />
              <DetailRow label="To" value={displayTo} />
              
              <DetailRow 
                label="Transaction ID" 
                valueNode={
                  <div className="flex items-start justify-end gap-1.5">
                    <span className="text-[13px] font-medium text-[#1A1A1A] text-right break-all max-w-[190px]">
                      {displayTxId}
                    </span>
                    <button onClick={() => {
                      navigator.clipboard.writeText(displayTxId);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }} className="text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors relative mt-[3px]">
                      {copied && <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1.5 py-0.5 rounded">Copied!</span>}
                      <Copy size={12} />
                    </button>
                  </div>
                } 
              />
              
              {!isFiat && liveTx.network && <DetailRow label="Network" value={liveTx.network === "crypto_transfer" ? "Stellar Network" : liveTx.network} />}
              {!isFiat && <DetailRow label="Network fee" value={`${liveTx.networkFee || 0} USDC`} />}
              
              {isFiat && exchangeRate > 0 && (
                <DetailRow label="Exchange rate" value={`$1 @ ${exchangeRate.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${fiatCurrency}`} />
              )}
              
              <DetailRow label="Date" value={formattedDate} />
              
              {isFiat ? (
                <DetailRow label="Reference" value={reference} />
              ) : (
                <>
                  <DetailRow label="Transaction hash" value={(liveTx as any).txHash || reference} />
                  {/* Prevent raw JSON metadata from leaking into the Memo UI */}
                  {liveTx.memo && !liveTx.memo.trim().startsWith('{') && <DetailRow label="Memo" value={liveTx.memo} />}
                </>
              )}
              
              {!isFiat && (liveTx as any).txHash && (
                <div className="flex justify-end pt-2 pb-0">
                  <a 
                    href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${(liveTx as any).txHash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#2775CA] hover:text-[#1A5AA1] font-medium transition-colors flex items-center gap-1"
                  >
                    View on block explorer <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>

            <hr className="my-3 border-[#F0F0EF]" />
            
            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-semibold text-[#1A1A1A]">Note</span>
                {!isEditingNote && (
                  <button onClick={() => setIsEditingNote(true)} className="flex items-center gap-1 text-[11px] text-[#A3A3A3] hover:text-[#1A1A1A] font-medium transition-colors">
                    {note ? "Edit note" : "Click edit to add a note"} <Pencil size={10} strokeWidth={2.5} className="text-[#2775CA] ml-0.5" />
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
              ) : note ? (
                <p className="text-[12px] text-[#1A1A1A] font-medium mt-1 animate-in fade-in">{note}</p>
              ) : null}
            </div>
          </div>

          <div className="w-full bg-white border border-[#EAEAEA] rounded-[16px] p-4 mb-4 shadow-sm flex justify-between items-center shrink-0">
            <span className="text-[12px] font-semibold text-[#1A1A1A]">Status</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-[#34A853]' : isFailed ? 'bg-red-500' : 'bg-yellow-500'}`} />
              <span className="text-[12px] text-[#1A1A1A] font-medium capitalize transition-colors duration-500">
                {liveTx.status}
              </span>
            </div>
          </div>

          <div className="w-full flex gap-3 shrink-0 pt-1 pb-1">
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 py-3 bg-white border border-[#EAEAEA] text-[#1A1A1A] rounded-[12px] text-[12px] font-bold hover:bg-[#F9F9F9] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
            >
                {isDownloading ? <Loader2 size={14} className="animate-spin text-[#1A1A1A]" /> : <Download size={14} strokeWidth={2.5} />}
                {isDownloading ? "Generating..." : "Download receipt"}
            </button>
            <button className="flex-1 py-3 bg-[#1A1A1A] text-white rounded-[12px] text-[12px] font-bold hover:bg-[#333333] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                <RefreshCw size={14} strokeWidth={2.5} /> Repeat transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
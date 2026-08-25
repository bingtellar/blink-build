import React, { useState, useEffect } from "react";
import { X, Send, LifeBuoy, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../store/useStore";
import toast from "react-hot-toast";

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledTxId?: string;
}

export const SupportTicketModal: React.FC<SupportTicketModalProps> = ({ isOpen, onClose, prefilledTxId = "" }) => {
  const activeAccount = useStore((state: any) => state.activeAccount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [category, setCategory] = useState("Payment Issue");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [transactionId, setTransactionId] = useState(prefilledTxId);

  useEffect(() => {
    if (isOpen) {
      setTransactionId(prefilledTxId || "");
      setErrorMsg(""); 
    }
  }, [isOpen, prefilledTxId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const categories = ["Payment Issue", "Escrow Dispute", "Account Verification (KYC/KYB)", "API & Developer Tools", "Security & Fraud", "Other"];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!subject.trim() || !message.trim()) {
      setErrorMsg("Please provide a subject and a detailed message.");
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post(`/users/${activeAccount?.id || 'me'}/support/ticket`, {
        category, subject, message, transactionId: transactionId.trim() || undefined
      });

      toast.success("Support ticket submitted successfully. Our team will email you shortly.", { style: { background: '#1A1A1A', color: '#fff', borderRadius: '12px' } });
      
      setCategory("Payment Issue"); setSubject(""); setMessage(""); setTransactionId("");
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || "Failed to submit ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[24px] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative overflow-hidden">
        <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-[#F0F0EF] bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center"><LifeBuoy size={20} /></div>
            <div><h2 className="text-[18px] font-bold text-[#1A1A1A] leading-tight">Priority Support</h2><p className="text-[13px] text-[#757575] font-medium">Blink Treasury Operations</p></div>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-black hover:bg-gray-100 transition-colors disabled:opacity-50"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-6 custom-scrollbar">
          <form id="support-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={isSubmitting} className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] text-[#1A1A1A] outline-none focus:border-black transition-colors appearance-none cursor-pointer">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">Transaction ID <span className="normal-case font-medium text-gray-400 tracking-normal">(Optional)</span></label>
              <input type="text" maxLength={250} value={transactionId} onChange={(e) => setTransactionId(e.target.value)} disabled={isSubmitting} placeholder="e.g. TRX-9A8B7C6D" className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] text-[#1A1A1A] outline-none focus:border-black transition-colors placeholder:text-gray-400" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">Subject</label>
              <input required type="text" maxLength={250} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isSubmitting} placeholder="Briefly describe the issue..." className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] text-[#1A1A1A] outline-none focus:border-black transition-colors placeholder:text-gray-400" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-[#A3A3A3] uppercase tracking-wider mb-2 block">Message Details</label>
              <textarea required maxLength={4900} value={message} onChange={(e) => setMessage(e.target.value)} disabled={isSubmitting} rows={4} placeholder="Please provide as much context as possible so our team can resolve this quickly." className="w-full bg-[#F9F9F8] border border-[#E8E7E1] p-3.5 rounded-xl text-[14px] text-[#1A1A1A] outline-none focus:border-black transition-colors placeholder:text-gray-400 resize-none custom-scrollbar" />
            </div>
          </form>
          {errorMsg && (
            <div className="mt-4 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 animate-in fade-in">
              <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <p className="text-[13px] font-medium text-red-800 leading-snug">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#F0F0EF] bg-white shrink-0">
          <button type="submit" form="support-form" disabled={isSubmitting || !subject.trim() || !message.trim()} className="w-full flex items-center justify-center gap-2 bg-black text-white h-12 rounded-xl font-bold text-[14px] hover:bg-gray-800 hover:scale-[1.01] active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
            {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Submitting Ticket...</> : <><Send size={16} /> Submit to Operations</>}
          </button>
        </div>
      </div>
    </div>
  );
};
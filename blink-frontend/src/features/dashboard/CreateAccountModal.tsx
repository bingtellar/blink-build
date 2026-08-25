import React, { useState } from "react";
import { X, Loader2, AlertCircle, Wallet } from "lucide-react";
import { createSubAccount } from "../../services/api";

interface CreateAccountModalProps {
  isOpen: boolean;
  userId: string; 
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAccountModal = ({ isOpen, userId, onClose, onSuccess }: CreateAccountModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 🌟 ENTERPRISE FIX: Removed all dummy fields. We only need the Ledger Name.
  const [ledgerName, setLedgerName] = useState("");

  if (!isOpen) return null;

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ledgerName.trim()) {
      setError("Ledger name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 🌟 TRUE INTEGRATION: We pass the exact string the backend expects to generate the Muxed ID
      await createSubAccount(userId, ledgerName.trim());

      setIsSubmitting(false);
      setLedgerName("");
      onSuccess(); 

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate virtual ledger. Check your connection.");
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return; 
    setLedgerName("");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] w-full max-w-[420px] p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-[#E8E7E1]">
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Wallet size={20} className="text-[#1A1A1A]" />
            </div>
            <h3 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">Create Subaccount</h3>
            <p className="text-[13px] text-[#757575] mt-1 leading-relaxed">
              Generate a unique Subaccount (Stellar Muxed Address) to allow you to split funds across multiple accounts and for different purposes.
            </p>
          </div>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-[#8B8B8B] hover:text-[#1A1A1A] transition-colors disabled:opacity-50 mt-1"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateAccount} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-[12px] flex items-center gap-2 text-red-600 animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              <p className="text-[13px] font-medium leading-snug">{error}</p>
            </div>
          )}

          <div>
            <label className="text-[12px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5 block">
              Ledger Alias
            </label>
            <input 
              required
              disabled={isSubmitting}
              type="text" 
              value={ledgerName}
              onChange={(e) => {
                setLedgerName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Payroll Fund, Marketing Escrow"
              className="w-full px-4 py-3.5 bg-[#FAFAFA] border border-[#E8E7E1] rounded-[16px] text-[14px] focus:outline-none focus:border-[#1A1A1A] focus:bg-white transition-all shadow-inner disabled:opacity-60"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button 
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-[0.8] py-3.5 border border-[#E8E7E1] rounded-[16px] text-[14px] font-bold text-[#1A1A1A] hover:bg-[#F9F9F8] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || !ledgerName.trim()}
              className="flex-[1.2] py-3.5 bg-black text-white rounded-[16px] text-[14px] font-bold shadow-lg hover:bg-gray-800 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating...
                </>
              ) : (
                "Create Ledger"
              )}
            </button>
          </div>
        </form>
        
      </div>
    </div>
  );
};
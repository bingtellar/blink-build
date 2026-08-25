import { useState } from "react";
import { Search, Download, Plus, X, ChevronRight, ArrowLeft, Building2, User, Key, Power, Copy, CheckCircle2 } from "lucide-react";
import { CreateAccountModal } from "./CreateAccountModal";
import { useStore } from "../../store/useStore"; 

export interface AccountData {
  id: number | string;
  businessName: string;
  alias: string;
  name: string;
  type: string;
  balance: number;
  isActive: boolean;
  isReady: boolean;
  muxedAddress: string;
  muxedId: string;
}

interface AccountsProps {
  userId: string; 
  activeAccountId: string | number;
  onAccountSelect: (account: any) => void;
  onClose: () => void;
}

export const Accounts = ({ userId, onClose, onAccountSelect }: AccountsProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 🌟 THE FIX 1: The Armor Plate. 
  // We grab the raw accounts, and strictly force it to be an array. 
  // This completely immunizes the component against poisoned browser caches!
  const rawAccounts = useStore((state: any) => state.accounts);
  const globalAccounts = Array.isArray(rawAccounts) ? rawAccounts : []; 
  
  const activeAccount = useStore((state: any) => state.activeAccount);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const handleClose = () => {
    setIsClosing(true); 
    setTimeout(() => {
      if (onClose) onClose(); 
    }, 150); 
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    // Signal MainDashboard to perform a background sync so the new account appears
    window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
  };

  const handleSwitchToAccount = () => {
    if (selectedAccount) {
      onAccountSelect(selectedAccount); 
    }
    handleClose(); 
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Ensure we are filtering the live global array with safe property access
  const filteredAccounts = globalAccounts.filter((acc: AccountData) => 
    acc && (
      (acc.businessName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.alias || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.type || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Keep the selected view updated with live balances from the global store safely
  const liveSelectedAccount = selectedAccount 
    ? globalAccounts.find((a: AccountData) => a && a.muxedId === selectedAccount.muxedId) || selectedAccount
    : null;

  return (
    <div 
      className={`fixed inset-0 z-[100] bg-[#F5F4EF] flex flex-col font-sans overflow-y-auto duration-150 fill-mode-forwards ${
        isClosing ? "animate-out fade-out" : "animate-in fade-in"
      }`}
    >
      <div className="flex justify-between items-center p-8 lg:px-12 shrink-0">
        <div className="text-[28px] font-bold tracking-tight text-[#1A1A1A]">
          Blink <span className="text-blue-600 text-[20px] font-medium ml-2">Omnibus</span>
        </div>
        <button 
          onClick={handleClose} 
          className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
          aria-label="Close"
        >
          <X size={20} className="text-[#1A1A1A]" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 flex justify-center px-4 md:px-8 pb-12 w-full mt-4 md:mt-8 overflow-hidden">
        <div 
          className={`w-full max-w-[800px] bg-white border border-[#D1D1D1] rounded-[16px] shadow-sm p-6 md:p-10 h-max duration-150 fill-mode-forwards relative overflow-hidden ${
            isClosing 
              ? "animate-out fade-out slide-out-to-bottom-8" 
              : "animate-in fade-in slide-in-from-bottom-4"
          }`}
        >
          {!liveSelectedAccount ? (
            <div className="animate-in slide-in-from-left-4 duration-300 fade-in">
              <h2 className="text-[16px] font-bold text-[#1A1A1A] mb-8 flex items-center gap-2">
                {globalAccounts.length} Accounts
              </h2>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div className="relative w-full md:w-[200px]">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8B8B]" strokeWidth={2} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E8E7E1] rounded-[8px] text-[13px] text-[#1A1A1A] placeholder:text-[#8B8B8B] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#F7F8F8] border border-[#E8E7E1] rounded-[8px] text-[13px] font-medium text-[#8B8B8B] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors">
                    <Download size={14} /> Download statements
                  </button>
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-[8px] text-[13px] font-medium hover:bg-gray-800 transition-colors"
                  >
                    <Plus size={16} strokeWidth={2.5} /> Create Sub-account
                  </button>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-12 gap-4 pb-4 border-b border-[#E8E7E1] text-[13px] font-medium text-[#8B8B8B]">
                    <div className="col-span-6 pl-2">Account</div>
                    <div className="col-span-3 text-right pr-8">Balance</div>
                    <div className="col-span-2 text-left">Type</div>
                    <div className="col-span-1 text-right pr-2">Action</div>
                  </div>

                  <div className="divide-y divide-[#E8E7E1]">
                    {filteredAccounts.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-[#8B8B8B]">
                        <p className="text-[14px] font-medium">No accounts found.</p>
                      </div>
                    ) : (
                      filteredAccounts.map((acc: AccountData) => {
                        // 🌟 THE FIX 2: Strict active checking to prevent corrupted records from rendering as active
                        const isCurrentlyActive = activeAccount && String(acc.id) === String(activeAccount.id) && acc.muxedId === activeAccount.muxedId;

                        return (
                          <div 
                            key={`account-row-${acc.muxedId}-${acc.id}`} 
                            onClick={() => setSelectedAccount(acc)} 
                            className={`grid grid-cols-12 gap-4 py-4 items-center hover:bg-[#F9F9F8] transition-colors group cursor-pointer -mx-2 px-2 rounded-[12px] ${isCurrentlyActive ? 'bg-[#F9F9F8] border border-[#E8E7E1]' : ''}`}
                          >
                            <div className="col-span-6 flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-full border border-[#E8E7E1] flex items-center justify-center text-[11px] font-bold shrink-0 ${acc.muxedId === 'MASTER_WALLET' ? 'bg-black text-white' : 'bg-white text-[#1A1A1A]'}`}>
                                {getInitials(acc.businessName)}
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px] font-medium text-[#1A1A1A] truncate">{acc.businessName || acc.alias}</span>
                                  {isCurrentlyActive && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                                </div>
                                <span className="text-[12px] text-[#8B8B8B] truncate">{acc.name}</span>
                              </div>
                            </div>
                            <div className="col-span-3 text-right pr-8 text-[14px] font-medium text-[#1A1A1A]">
                              {formatCurrency(acc.balance)}
                            </div>
                            <div className="col-span-2 text-left text-[14px] font-medium text-[#1A1A1A] capitalize">
                              {acc.type}
                            </div>
                            <div className="col-span-1 flex justify-end pr-2 text-[#8B8B8B] group-hover:text-[#1A1A1A] transition-colors">
                              <ChevronRight size={16} strokeWidth={1.5} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-8 duration-300 fade-in pb-4">
              <button 
                onClick={() => setSelectedAccount(null)}
                className="flex items-center gap-2 text-[13px] font-bold text-[#8B8B8B] hover:text-[#1A1A1A] mb-8 transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={2.5} /> Back to accounts
              </button>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 bg-[#F9F9F8] p-6 rounded-[16px] border border-[#E8E7E1]">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full border border-[#D1D1D1] flex items-center justify-center text-[20px] font-bold shrink-0 ${liveSelectedAccount.muxedId === 'MASTER_WALLET' ? 'bg-black text-white' : 'bg-white text-[#1A1A1A]'}`}>
                    {getInitials(liveSelectedAccount.businessName)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-[22px] font-bold text-[#1A1A1A] leading-none">{liveSelectedAccount.businessName || liveSelectedAccount.alias}</h2>
                      {(activeAccount && String(liveSelectedAccount.id) === String(activeAccount.id) && liveSelectedAccount.muxedId === activeAccount.muxedId) && (
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] text-[#8B8B8B]">{liveSelectedAccount.name}</p>
                  </div>
                </div>
                
                <div className="md:text-right">
                  <p className="text-[12px] font-bold text-[#8B8B8B] uppercase tracking-wider mb-1">Available Balance</p>
                  <p className="text-[32px] font-bold text-[#1A1A1A] leading-none tracking-tight">
                    {formatCurrency(liveSelectedAccount.balance)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-[12px] font-bold text-[#8B8B8B] mb-1 flex items-center gap-2"><Building2 size={14}/> Account Name</p>
                    <p className="text-[14px] font-medium text-[#1A1A1A]">{liveSelectedAccount.businessName || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#8B8B8B] mb-1 flex items-center gap-2"><User size={14}/> Account Owner</p>
                    <p className="text-[14px] font-medium text-[#1A1A1A]">{liveSelectedAccount.name}</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-[12px] font-bold text-[#8B8B8B] mb-1 flex items-center gap-2"><Key size={14}/> Network ID</p>
                    <p className="text-[14px] font-mono font-medium text-[#1A1A1A]">{liveSelectedAccount.muxedId}</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#8B8B8B] mb-1 flex items-center gap-2"><Power size={14}/> Status</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${liveSelectedAccount.isReady ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className={`text-[13px] font-bold ${liveSelectedAccount.isReady ? 'text-[#1A1A1A]' : 'text-[#8B8B8B]'}`}>
                        {liveSelectedAccount.isReady ? "Ready to use" : "Setup required"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-10 p-4 bg-[#F5F4EF] border border-[#E8E7E1] rounded-[12px] flex items-center justify-between group">
                <div className="overflow-hidden pr-4">
                  <p className="text-[12px] font-bold text-[#8B8B8B] uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Key size={14}/> 
                    {liveSelectedAccount.muxedId === "MASTER_WALLET" ? "Master Deposit Address (G-Address)" : "Virtual Deposit Address (M-Address)"}
                  </p>
                  <p className="text-[13px] font-mono text-[#1A1A1A] truncate">{liveSelectedAccount.muxedAddress}</p>
                </div>
                <button 
                  onClick={() => copyToClipboard(liveSelectedAccount.muxedAddress)}
                  className="w-10 h-10 rounded-full bg-white border border-[#D1D1D1] flex items-center justify-center text-[#1A1A1A] hover:bg-gray-50 transition-colors shrink-0"
                >
                  {copiedId === liveSelectedAccount.muxedAddress ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
              </div>

              <div className="flex gap-3 pt-6 border-t border-[#E8E7E1]">
                <button 
                  onClick={handleSwitchToAccount}
                  disabled={activeAccount && String(liveSelectedAccount.id) === String(activeAccount.id) && liveSelectedAccount.muxedId === activeAccount.muxedId}
                  className={`flex-1 py-3 text-white rounded-[12px] text-[14px] font-bold transition-colors ${(activeAccount && String(liveSelectedAccount.id) === String(activeAccount.id) && liveSelectedAccount.muxedId === activeAccount.muxedId) ? 'bg-gray-300 pointer-events-none' : 'bg-black hover:bg-gray-800'}`}
                >
                  {(activeAccount && String(liveSelectedAccount.id) === String(activeAccount.id) && liveSelectedAccount.muxedId === activeAccount.muxedId) ? "Currently Active Account" : "Switch to this account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateAccountModal 
        isOpen={isModalOpen}
        userId={userId} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
};
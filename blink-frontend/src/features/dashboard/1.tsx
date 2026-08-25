import { useState, useMemo } from "react";
import { 
  ArrowDownToLine, ArrowUpRight, Search, Filter, Clock, Check, AlertCircle, 
  X, Copy, Receipt, ExternalLink, ArrowDownLeft, MoreHorizontal
} from "lucide-react";
import { TransactionData } from "./MainDashboard";

// ==========================================
// 1. TRANSACTION TRACKING MODAL COMPONENT
// ==========================================
interface TransactionTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionData | null;
}

const TransactionTrackingModal = ({ isOpen, onClose, transaction }: TransactionTrackingModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !transaction) return null;

  const isDeposit = transaction.type === "deposit";
  const isCompleted = transaction.status === "completed";
  const isFailed = transaction.status === "failed";
  const isPending = transaction.status === "pending";

  const handleCopyRef = () => {
    const textToCopy = transaction.reference || transaction.id;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-300 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full sm:max-w-[440px] rounded-t-[24px] sm:rounded-[32px] sm:rounded-b-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col max-h-[96dvh] sm:max-h-[90vh] pb-6 sm:pb-0 h-[90dvh] sm:h-[680px]">
        
        <div className="w-full flex justify-center pt-3 pb-1 bg-white sm:hidden shrink-0 z-50">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-white relative z-20 shrink-0 border-b border-[#F5F5F4]">
          <div className="w-8" />
          <h2 className="text-[16px] font-bold text-[#1A1A1A]">Transaction Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
        </div>

        <div className="relative bg-white flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center">
          
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 border ${isDeposit ? 'bg-[#F2FDF5] border-[#C6F6D5] text-[#34A853]' : 'bg-[#FAFAFA] border-[#E8E8E8] text-[#1A1A1A]'}`}>
            {isDeposit ? <ArrowDownLeft size={28} /> : <ArrowUpRight size={28} />}
          </div>
          
          <h3 className="text-[32px] font-bold text-[#1A1A1A] tracking-tight mb-2">
            {isDeposit ? "+" : "-"}{transaction.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
          </h3>
          
          <div className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold flex items-center gap-1.5 mb-8 ${isCompleted ? 'bg-[#E5F7ED] text-[#3BA66A]' : isPending ? 'bg-[#FFF9F2] text-[#D97706]' : 'bg-red-50 text-red-600'}`}>
            {isCompleted && <Check size={14} strokeWidth={3} />}
            {isPending && <Clock size={14} />}
            {isFailed && <AlertCircle size={14} />}
            <span className="uppercase tracking-wider">{transaction.status}</span>
          </div>

          <div className="w-full bg-[#F9F9F9] border border-[#EAEAEA] rounded-[24px] p-6 mb-8">
            <h4 className="text-[12px] font-bold text-[#878787] uppercase tracking-wider mb-6">Transfer Status</h4>
            <div className="space-y-6 relative ml-1.5">
              <div className="absolute left-[11px] top-2 bottom-2 border-l-[2px] border-[#EAEAEA] -z-10"></div>
              
              <div className="flex items-start gap-4 relative z-10">
                <div className="w-6 h-6 rounded-full bg-[#34A853] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </div>
                <div>
                  <h5 className="text-[14px] font-bold text-[#1A1A1A]">Request Initiated</h5>
                  <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">We received your request</p>
                </div>
              </div>

              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${isCompleted || isFailed ? 'bg-[#34A853] text-white' : 'bg-[#FFF9F2] border border-[#FDE68A] text-[#D97706]'}`}>
                   {isCompleted || isFailed ? <Check size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />}
                </div>
                <div>
                  <h5 className="text-[14px] font-bold text-[#1A1A1A]">Processing Network</h5>
                  <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">Confirming details with provider</p>
                </div>
              </div>

              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${isCompleted ? 'bg-[#34A853] text-white' : isFailed ? 'bg-red-500 text-white' : 'bg-[#F5F5F4] border border-[#EAEAEA]'}`}>
                   {isCompleted ? <Check size={12} strokeWidth={3} /> : isFailed ? <X size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB]" />}
                </div>
                <div>
                  <h5 className="text-[14px] font-bold text-[#1A1A1A]">{isFailed ? "Failed" : "Completed"}</h5>
                  <p className="text-[12px] text-[#757575] mt-0.5 leading-snug">
                    {isCompleted ? "Funds available in balance" : isFailed ? "Transaction was reversed" : "Awaiting final confirmation"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full space-y-4 px-1">
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Description</span>
               <span className="text-[14px] font-bold text-[#1A1A1A]">{transaction.description}</span>
             </div>
             
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Date & Time</span>
               <span className="text-[14px] font-bold text-[#1A1A1A]">
                  {new Date(transaction.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
               </span>
             </div>
             
             {transaction.network && (
               <div className="flex justify-between items-center py-1">
                 <span className="text-[13px] text-[#757575] font-medium">Network</span>
                 <span className="text-[14px] font-bold text-[#1A1A1A]">{transaction.network}</span>
               </div>
             )}
             
             <div className="flex justify-between items-center py-1">
               <span className="text-[13px] text-[#757575] font-medium">Reference</span>
               <div className="flex items-center gap-2">
                 <span className="text-[14px] font-bold text-[#1A1A1A] truncate max-w-[120px]">{transaction.reference || transaction.id}</span>
                 <button onClick={handleCopyRef} className="text-[#A3A3A3] hover:text-black transition-colors relative">
                   {copied && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded-md pointer-events-none">Copied!</span>}
                   {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                 </button>
               </div>
             </div>
          </div>

          <div className="w-full mt-auto pt-8 flex flex-col gap-3 shrink-0">
            <button className="w-full py-4 bg-white border border-[#EAEAEA] text-[#1A1A1A] rounded-[16px] text-[13px] font-bold hover:bg-[#F9F9F9] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <Receipt size={16} /> Download Receipt
            </button>
            <button className="w-full py-4 text-[#A3A3A3] rounded-[16px] text-[13px] font-bold hover:text-[#1A1A1A] transition-all flex items-center justify-center gap-2">
                Report an Issue <ExternalLink size={16} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. TRANSACTION HISTORY PAGE COMPONENT
// ==========================================
interface TransactionHistoryProps {
  transactions: TransactionData[];
  accountId?: string;
}

export const TransactionHistory = ({ transactions, accountId }: TransactionHistoryProps) => {
  const [mobileFilterType, setMobileFilterType] = useState<"all" | "deposit" | "withdrawal" | "payment">("all");
  const [webTabFilter, setWebTabFilter] = useState<"All" | "Completed" | "Pending" | "Paused" | "Cancelled">("All");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<TransactionData | null>(null);

  const baseFiltered = useMemo(() => {
    let filtered = transactions;
    if (accountId) {
      filtered = filtered.filter(tx => tx.accountId === accountId);
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.description.toLowerCase().includes(lowerQuery) ||
        tx.amount.toString().includes(lowerQuery) ||
        tx.id.toLowerCase().includes(lowerQuery)
      );
    }
    return filtered;
  }, [transactions, accountId, searchQuery]);

  const webCounts = useMemo(() => {
    return {
      completed: baseFiltered.filter(tx => tx.status === "completed").length,
      pending: baseFiltered.filter(tx => tx.status === "pending").length,
      paused: 0, 
      cancelled: baseFiltered.filter(tx => tx.status === "failed").length,
    };
  }, [baseFiltered]);

  const finalFiltered = useMemo(() => {
    let result = baseFiltered;

    // Mobile filter
    if (mobileFilterType !== "all") {
      result = result.filter(tx => tx.type === mobileFilterType);
    }

    // Web filter
    if (webTabFilter !== "All") {
      if (webTabFilter === "Completed") result = result.filter(tx => tx.status === "completed");
      if (webTabFilter === "Pending") result = result.filter(tx => tx.status === "pending");
      if (webTabFilter === "Paused") result = []; 
      if (webTabFilter === "Cancelled") result = result.filter(tx => tx.status === "failed");
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [baseFiltered, mobileFilterType, webTabFilter]);

  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: TransactionData[] } = {};
    finalFiltered.forEach(tx => {
      const date = new Date(tx.date);
      const dateString = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      if (!groups[dateString]) groups[dateString] = [];
      groups[dateString].push(tx);
    });
    return groups;
  }, [finalFiltered]);

  const isEmpty = finalFiltered.length === 0;

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <span className="bg-[#E5F7ED] text-[#3BA66A] px-2.5 py-1 rounded-md text-[11px] font-bold">Completed</span>;
    if (status === 'pending') return <span className="bg-[#FFF9F2] text-[#D97706] px-2.5 py-1 rounded-md text-[11px] font-bold">Pending</span>;
    if (status === 'failed') return <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[11px] font-bold">Failed</span>;
    return <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md text-[11px] font-bold capitalize">{status}</span>;
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return 'text-[#3BA66A]';
    if (status === 'pending') return 'text-[#D97706]';
    if (status === 'failed') return 'text-red-500';
    return 'text-[#757575]';
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      
      
      {/* ============================== */}
      {/* MOBILE HEADER                  */}
      {/* ============================== */}
      <div className="md:hidden flex flex-col gap-4 mb-8">
        <h1 className="text-[20px] font-bold text-[#1A1A1A]">Transaction History</h1>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E8E8E8] rounded-full text-[13px] outline-none focus:border-[#1A1A1A] transition-colors"
            />
          </div>
          
          <div className="relative">
             <select 
               value={mobileFilterType} 
               onChange={(e) => setMobileFilterType(e.target.value as any)}
               className="appearance-none bg-white border border-[#E8E8E8] rounded-full px-4 py-2.5 pr-10 text-[13px] font-bold text-[#1A1A1A] outline-none cursor-pointer"
             >
                <option value="all">All Types</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="payment">Payments</option>
             </select>
             <Filter size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ============================== */}
      {/* WEB HEADER (Moodboard style)   */}
      {/* ============================== */}
      <div className="hidden md:block mb-8">
        <div className="flex flex-col gap-8">
          <h1 className="text-[20px] font-medium text-[#1A1A1A]">Transactions</h1>
          
          <div className="relative flex items-center gap-6 text-[14px]">
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#EAEAEA]"></div>
            
            <button 
              onClick={() => setWebTabFilter("All")}
              className={`relative pb-3 z-10 transition-colors ${webTabFilter === "All" ? 'border-b-2 border-[#1A1A1A] text-[#1A1A1A] font-semibold' : 'border-b-2 border-transparent text-[#757575] hover:text-[#1A1A1A] font-medium'}`}
            >
              All
            </button>

            {[
              { name: "Completed", count: webCounts.completed },
              { name: "Pending", count: webCounts.pending },
              { name: "Paused", count: webCounts.paused },
              { name: "Cancelled", count: webCounts.cancelled }
            ].map(tab => (
              <button 
                key={tab.name}
                onClick={() => setWebTabFilter(tab.name as any)}
                className={`relative flex items-center gap-2 pb-3 z-10 transition-colors ${webTabFilter === tab.name ? 'border-b-2 border-[#1A1A1A] text-[#1A1A1A] font-semibold' : 'border-b-2 border-transparent text-[#757575] hover:text-[#1A1A1A] font-medium'}`}
              >
                {tab.name}
                <span className="bg-[#F5F5F5] text-[#757575] text-[11px] px-2 py-[2px] rounded-full font-bold">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Web Sub-filters */}
          <div className="flex items-center gap-3 mt-2">
            <div className="relative w-[280px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
              <input 
                type="text" 
                placeholder="Search" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#F9F9F9] border border-transparent rounded-lg text-[13px] outline-none focus:bg-white focus:border-[#E8E8E8] transition-colors"
              />
            </div>
            
            <button className="flex items-center gap-2 bg-[#F9F9F9] px-3 py-2 rounded-lg text-[13px] text-[#1A1A1A] font-medium hover:bg-[#F0F0F0] transition-colors">
              Processed date <Filter size={12} className="text-[#A3A3A3]" />
            </button>
            <button className="flex items-center gap-2 bg-[#F9F9F9] px-3 py-2 rounded-lg text-[13px] text-[#1A1A1A] font-medium hover:bg-[#F0F0F0] transition-colors">
              Last 7 days <Filter size={12} className="text-[#A3A3A3]" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================== */}
      {/* MAIN CONTENT AREA              */}
      {/* ============================== */}
      
    {/* Main Content Area: Responsive styling to keep mobile boxed, web seamless */}
      <div className={`relative ${isEmpty ? 'h-[460px]' : 'min-h-[400px]'} bg-white md:bg-transparent border border-[#F0F0EF] md:border-none rounded-[24px] md:rounded-none shadow-sm md:shadow-none p-6 md:p-0 overflow-hidden`}>
        
        {isEmpty ? (
           <>
             {/* Mobile Empty State */}
             <div className="md:hidden h-full flex flex-col items-center justify-center text-center opacity-50">
               <Search size={40} className="text-[#A3A3A3] mb-4" />
               <p className="text-[14px] font-bold text-[#1A1A1A]">No transactions yet</p>
               <p className="text-[13px] text-[#757575] mt-1">Start by making a deposit or payment to keep this account busy.</p>
             </div>

             {/* Web Empty State (Moodboard Style) */}
             <div className="hidden md:flex h-full w-full relative flex-col items-center justify-center">
                
                {/* Moodboard Skeleton Grid */}
                <div className="absolute inset-0 z-0 flex flex-col gap-3 pointer-events-none pt-4 px-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex w-full gap-3 opacity-50">
                       <div className="h-9 bg-[#F3F3F3] rounded-md w-[25%]"></div>
                       <div className="h-9 bg-[#F3F3F3] rounded-md w-[35%]"></div>
                       <div className="h-9 bg-[#F3F3F3] rounded-md w-[25%]"></div>
                       <div className="h-9 bg-[#F3F3F3] rounded-md w-[15%]"></div>
                    </div>
                  ))}
                </div>
                
                {/* White gradient to fade out the center skeleton lines so text pops */}
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-white to-transparent pointer-events-none"></div>
                
                {/* Centered Empty State Content */}
                <div className="relative z-10 flex flex-col items-center">
                  <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-2">No transaction yet</h3>
                  <p className="text-[13px] text-[#757575] mb-6 text-center max-w-[280px] leading-relaxed">
                    Start by making a deposit or payment to keep this account busy
                  </p>
                  <div className="flex items-center gap-3">
                    <button className="px-5 py-2.5 bg-[#F5F5F5] text-[#878787] rounded-full text-[13px] font-semibold hover:bg-[#EAEAEA] transition-colors">
                      Learn more
                    </button>
                    <button className="px-5 py-2.5 bg-[#F5F5F5] text-[#1A1A1A] rounded-full text-[13px] font-semibold hover:bg-[#EAEAEA] transition-colors">
                      Deposit now
                    </button>
                  </div>
                </div>
             </div>
           </>
              ) : (

        <>
          {/* ============================== */}
          {/* MOBILE LIST (exact cards) */}
          {/* ============================== */}
          <div className="md:hidden bg-white border border-[#F0F0EF] rounded-[24px] p-6 shadow-sm min-h-[50vh]">
            <div className="space-y-3">
              {finalFiltered.map((tx) => (
                <div key={tx.id} onClick={() => setSelectedTx(tx)} className="flex items-center justify-between p-4 bg-white border border-[#F0F0EF] rounded-[20px] hover:shadow-sm hover:border-[#D1D1D1] transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                      tx.type === 'deposit' ? 'bg-[#F2FDF5] border-[#C6F6D5] text-[#34A853]' : 'bg-[#FAFAFA] border-[#E8E8E8] text-[#1A1A1A]'
                    }`}>
                      {tx.type === 'deposit' ? <ArrowDownLeft size={20} strokeWidth={2.5} /> : <ArrowUpRight size={20} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[#1A1A1A]">{tx.description}</p>
                      <p className="text-[12px] text-[#757575] mt-0.5">
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-[15px] font-bold tracking-tight ${tx.type === 'deposit' ? 'text-[#34A853]' : 'text-[#1A1A1A]'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-[12px] capitalize mt-0.5 ${getStatusColor(tx.status)}`}>{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ============================== */}
          {/* WEB TABLE (Moodboard style)    */}
          {/* ============================== */}
          <div className="hidden md:block w-full text-left">
            
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_2fr_1.5fr_1.5fr_0.5fr] gap-4 pb-4 border-b border-[#EAEAEA] text-[13px] text-[#757575] font-medium">
              <div>Type</div>
              <div>Created at</div>
              <div>To</div>
              <div>Recipients</div>
              <div>Amount Disbursed</div>
              <div>Total Amount</div>
              <div>Status</div>
            </div>

            {/* Table Rows */}
            <div className="flex flex-col">
              {finalFiltered.map((tx) => {
                // Formatting specific to the table layout
                const isDep = tx.type === "deposit";
                const typeText = isDep ? "Deposit" : tx.type === "withdrawal" ? "Withdraw" : "Transfer";
                const toText = isDep ? "Account" : tx.type === "withdrawal" ? "Bank" : "Email";
                const recipientText = tx.description; 
                const dateText = new Date(tx.date).toLocaleDateString('en-GB').replace(/\//g, '.'); // Formats like 24.5.2024
                
                return (
                  <div 
                    key={tx.id} 
                    onClick={() => setSelectedTx(tx)}
                    className="grid grid-cols-[1fr_1fr_1fr_2fr_1.5fr_1.5fr_0.5fr] gap-4 py-5 border-b border-[#F5F5F5] hover:bg-[#FAFAFA] transition-colors items-center text-[13px] font-semibold text-[#1A1A1A] cursor-pointer"
                  >
                    <div className="capitalize">{typeText}</div>
                    <div>{dateText}</div>
                    <div>{toText}</div>
                    <div className="truncate pr-4">{recipientText}</div>
                    
                    {/* Amount Disbursed */}
                    <div>
                      {isDep ? "-" : `${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
                    </div>
                    
                    {/* Total Amount */}
                    <div>
                       {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                    </div>
                    
                    {/* Status Pill & Action */}
                    <div className="flex items-center gap-4 justify-between">
                      {getStatusBadge(tx.status)}
                      <button className="text-[#A3A3A3] hover:text-[#1A1A1A] transition-colors">
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
        )}
        </div>

      {/* Render the unified modal */}
      <TransactionTrackingModal 
        isOpen={!!selectedTx} 
        onClose={() => setSelectedTx(null)} 
        transaction={selectedTx} 
      />
    </div>
  );
};
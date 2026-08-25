import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, User, ShieldAlert, ArrowRightLeft, X } from 'lucide-react';
import { adminApi as api } from '../../lib/api'; 

interface SearchResults {
  users: Array<{ id: string; name: string; email: string; businessName: string }>;
  escrows: Array<{ id: string; claimId: string; status: string; amount: string }>;
  transactions: Array<{ id: string; reference: string; type: string; amount: string }>;
}

// 🌟 FIX: Added the onNavigate prop signature
interface AdminGlobalSearchProps {
    onNavigate: (type: 'user' | 'escrow' | 'transaction', data: any) => void;
}

export const AdminGlobalSearch = ({ onNavigate }: AdminGlobalSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setIsOpen(true);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await api.get(`/admin/search?q=${encodeURIComponent(query)}`);
        setResults(response.data);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 400); 

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // 🌟 FIX: Helper function to handle the click, trigger navigation, and close the search bar
  const handleResultClick = (type: 'user' | 'escrow' | 'transaction', data: any) => {
      onNavigate(type, data);
      setIsOpen(false);
      setQuery(''); // Optional: clears the search bar after jumping to the page
  };

  const hasResults = results && (results.users.length > 0 || results.escrows.length > 0 || results.transactions.length > 0);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl">
      <div className="relative flex items-center w-full">
        <Search size={16} className="absolute left-3 text-gray-400" />
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= 2) setIsOpen(true); }}
          placeholder="Search by Internal DB Trace, User Account, Email, or Amount..." 
          className="w-full pl-10 pr-10 py-2 bg-transparent border-none text-[13px] text-gray-900 focus:outline-none focus:ring-0 transition-all placeholder:text-gray-400 font-medium"
        />
        {isSearching ? (
          <Loader2 size={14} className="absolute right-3 text-emerald-500 animate-spin" />
        ) : query ? (
          <button onClick={() => { setQuery(''); setResults(null); setIsOpen(false); }} className="absolute right-3 text-gray-400 hover:text-gray-700">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          
          {!isSearching && !hasResults ? (
            <div className="p-6 text-center text-[13px] text-gray-500 font-medium">
              No results found for "{query}"
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              
              {results?.users && results.users.length > 0 && (
                <div className="p-2 border-b border-gray-100 last:border-0">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Users</div>
                  {results.users.map(user => (
                    // 🌟 FIX: Added onClick dispatcher
                    <button key={user.id} onClick={() => handleResultClick('user', user)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100"><User size={14}/></div>
                      <div className="truncate">
                        <p className="text-[13px] font-bold text-gray-900 truncate">{user.businessName || user.name || "Unnamed User"}</p>
                        <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.escrows && results.escrows.length > 0 && (
                <div className="p-2 border-b border-gray-100 last:border-0">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Escrows</div>
                  {results.escrows.map(escrow => (
                    // 🌟 FIX: Added onClick dispatcher
                    <button key={escrow.id} onClick={() => handleResultClick('escrow', escrow)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg flex items-center justify-between transition-colors group">
                      <div className="flex items-center gap-3 truncate pr-4">
                        <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-100"><ShieldAlert size={14}/></div>
                        <div className="truncate">
                          <p className="text-[13px] font-mono font-bold text-gray-900 truncate">{escrow.claimId}</p>
                          <p className="text-[11px] text-gray-500 capitalize">{escrow.status.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <div className="text-[13px] font-black text-gray-900 shrink-0">${Number(escrow.amount).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}

              {results?.transactions && results.transactions.length > 0 && (
                <div className="p-2 border-b border-gray-100 last:border-0">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Transactions</div>
                  {results.transactions.map(tx => (
                    // 🌟 FIX: Added onClick dispatcher
                    <button key={tx.id} onClick={() => handleResultClick('transaction', tx)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg flex items-center justify-between transition-colors group">
                      <div className="flex items-center gap-3 truncate pr-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100"><ArrowRightLeft size={14}/></div>
                        <div className="truncate">
                          <p className="text-[13px] font-mono font-bold text-gray-900 truncate">{tx.reference}</p>
                          <p className="text-[11px] text-gray-500 capitalize">{tx.type}</p>
                        </div>
                      </div>
                      <div className="text-[13px] font-black text-gray-900 shrink-0">${Number(tx.amount).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
};
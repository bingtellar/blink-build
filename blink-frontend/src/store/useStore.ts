import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AccountData {
  id: string | number; 
  alias?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  type: string;
  balance: string | number; 
  balances?: {
    mainOperating?: number;
    lockedInEscrows?: number;
    totalAvailable?: number;
    available?: number; 
    ledger?: number; 
  };
  escrowBalance?: string | number; 
  isReady: boolean;
  isActive: boolean;
  email?: string;
  walletAddress?: string;
  muxedAddress?: string;
  muxedId?: string;
  encryptedWalletKey?: string; 
  kycStatus?: string;
  role?: 'user' | 'admin' | 'super_admin'; 
  department?: string;
  modules?: string[];
}

export interface TransactionData {
  id: string | number;
  accountId: string | number;
  type: string;
  amount: string | number; 
  fiatAmount?: number;
  fiatCurrency?: string;
  status: string;
  description: string;
  recipientEmail?: string;
  note?: string;
  reference?: string;
  date?: string;
  createdAt?: string; 
  trackingState?: string; 
}

export type RadarLayoutMode = 'floating' | 'sidebar' | 'fullpage'; 

interface StoreState {
  accounts: AccountData[];
  activeAccount: AccountData | null;
  transactions: TransactionData[];
  isAdmin: boolean; 
  sessionKey: string | null; 
  
  isRadarOpen: boolean;
  radarLayoutMode: RadarLayoutMode;

  isInitialSyncComplete: boolean;
  streamStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  balanceLockUntil: number; 

  setAccounts: (accounts: AccountData[]) => void;
  setActiveAccount: (account: AccountData | null) => void;
  setTransactions: (transactions: TransactionData[]) => void;
  setSessionKey: (key: string | null) => void;
  
  setIsRadarOpen: (isOpen: boolean) => void;
  setRadarLayoutMode: (mode: RadarLayoutMode) => void;

  setInitialSyncComplete: (status: boolean) => void;
  setStreamStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  
  addTransaction: (transaction: TransactionData) => void;
  updateAccountBalance: (accountId: string | number, newBalance: string | number) => void;

  disconnect: () => Promise<void>; 
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      accounts: [],
      activeAccount: null,
      transactions: [],
      isAdmin: false,
      sessionKey: null, 
      isRadarOpen: false,         
      radarLayoutMode: 'floating', 
      isInitialSyncComplete: false,
      streamStatus: 'disconnected',
      balanceLockUntil: 0, 

      setIsRadarOpen: (isOpen) => set({ isRadarOpen: isOpen }),              
      setRadarLayoutMode: (mode) => set({ radarLayoutMode: mode }), 

      setAccounts: (accounts) => set((state) => {
        let newLock = state.balanceLockUntil;
        const isLocked = Date.now() < state.balanceLockUntil;

        const lockedAccounts = accounts.map(newAcc => {
            const existing = state.accounts.find(a => String(a.id) === String(newAcc.id) && a.muxedId === newAcc.muxedId);
            
            if (existing) {
                const oldBalance = parseFloat(String(existing.balance || "0").replace(/,/g, ''));
                const incomingBalance = parseFloat(String(newAcc.balance || "0").replace(/,/g, ''));

                if (isLocked) {
                    if (incomingBalance < oldBalance) {
                        newLock = Date.now() + 30000;
                        return newAcc; 
                    }
                    return { ...newAcc, balance: existing.balance, balances: existing.balances ? {...existing.balances} : undefined };
                } else {
                    if (incomingBalance < oldBalance) {
                        newLock = Date.now() + 30000; 
                    }
                    return newAcc;
                }
            }
            return newAcc;
        });

        return { accounts: lockedAccounts, balanceLockUntil: newLock };
      }),
      
      setActiveAccount: (activeAccount) => set((state) => {
        let isUserAdmin = false;
        let safeAccount = activeAccount ? { ...activeAccount } : null;
        let newLock = state.balanceLockUntil;

        if (safeAccount) {
          const isSameAccount = state.activeAccount && String(state.activeAccount.id) === String(safeAccount.id) && state.activeAccount.muxedId === safeAccount.muxedId;

          if (isSameAccount && state.activeAccount) {
             const oldBalance = parseFloat(String(state.activeAccount.balance || "0").replace(/,/g, ''));
             const incomingBalance = parseFloat(String(safeAccount.balance || "0").replace(/,/g, ''));
             const isLocked = Date.now() < state.balanceLockUntil;

             if (isLocked) {
                 if (incomingBalance < oldBalance) {
                     safeAccount.balance = typeof safeAccount.balance === 'number' ? safeAccount.balance.toFixed(2) : safeAccount.balance;
                     newLock = Date.now() + 30000;
                 } else {
                     safeAccount.balance = state.activeAccount.balance;
                     if (state.activeAccount.balances) {
                         safeAccount.balances = { ...state.activeAccount.balances };
                     }
                 }
             } else {
                 safeAccount.balance = typeof safeAccount.balance === 'number' ? safeAccount.balance.toFixed(2) : safeAccount.balance;
                 if (incomingBalance < oldBalance) {
                     newLock = Date.now() + 30000; 
                 }
             }
          } else {
             safeAccount.balance = typeof safeAccount.balance === 'number' 
               ? safeAccount.balance.toFixed(2) 
               : safeAccount.balance || "0.00";
          }
            
          isUserAdmin = safeAccount.role === 'admin' || safeAccount.role === 'super_admin';
          
          // 🌟 CACHE SYNC: We keep App.tsx perfectly aligned with Zustand RAM
          try {
              localStorage.setItem("bingtellar_user", JSON.stringify(safeAccount));
          } catch (e) {}
        }
        
        return { activeAccount: safeAccount, isAdmin: isUserAdmin, balanceLockUntil: newLock };
      }),
      
      setTransactions: (transactions) => set({ transactions }),
      setSessionKey: (key: string | null) => set({ sessionKey: key }),
      setInitialSyncComplete: (status) => set({ isInitialSyncComplete: status }),
      setStreamStatus: (status) => set({ streamStatus: status }),

      addTransaction: (transaction) => set((state) => {
        const exists = state.transactions.some(
          (t) => String(t.id) === String(transaction.id) || (t.reference && t.reference === transaction.reference)
        );
        if (exists) return state;
        return { transactions: [transaction, ...state.transactions] };
      }),

      updateAccountBalance: (accountId, newBalance) => set((state) => {
        const formattedBalance = typeof newBalance === 'number' 
          ? newBalance.toFixed(2) 
          : String(newBalance || "0.00");
          
        const numBalance = parseFloat(formattedBalance.replace(/,/g, ''));

        const updatedAccounts = state.accounts.map(acc => {
          if (String(acc.id) === String(accountId)) {
             return {
               ...acc,
               balance: formattedBalance,
               balances: {
                  ...(acc.balances || {}),
                  available: numBalance,
                  ledger: numBalance + ((acc.balances?.lockedInEscrows) || 0)
               }
             };
          }
          return acc;
        });

        let updatedActiveAccount = state.activeAccount;
        if (state.activeAccount && String(state.activeAccount.id) === String(accountId)) {
          updatedActiveAccount = { 
            ...state.activeAccount, 
            balance: formattedBalance,
            balances: {
               ...(state.activeAccount.balances || {}),
               available: numBalance,
               ledger: numBalance + ((state.activeAccount.balances?.lockedInEscrows) || 0)
            }
          };
          
          // 🌟 CACHE SYNC: Overwrite local storage immediately upon withdrawal 
          // This mathematically guarantees a hard refresh retains the optimistic balance.
          try {
              localStorage.setItem("bingtellar_user", JSON.stringify(updatedActiveAccount));
          } catch (e) {}
        }

        return { 
          accounts: updatedAccounts, 
          activeAccount: updatedActiveAccount,
          balanceLockUntil: Date.now() + 30000 // Engage the Titanium Lock
        };
      }),
      
      disconnect: async () => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (e) {}

        localStorage.removeItem("bingtellar_user");
        localStorage.removeItem("bingtellar_auth_token");
        localStorage.removeItem("token");
        localStorage.removeItem("jwt");

        set({ 
          accounts: [], 
          activeAccount: null, 
          transactions: [], 
          sessionKey: null, 
          isAdmin: false, 
          isRadarOpen: false,
          isInitialSyncComplete: false,
          streamStatus: 'disconnected',
          balanceLockUntil: 0
        });
      },
    }),
    {
      name: 'blink-ui-cache', 
      storage: createJSONStorage(() => localStorage),
      // 🔥 VERSION BUMP: Forces all browsers to instantly annihilate the old corrupted state
      version: 2, 
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccount: state.activeAccount,
        transactions: state.transactions,
        radarLayoutMode: state.radarLayoutMode, 
        balanceLockUntil: state.balanceLockUntil,
        isInitialSyncComplete: state.isInitialSyncComplete
      }),
    }
  )
);
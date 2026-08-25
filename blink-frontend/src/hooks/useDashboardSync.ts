import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';

export const useDashboardSync = (userId?: string) => {
  const setActiveAccount = useStore((state: any) => state.setActiveAccount);
  const setAccounts = useStore((state: any) => state.setAccounts);
  const setTransactions = useStore((state: any) => state.setTransactions);
  const setInitialSyncComplete = useStore((state: any) => state.setInitialSyncComplete);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    const bootDashboard = async () => {
      try {
        // 🔥 THE HTTP CACHE BUSTER
        // Injects a live timestamp so Cloudflare/Firefox can NEVER serve a stale balance
        const timestamp = Date.now();
        const [userRes, txRes] = await Promise.all([
          api.get(`/users/me?_t=${timestamp}`),
          api.get(`/transactions/${userId}?_t=${timestamp}`)
        ]);

        if (!isMounted) return;

        if (userRes.data?.user) {
          const user = userRes.data.user;
          const exactOwnerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.businessName || "Main Account";

          const masterAccount = {
            ...user,
            businessName: exactOwnerName,
            alias: "Primary Wallet",
            name: exactOwnerName,
            muxedId: "MASTER_WALLET",
            muxedAddress: user.walletAddress || "",
          };

          const mappedSubAccounts = (user.subAccounts || []).map((acc: any) => ({
            ...acc,
            businessName: acc.name,
            alias: acc.name,
            name: exactOwnerName,
            type: "Virtual Ledger",
            isReady: true,
          }));

          const allAccounts = [masterAccount, ...mappedSubAccounts];
          setAccounts(allAccounts);

          const currentActiveMuxed = useStore.getState().activeAccount?.muxedId;
          const updatedActive = allAccounts.find(a => a.muxedId === currentActiveMuxed) || masterAccount;
          setActiveAccount(updatedActive);
        }

        if (Array.isArray(txRes.data)) {
          const normalizedTxs = txRes.data.map((tx: any) => ({
            ...tx,
            date: tx.createdAt || tx.date || new Date().toISOString(),
            status: tx.status?.toLowerCase() || 'pending'
          }));
          setTransactions(normalizedTxs);
        }

      } catch (err) {
        console.error('[Sync Engine] Critical Boot Failure:', err);
      } finally {
        // 🌟 FAILSAFE UNLOCK: Guarantees the UI drops skeletons even if the network fails
        if (isMounted) {
            setInitialSyncComplete(true);
        }
      }
    };

    bootDashboard();

    // 1. WebSocket REST Hydrator
    window.addEventListener('BLINK_ONCHAIN_SYNC', bootDashboard);

    // 🌟 2. WINDOW FOCUS HYDRATOR 
    // Instantly pulls fresh balance when user switches tabs back to the app
    const handleFocus = () => bootDashboard();
    window.addEventListener('focus', handleFocus);

    // 🌟 3. THE SILENT HEARTBEAT
    // Passive loop ensures the UI is never out of sync even if WebSockets drop
    const heartbeat = setInterval(() => {
        if (document.visibilityState === 'visible') bootDashboard();
    }, 25000);

    return () => {
      isMounted = false;
      window.removeEventListener('BLINK_ONCHAIN_SYNC', bootDashboard);
      window.removeEventListener('focus', handleFocus);
      clearInterval(heartbeat);
    };
  }, [userId, setActiveAccount, setAccounts, setTransactions, setInitialSyncComplete]);
};
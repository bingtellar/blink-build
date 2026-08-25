import { useState, useEffect } from 'react';

export const useLiveVault = (walletAddress?: string) => {
  const [balances, setBalances] = useState<{ xlm: string, usdc: string | null }>({ xlm: "0.00", usdc: null });
  const [hasUsdcTrustline, setHasUsdcTrustline] = useState(true); 
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setIsSyncing(false);
      return;
    }

    const fetchBalances = async () => {
      try {
        const IS_MAINNET = import.meta.env.MODE === 'production';
        const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || (IS_MAINNET ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");

        const res = await fetch(`${HORIZON_URL}/accounts/${walletAddress}`);
        
        if (res.status === 404) {
          setBalances({ xlm: "0.00", usdc: null });
          setHasUsdcTrustline(false);
          return;
        }

        const data = await res.json();
        const xlmData = data.balances.find((b: any) => b.asset_type === 'native');
        const usdcData = data.balances.find((b: any) => b.asset_code === 'USDC'); 

        setBalances({
          xlm: xlmData ? parseFloat(xlmData.balance).toFixed(2) : "0.00",
          usdc: usdcData ? parseFloat(usdcData.balance).toFixed(2) : null
        });
        
        setHasUsdcTrustline(!!usdcData);

      } catch (error) {
        console.warn("Horizon network sync skipped.");
      } finally {
        setIsSyncing(false);
      }
    };

    fetchBalances();

    // 🌟 BULK-PROOF EVENT BUS
    let syncTimeout: NodeJS.Timeout;

    const handleOnChainSync = () => {
        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
             console.log(`⚡ Storm settled. Re-syncing Horizon balances...`);
             fetchBalances();
        }, 2000);
    };
    
    window.addEventListener('BLINK_ONCHAIN_SYNC', handleOnChainSync);
    
    // 60s fallback to reduce RPC pressure
    const interval = setInterval(fetchBalances, 60000);
    
    return () => {
        clearTimeout(syncTimeout);
        clearInterval(interval);
        window.removeEventListener('BLINK_ONCHAIN_SYNC', handleOnChainSync);
    };

  }, [walletAddress]);

  return { balances, hasUsdcTrustline, isSyncing };
};
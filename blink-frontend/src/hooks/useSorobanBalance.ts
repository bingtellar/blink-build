import { useState, useEffect, useCallback } from 'react';
import { rpc, Contract, Address, Account, TransactionBuilder, Networks, scValToNative } from '@stellar/stellar-sdk';

export function useSorobanBalance(accountId: string | undefined, tokenContractId: string) {
  const [liveBalance, setLiveBalance] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  const fetchBalance = useCallback(async (validAccountId: string, validTokenId: string) => {
    try {
      const IS_MAINNET = import.meta.env.MODE === 'production';
      const NETWORK_PASSPHRASE = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
      const RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || (IS_MAINNET ? "https://soroban-rpc.mainnet.stellar.org" : "https://soroban-testnet.stellar.org");

      const server = new rpc.Server(RPC_URL);
      const tokenContract = new Contract(validTokenId);
      
      const dummyAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
      
      const tx = new TransactionBuilder(dummyAccount, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(tokenContract.call("balance", new Address(validAccountId).toScVal()))
        .setTimeout(30)
        .build();
        
      const simResponse = await server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationSuccess(simResponse)) {
         const stroops = scValToNative(simResponse.result!.retval);
         const formatted = (Number(stroops) / 10000000).toString();
         setLiveBalance(formatted);
      }
    } catch (err) {
      console.warn("🚨 Soroban RPC fetch skipped. Relying on API database state.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || !tokenContractId) {
      setIsFetching(false);
      return;
    }

    fetchBalance(accountId, tokenContractId);

    // 🌟 BULK-PROOF EVENT BUS
    let syncTimeout: NodeJS.Timeout;
    
    const handleOnChainSync = () => {
        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            console.log(`⚡ Storm settled. Re-syncing on-chain Soroban balance...`);
            fetchBalance(accountId, tokenContractId);
        }, 2000); 
    };
    
    window.addEventListener('BLINK_ONCHAIN_SYNC', handleOnChainSync);
    
    // 60s fallback to reduce RPC pressure
    const interval = setInterval(() => fetchBalance(accountId, tokenContractId), 60000); 

    return () => {
        clearTimeout(syncTimeout);
        clearInterval(interval);
        window.removeEventListener('BLINK_ONCHAIN_SYNC', handleOnChainSync);
    };
  }, [accountId, tokenContractId, fetchBalance]);

  return { liveBalance, isFetching };
}
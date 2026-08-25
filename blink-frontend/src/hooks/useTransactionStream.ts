import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { dispatchDepositToast, dispatchErrorToast } from '../utils/toastDispatcher';

const envApiUrl = import.meta.env.VITE_API_URL;
const API_BASE = envApiUrl && envApiUrl !== "undefined" ? envApiUrl : "http://localhost:3001/api";

export function useTransactionStream() {
  const activeAccount = useStore((state: any) => state.activeAccount);
  const addTransaction = useStore((state: any) => state.addTransaction);
  const updateAccountBalance = useStore((state: any) => state.updateAccountBalance);
  const setStreamStatus = useStore((state: any) => state.setStreamStatus);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!activeAccount?.id) {
      setStreamStatus('disconnected');
      return;
    }

    const connectStream = async () => {
      setStreamStatus('connecting');
      abortControllerRef.current = new AbortController();

      // =====================================================================
      // 🌟 EXACT MIRROR OF src/lib/api.ts AUTHENTICATION
      // =====================================================================
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
      };
      
      const userToken = localStorage.getItem('bingtellar_auth_token');
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }

      try {
        await fetchEventSource(`${API_BASE}/events/stream`, {
          method: 'GET',
          credentials: 'include', // Ensures secure cookies pass through identically to axios
          headers,
          signal: abortControllerRef.current.signal,
          
          async onopen(response) {
            if (response.ok) {
              console.log("🟢 Bingtellar Infrastructure Stream Active");
              setStreamStatus('connected');
              return;
            }
            if (response.status === 401 || response.status === 403) {
              console.error(`🔴 Stream Auth Failed (HTTP ${response.status}). Validating pipeline...`);
              // Throw a specific error flag to trigger the kill-switch
              throw new Error("AUTH_FAILED"); 
            }
          },

          onmessage(event) {
            try {
              // 🌟 THE FIX: Ignore empty heartbeats/pings so JSON.parse doesn't crash
              if (!event.data) return;
              
              // Ignore the initial connection message
              if (event.event === 'connected') return;

              const payload = JSON.parse(event.data);
              console.log(`⚡ [SSE] Stream Payload Received [${event.event}]:`, payload);

              if (payload.transaction) addTransaction(payload.transaction);
              
              if (payload.newBalance !== undefined) {
                  const targetLedgerId = payload.accountId || payload.transaction?.accountId || activeAccount.id;
                  if (targetLedgerId) updateAccountBalance(targetLedgerId, payload.newBalance);
              }

              // 🛡️ THE RACE CONDITION FIX (DEBOUNCED):
              // Clear the previous timer if multiple deposits hit instantly.
              if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
              
              // ⚡ INSTANT HYDRATION
              // Wait only 500ms for Postgres to commit the transaction, then pull the absolute truth.
              syncTimeoutRef.current = setTimeout(() => {
                  window.dispatchEvent(new Event('BLINK_ONCHAIN_SYNC'));
              }, 500);

              const status = String(payload.status || payload.transaction?.status || '').toLowerCase();
              const rawAmount = payload.fiatAmount || payload.amount || payload.transaction?.amount;
              const parsedAmount = rawAmount ? parseFloat(rawAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00';
              const txId = payload.transaction?.id || payload.reference || payload.id || 'system_event';

              if (['completed', 'successful', 'settled'].includes(status)) {
                 const isDeposit = event.event === 'DEPOSIT_COMPLETED' || payload.type === 'deposit';
                 dispatchDepositToast(parsedAmount, txId, isDeposit);
              } else if (['failed', 'cancelled', 'rejected'].includes(status)) {
                 dispatchErrorToast(txId);
              }
            } catch (err) {
              console.error("[SSE] Failed to parse event payload", err);
            }
          },

          onerror(err) {
            // 🛡️ THE DDoS KILL-SWITCH
            // If the error was caused by a dead session, permanently sever the connection.
            // Do NOT let the package auto-retry.
            if (err instanceof Error && err.message === "AUTH_FAILED") {
              console.error("🔴 Fatal Auth Error. Severing stream to prevent infinite retry loop.");
              setStreamStatus('disconnected');
              throw err; 
            }

            // For standard network blips (WiFi drops), allow the auto-reconnect
            console.warn("🟡 SSE Stream Disconnected, Auto-Reconnecting...");
            setStreamStatus('reconnecting');
          },
          
          onclose() {
            setStreamStatus('disconnected');
          }
        });
      } catch (err) {
        setStreamStatus('disconnected');
      }
    };

    connectStream();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      setStreamStatus('disconnected');
    };
  }, [activeAccount?.id, addTransaction, updateAccountBalance, setStreamStatus]); 
}
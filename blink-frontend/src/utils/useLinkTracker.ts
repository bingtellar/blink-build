// src/hooks/useLinkTracker.ts
import { useState, useEffect } from 'react';
import { mockDB, EscrowPayment } from '../utils/mockDatabase'; // Adjust path if needed

interface TrackerResult {
  data: Partial<EscrowPayment> | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const useLinkTracker = (transactionId: string, pollingIntervalMs = 5000): TrackerResult => {
  const [data, setData] = useState<Partial<EscrowPayment> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = () => {
    if (!transactionId) {
      setError("No transaction ID provided.");
      setIsLoading(false);
      return;
    }

    try {
      const result = mockDB.verifyPaymentStatus(transactionId);
      
      if ('error' in result) {
        setError(result.error as string);
        setData(null);
      } else {
        setData(result as Partial<EscrowPayment>);
        setError(null);
      }
    } catch (err) {
      setError("A system error occurred while verifying the claim link.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Set up robust polling
    const interval = setInterval(() => {
      // Don't keep polling if it reached a terminal state to save memory
      if (data?.status === "claim_completed" || data?.status === "claim_canceled" || data?.status === "claim_expired") {
        clearInterval(interval);
        return;
      }
      fetchStatus();
    }, pollingIntervalMs);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [transactionId, data?.status]);

  return { data, isLoading, error, refresh: fetchStatus };
};
import { useState, useEffect } from 'react';

export const useYieldOracle = () => {
  const [apy, setApy] = useState<number>(13.00); 
  const [platformFee, setPlatformFee] = useState<string>("5.0");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchYield = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
        const response = await fetch(`${API_URL}/api/yield-metrics`);
        
        if (!response.ok) throw new Error("Failed to fetch APY from backend.");
        
        const json = await response.json();
        
        // Our backend always returns json.data (even in fallback mode)
        if (json.success && json.data) {
          setApy(json.data.apy);
          setPlatformFee(json.data.platformFeePercent);
        }
      } catch (error) {
        console.error("[Oracle] Frontend failed to reach backend, using local fallback.", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchYield();
    
    // Poll every 60 seconds to keep the dashboard live!
    const interval = setInterval(fetchYield, 60000); 
    return () => clearInterval(interval);
  }, []);

  return { apy, platformFee, isLoading };
};
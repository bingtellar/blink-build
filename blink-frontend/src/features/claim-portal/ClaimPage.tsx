/**
 * ClaimPage.tsx
 * 
 * CORE ARCHITECTURE COMPONENT
 * This is the main entry point for the Blink Claim Portal. It acts as the bridge between
 * our Web2 off-chain database (Postgres) and our Web3 on-chain truth (Soroban Smart Contracts).
 * 
 * Flow:
 * 1. Fetches metadata from the off-chain DB (names, emails, notes).
 * 2. Fetches cryptographic truth from the Soroban Ledger (exact principal, live status).
 * 3. Merges them, prioritizing the blockchain as the Single Source of Truth (SSOT).
 * 4. Routes the user to the correct UI state (Invite, Accept Form, Expired, or Claimed).
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react'; 
import { PaymentInvite } from './PaymentInvite';
import { AcceptPayment } from './AcceptPayment';
import { PaymentAlreadyClaimed } from './PaymentAlreadyClaimed';
import { PaymentAlreadyExpired } from './PaymentAlreadyExpired'; 
import { useYieldOracle } from '../../hooks/useYieldOracle'; 

// Environment routing for API calls
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Exported interface used across all child claim components to enforce strict typing.
export interface EscrowPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  senderName: string;
  recipientEmail: string;
  note?: string;
  dateCreated: string;
  dueDate?: string;
  claimableAfter?: string;
  estimatedYield: number;
  yieldRecipient: string;
  timeline?: Array<{ state: string; timestamp: string; metadata?: any }>;
}

interface ClaimPageProps {
  claimId: string;
}

export const ClaimPage = ({ claimId }: ClaimPageProps) => {
  // STATE MANAGEMENT
  const [hasStartedClaim, setHasStartedClaim] = useState(false);
  const [paymentData, setPaymentData] = useState<EscrowPayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🌍 MARKET ORACLE
  // Fetches the live APY (e.g., from DeFindex/Blend) to show the recipient the current 
  // expected yield rate while they view the claim.
  const { apy } = useYieldOracle();

  useEffect(() => {
    const fetchPayment = async () => {
      setIsLoading(true);
      
      // 🛡️ NETWORK FAILSAFE
      // If the backend or Soroban RPC hangs, we abort the request after 10 seconds 
      // to prevent the user from being stuck on an infinite loading screen.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        // ⚡ PARALLEL FETCH ENGINE
        // We query the database (Web2) and the Soroban Ledger (Web3) simultaneously.
        // If the on-chain truth fetch fails (e.g., RPC down), it gracefully returns null 
        // via the `.catch()` block rather than breaking the whole page.
        const [offChainRes, onChainRes] = await Promise.all([
          fetch(`${API_BASE}/escrows/${claimId}`, { signal: controller.signal }),
          fetch(`${API_BASE}/escrows/${claimId}/onchain-truth`, { signal: controller.signal }).catch(() => null)
        ]);
        
        clearTimeout(timeoutId); // Clear the failsafe timer since the request succeeded
        
        if (!offChainRes.ok) throw new Error("Claim not found");
        const dbData = await offChainRes.json();
        
        // Safely extract the blockchain data if the Ledger request was successful
        let chainData = null;
        if (onChainRes && onChainRes.ok) {
           const json = await onChainRes.json();
           if (json.success) chainData = json.data;
        }
        
        // 🔗 THE DATA MERGE (Single Source of Truth Injection)
        setPaymentData({
          id: dbData.claimId,
          
          // CRITICAL: We use nullish coalescing (`??`) to prioritize the Soroban Ledger.
          // If the blockchain returns a status, principal, or yield, we completely overwrite 
          // whatever the database had stored. This prevents "phantom balances".
          status: chainData?.status ? chainData.status.toLowerCase() : dbData.status, 
          amount: chainData?.principal ?? parseFloat(dbData.amountLocked || "0"),
          estimatedYield: chainData?.recipientYieldShare ?? parseFloat(dbData.estimatedYield || "0"),
          
          // Metadata purely relies on the Postgres database (not stored on-chain to save gas)
          currency: dbData.currency || "USDC",
          senderName: dbData.senderName ? dbData.senderName.split(' ')[0] : "Sender",
          recipientEmail: dbData.recipientEmail,
          note: dbData.note,
          dateCreated: dbData.createdAt,
          dueDate: dbData.dueDate,
          claimableAfter: dbData.claimableAfter,
          yieldRecipient: dbData.yieldRecipient || "split",
          timeline: dbData.timeline || []
        });

      } catch (error: any) {
        console.error("Failed to load claim:", error);
        
        // Determine if the failure was a timeout or a genuine 404
        if (error.name === 'AbortError') {
            console.error("Backend request timed out.");
        }
        
        // Route to an expired/error state to handle the failure gracefully
        setPaymentData({ status: "claim_expired" } as EscrowPayment);
      } finally {
        setIsLoading(false);
      }
    };

    if (claimId) fetchPayment();
    
    // Cleanup function to prevent memory leaks if component unmounts early
    return () => setIsLoading(false);
  }, [claimId]);

 // ============================================================================
  // UI ROUTING LOGIC (Strict State Machine)
  // ============================================================================

  // STATE 1: Fetching
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F4EF] flex flex-col items-center justify-center font-sans">
        <Loader2 size={32} className="animate-spin text-[#1A1A1A] mb-4" />
        <p className="text-[14px] text-[#757575] font-medium">Securing connection...</p>
      </div>
    );
  }

  const status = paymentData?.status?.toLowerCase() || "";

  // STATE 2: Terminal / Dead States (Blacklist)
  // If the transaction failed, was cancelled, or refunded, kill it.
  const isDeadState = ["canceled_expired", "claim_expired", "claim_canceled", "failed", "rejected", "refunded"].includes(status);
  if (!paymentData || isDeadState) {
    return <PaymentAlreadyExpired paymentData={paymentData} onClose={() => window.location.href = '/'} onLearnMore={() => window.location.href = '/signup'} />;
  }

  // STATE 3: Claimed / Settled States
  const isClaimedState = ["succeeded", "successful", "claim_completed", "completed", "claimed"].includes(status);
  if (isClaimedState) {
    return <PaymentAlreadyClaimed paymentData={paymentData} onClose={() => window.location.href = '/'} onLearnMore={() => window.location.href = '/signup'} />;
  }

  // STATE 4: Actively processing withdrawal form
  const isActivelyClaiming = ["claim_started", "claim_pending", "claim_processing"].includes(status);
  
  if (isActivelyClaiming || hasStartedClaim) {
    return (
      <AcceptPayment 
        paymentData={paymentData as any} 
        apy={apy} 
        onSuccess={(updatedData: any) => setPaymentData(updatedData)} 
      />
    );
  }

  // STATE 5: The Default Security Gate (The Master Fix)
  // If the vault is not dead, not claimed, and not actively processing,
  // it MUST be a healthy vault waiting for the recipient to enter their OTP.
  // This makes the UI 100% immune to unknown blockchain status strings.
  return (
    <PaymentInvite 
      paymentData={paymentData} 
      onAccept={async () => {
        try {
          await fetch(`${API_BASE}/escrows/${paymentData.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              newStatus: 'claim_started',
              note: "Recipient successfully passed OTP gate and started the claim process."
            })
          });
          setPaymentData(prev => prev ? { ...prev, status: "claim_started" } : prev);
          setHasStartedClaim(true);
        } catch (error) {
          console.error("Failed to update status", error);
          setHasStartedClaim(true); 
        }
      }} 
      onClose={() => window.location.href = '/'} 
    />
  );
};
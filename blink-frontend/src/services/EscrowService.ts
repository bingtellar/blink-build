// src/services/EscrowService.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface CreateEscrowPayload {
  creatorId: string | number;
  amountLocked: string;
  feeAmount?: string;
  recipientEmail: string;
  title?: string;
  note?: string;
  claimableAfter?: string;
  contractId?: string;
  expiryDate?: string;
  signedXdr?: string;
  notifyOnClaim?: boolean;  
  claimCode?: string;       
  idempotencyKey?: string; 
}

export interface BuildDeployPayload {
  recipients: Array<{
    email: string;
    amount: string;
    feeAmount: string;
    claimableAfter?: string;
    dueDate?: string;
    yieldRecipient?: string;  // ADDED: Required for deterministic Lock/Instant routing
  }>;
}

/**
 * Standardized API response handler
 */
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = "An error occurred";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

export const EscrowService = {
  /**
   * Step 1: Request the raw deployment arguments for the Soroban smart contract
   */
  buildDeployTx: async (data: BuildDeployPayload) => {
    const token = localStorage.getItem("bingtellar_auth_token");
    const response = await fetch(`${API_BASE_URL}/escrows/build-deploy-tx`, {
      method: "POST",
      credentials: "include", // 🌟 THE FIX: Send HttpOnly Cookies automatically
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}) // Safely fallback if using tokens
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  /**
   * Step 2: Log the created escrow in the database
   */
  createEscrow: async (data: CreateEscrowPayload, idempotencyKey?: string) => {
    const token = localStorage.getItem("bingtellar_auth_token");
    
    // ENTERPRISE FIX: Native browser UUID generation if UI fails to provide one
    const finalIdempotencyKey = idempotencyKey || data.idempotencyKey || crypto.randomUUID();

    // 🌟 THE FIX: Guarantee Zod compliance by strictly casting creatorId to a String
    const formattedData = {
        ...data,
        creatorId: String(data.creatorId),
    };

    const response = await fetch(`${API_BASE_URL}/escrows`, {
      method: "POST",
      credentials: "include", // Send HttpOnly Cookies
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "x-idempotency-key": finalIdempotencyKey // Always injected securely
      },
      body: JSON.stringify(formattedData), // Pass the formatted payload
    });
    return handleResponse(response);
  },

  /**
   * Step 2B: Log the created bulk escrow in the database
   */
  createBulkEscrows: async (data: any, idempotencyKey?: string) => {
    const token = localStorage.getItem("bingtellar_auth_token");
    
    // ENTERPRISE FIX: Native browser UUID generation
    const finalIdempotencyKey = idempotencyKey || crypto.randomUUID();
    
    const response = await fetch(`${API_BASE_URL}/escrows/bulk`, {
      method: "POST",
      credentials: "include",
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "x-idempotency-key": finalIdempotencyKey // Always injected securely
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },


  /**
   * Step 3: Submit a user-signed XDR to the backend for Gas-Abstracted on-chain execution
   */
  submitSponsoredTx: async (claimId: string, signedXdr: string) => {
    const token = localStorage.getItem("bingtellar_auth_token");
    const response = await fetch(`${API_BASE_URL}/escrows/submit-sponsored`, {
      method: "POST",
      credentials: "include", 
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ claimId, signedXdr }),
    });
    return handleResponse(response);
  },


  /**
   * Fetch a specific escrow claim by its Claim ID (used on the public receiver page)
   */
  getEscrowById: async (claimId: string) => {
    const response = await fetch(`${API_BASE_URL}/escrows/${claimId}`);
    return handleResponse(response);
  },

  /**
   * Update the status of an escrow (e.g., Active -> Cancelled)
   */
  updateStatus: async (claimId: string, newStatus: string, note?: string) => {
    const response = await fetch(`${API_BASE_URL}/escrows/${claimId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newStatus, note }),
    });
    return handleResponse(response);
  },

  /**
   * Step 3 (Receiver): Verify the OTP sent to the recipient's email
   */
  verifyOtp: async (claimId: string, otp: string) => {
    const response = await fetch(`${API_BASE_URL}/escrows/${claimId}/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    });
    return handleResponse(response);
  },

  /**
   * Step 4 (Receiver): Generate the secure, single-use claim link
   */
  generateClaimLink: async (claimId: string) => {
    const response = await fetch(`${API_BASE_URL}/escrows/${claimId}/generate-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return handleResponse(response);
  },


  /**
   * Step 5 (Receiver): Process the final claim and execute the blockchain transfer / fiat payout
   */
  processClaim: async (claimId: string, payload: {
    encrypted_token: string;
    recipient_wallet?: string;
    paymentMethod?: string;
    fiatAmount?: number | string;
    fiatCurrency?: string;
    exchangeRate?: number | string;
    railFee?: number | string;
    recipientDetails?: any;
  }) => {
    const response = await fetch(`${API_BASE_URL}/escrows/${claimId}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // Send the full dynamic payload to the backend
    });
    return handleResponse(response);
  },
  
  /**
   * Fetch global metrics for the admin dashboard
   */
  getAdminMetrics: async () => {
    const response = await fetch(`${API_BASE_URL}/admin/metrics`);
    return handleResponse(response);
  }
};

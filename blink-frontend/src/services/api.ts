
// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const getSubAccounts = async (userId: string) => {
  const response = await fetch(`${API_BASE}/accounts/${userId}/sub-accounts`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include" // Required to pass the secure HttpOnly session cookie
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch sub-accounts");
  }
  
  return response.json();
};


export const createSubAccount = async (parentId: string, name: string) => {
  const response = await fetch(`${API_BASE}/accounts/sub-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", 
    body: JSON.stringify({ parentId, name }),
  });
  
  if (!response.ok) {
    // Grab the exact error JSON sent by your Express backend
    const errorData = await response.json().catch(() => ({}));
    
    // If it's a Zod validation error
    if (errorData.violations && errorData.violations.length > 0) {
      throw new Error(errorData.violations[0].message);
    }
    
    // Otherwise, throw the standard error message from the backend
    throw new Error(errorData.error || "Network error occurred while creating ledger");
  }
  
  return response.json();
};
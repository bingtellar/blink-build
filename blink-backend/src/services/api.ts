// sandbox-1/src/services/api.ts
const API_BASE = "http://localhost:3001/api";

// 🌟 THE FIX: Utility to grab the token and build secure headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("bingtellar_auth_token");
  return {
    "Content-Type": "application/json",
    "Authorization": token ? `Bearer ${token}` : ""
  };
};

export const getSubAccounts = async (userId: string) => {
  const response = await fetch(`${API_BASE}/accounts/${userId}/sub-accounts`, {
    headers: getAuthHeaders() // 🛡️ Inject JWT
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
    headers: getAuthHeaders(), // 🛡️ Inject JWT
    body: JSON.stringify({ parentId, name }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.violations && errorData.violations.length > 0) {
      throw new Error(errorData.violations[0].message);
    }
    throw new Error(errorData.error || "Network error occurred while creating ledger");
  }
  
  return response.json();
};
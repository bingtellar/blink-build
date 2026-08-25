// src/lib/api.ts
import axios from 'axios';

// 🌐 ENVIRONMENT-AWARE API ROUTING
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// =================================================================
// 👤 PIPELINE 1: STANDARD USER API
// =================================================================
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // 🌟 Preserved: Automatically attaches secure HttpOnly cookies
});

// Optional: Fallback for explicit JWTs if cookies fail or aren't used on a specific route
api.interceptors.request.use((config) => {
  const userToken = localStorage.getItem('bingtellar_auth_token');
  if (userToken) {
    config.headers.Authorization = `Bearer ${userToken}`;
  }
  return config;
}, (error) => Promise.reject(error));

// User Response Interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("[Security] User session expired. Enforcing logout.");
      // 1. Wipe the local storage marker so App.tsx knows the user is logged out
      localStorage.removeItem("bingtellar_user"); 
      localStorage.removeItem("bingtellar_auth_token");
       // 2. Hard redirect to the login page
      window.location.href = '/login'; // Routes back to user gateway
    }
    return Promise.reject(error);
  }
);


// =================================================================
// 🛡️ PIPELINE 2: ADMIN COMMAND CENTER API
// =================================================================
export const adminApi = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // 🌟 Preserved: Ensures admin session cookies pass through securely
});

// Admin Request Interceptor
adminApi.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('bingtellar_admin_token');
  if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  }
  return config;
}, (error) => Promise.reject(error));

// 🚨 ADMIN PIPELINE: Instant Ejection on Token Expiry or Revocation
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.warn("🚨 [Security] Admin clearance revoked or expired. Purging session.");
      localStorage.removeItem('bingtellar_admin_session');
      localStorage.removeItem('bingtellar_admin_token');
      // 🌟 CRITICAL DIFFERENCE: Instantly boot the user back to the dark mode admin gateway, NOT the user login
      window.location.href = '/admin'; 
    }
    return Promise.reject(error);
  }
);
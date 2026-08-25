import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { LoginFlow } from "./features/auth/LoginFlow";
import { SignupFlow } from "./features/auth/SignupFlow";
import { ForgotPasswordFlow } from "./features/auth/ForgotPasswordFlow";
import { MainDashboard } from "./features/dashboard/MainDashboard";
import { ClaimPage } from "./features/claim-portal/ClaimPage";

import { AdminDashboard } from "./features/admin/AdminDashboard";
import { AdminSetup } from "./features/admin/AdminSetup";
import { AdminGuard } from "./components/AdminGuard";
import { ApiSandbox } from "./features/ApiSandbox";
import { PublicPaymentPage } from "./features/dashboard/PublicPaymentPage";
import { useStore } from "./store/useStore"; 
import { Toaster } from 'react-hot-toast';
import { useTransactionStream } from "./hooks/useTransactionStream";


const CleanClaimRoute = () => {
  const { claimId } = useParams();
  return claimId ? <ClaimPage claimId={claimId} /> : <Navigate to="/" replace />;
};

const RootRoute = () => {
  const [searchParams] = useSearchParams();
  const claimId = searchParams.get("claim");
  const payReqId = searchParams.get("pay_req");

  if (claimId) return <ClaimPage claimId={claimId} />;
  if (payReqId) return <Navigate to={`/pay?pay_req=${payReqId}`} replace />;
  
  return <Navigate to="/login" replace />;
};

const AppContent = () => {
  // 🌟 INITIALIZE STATE BY CHECKING LOCAL STORAGE
  // If "bingtellar_user" exists, they are already logged in
  // Since we use HttpOnly cookies, we ONLY check for the user profile object locally.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const hasUser = localStorage.getItem("bingtellar_user") !== null;
    return hasUser;
  });
  
  const navigate = useNavigate();
  
  // PULL IN YOUR GLOBAL SETTER
  const setActiveAccount = useStore((state) => state.setActiveAccount);
  const disconnect = useStore((state) => state.disconnect); // Pull in the secure disconnect protocol

  // Mount the unified global stream!
  // Because AppContent wraps all user routes, this stream NEVER unmounts 
  // during standard page navigation.
  useTransactionStream();

  const handleLogout = useCallback(async () => {
    console.log("🔒 Logging out...");
    
    // 🌟 THE FIX: Fire the fortified Zustand disconnect sequence.
    // This securely wipes local storage, pings the backend auth/logout route, 
    // and guarantees Radar Copilot state is closed so it doesn't bleed into the login screen.
    await disconnect(); 
    
    setIsAuthenticated(false);
    navigate("/login", { replace: true });
  }, [navigate, disconnect]);

  // ON MOUNT: Hydrate the global store if the user is returning
  useEffect(() => {
    const savedUser = localStorage.getItem("bingtellar_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        // 🌟 CACHE RESTORED: We pass the full object, including the balance,
        // to prevent the $0.00 flash on initial load. The new Zustand store 
        // handles the locking and validation.
        setActiveAccount(parsedUser);
      } catch (e) {
        console.error("Failed to parse saved user", e);
        handleLogout(); 
      }
    }
  }, [setActiveAccount, handleLogout]);

  useEffect(() => {
    console.log("Current Auth State:", isAuthenticated ? "Logged In" : "Logged Out");
  }, [isAuthenticated]);

  // 🌟 UPDATED: Now receives the User Data from LoginFlow/SignupFlow
  const handleComplete = (userData: any) => {
    console.log("🚀 Authenticated! Updating global state and switching to Dashboard...");
    
    // Save to local storage
    localStorage.setItem("bingtellar_user", JSON.stringify(userData));
    
    // Save to global Zustand store
    setActiveAccount(userData);
    
    // Update local routing state
    setIsAuthenticated(true);
    navigate("/dashboard", { replace: true }); 
  };

  // Silently sync the true backend balance into global state on refresh
  useEffect(() => {
    const syncRealBalance = async () => {
      const token = localStorage.getItem("bingtellar_auth_token");
      if (isAuthenticated && token) {
        try {
          const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
          // 🌟 CACHE BUSTER: Force true database balance on every hard refresh
          const res = await fetch(`${API_BASE}/users/me?_t=${Date.now()}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setActiveAccount(data.user);
              localStorage.setItem("bingtellar_user", JSON.stringify(data.user));
            }
          }
        } catch (e) {
          console.error("Background balance sync failed", e);
        }
      }
    };
    
    syncRealBalance();
  }, [isAuthenticated, setActiveAccount]);

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <Routes>
        <Route path="/claim/:claimId" element={<CleanClaimRoute />} />
        <Route path="/claim" element={<Navigate to="/" replace />} />
        <Route path="/pay" element={<PublicPaymentPage />} />

        {/* --- ROUTING --- */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> :
            <LoginFlow
              onSignupClick={() => navigate("/signup")}
              onForgotClick={() => navigate("/forgot-password")}
              onComplete={handleComplete} 
            />
          } 
        />

        <Route 
          path="/signup" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> :
            <SignupFlow
              onLoginClick={() => navigate("/login")}
              onComplete={handleComplete} 
            />
          } 
        />

        <Route 
          path="/forgot-password" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> :
            <ForgotPasswordFlow onBackToLogin={() => navigate("/login")} />
          } 
        />

        <Route 
          path="/dashboard/*" 
          element={
            isAuthenticated ? (
              <MainDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />

        <Route path="/sandbox" element={<ApiSandbox />} />
       
        <Route path="/" element={<RootRoute />} />
      </Routes>
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      {/* 🌟 THE SLEEK ENTERPRISE NOTIFICATION ENGINE */}
      {/* Mounted at the absolute root so it catches global WebSocket events and persists across page navigations */}
      <Toaster 
        position="top-right" 
        reverseOrder={false} 
        toastOptions={{
          // We let our custom NotificationToast handle the UI!
          duration: 5000,
        }} 
      />
      
      <Routes>
        {/* ================================================================= */}
        {/* 🛡️ ENTERPRISE ISOLATION: ADMIN COMMAND CENTER                     */}
        {/* These routes live OUTSIDE AppContent. User state never mounts here.*/}
        {/* ================================================================= */}
        
        {/* Unprotected Magic Link Setup */}
        <Route path="/admin/setup" element={<AdminSetup />} />
        
        {/* Protected Command Center (Standalone /admin/kyc backdoor is closed) */}
        <Route 
          path="/admin/*" 
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          } 
        />

        {/* ================================================================= */}
        {/* 👤 STANDARD USER APPLICATION                                      */}
        {/* Any route not explicitly matching /admin falls through to here.   */}
        {/* ================================================================= */}
        <Route path="/*" element={<AppContent />} />
        
      </Routes>
    </BrowserRouter>
  );
}
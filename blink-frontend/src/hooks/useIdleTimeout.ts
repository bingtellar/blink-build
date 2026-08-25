import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore'; 

export const useIdleTimeout = (timeoutMinutes: number = 45) => {
  const navigate = useNavigate();
  const logoutUser = useStore((state: any) => state.logout || state.clearStore); 
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const enforceLogout = useCallback(async () => {
    console.warn(`[Security] Session idle for ${timeoutMinutes} minutes. Enforcing secure logout.`);
    
    // 🌟 THE UNIFIED SECURITY FIX: 
    // We MUST tell the backend to destroy the HttpOnly cookie, otherwise the session remains valid!
    try {
        await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include' // Ensures the browser sends the cookie to be destroyed
        });
    } catch (e) {
        console.error("Failed to reach logout endpoint, enforcing local wipe.");
    }
    
    // 1. Destroy all potential local storage caching
    localStorage.removeItem("bingtellar_auth_token");
    localStorage.removeItem("token");
    localStorage.removeItem("jwt");
    localStorage.removeItem("bingtellar_user"); 
    
    // 2. Wipe the Zustand global state in memory
    if (logoutUser) {
        logoutUser();
    }

    // 3. Eject the user back to the login screen
    navigate('/login', { replace: true });
  }, [navigate, logoutUser, timeoutMinutes]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(enforceLogout, timeoutMinutes * 60 * 1000);
  }, [enforceLogout, timeoutMinutes]);

  useEffect(() => {
    const activityEvents = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer(); 

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);
};
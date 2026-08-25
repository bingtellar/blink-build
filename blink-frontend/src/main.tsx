// 🟢 1. Inject Web3 Polyfills First
import { Buffer } from "buffer";
window.Buffer = Buffer;

// 🟢 2. Fix the "global is not defined" error for the Stellar SDK
if (typeof window.global === "undefined") {
  window.global = window;
}

// 3. Load the rest of the React App
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { GoogleOAuthProvider } from '@react-oauth/google';

// 🌟 FAIL-FAST VALIDATION: Ensure the ID exists at boot time
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  console.error(
    "🚨 CRITICAL BOOT ERROR: VITE_GOOGLE_CLIENT_ID is missing!\n" +
    "1. Check your frontend .env file.\n" +
    "2. Ensure the variable starts with VITE_\n" +
    "3. Restart your Vite server (Ctrl+C -> npm run dev)."
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* If it is missing, we pass an empty string to prevent a hard React crash, 
        but the console.error above will tell us exactly why Google fails. */}
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || ""}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
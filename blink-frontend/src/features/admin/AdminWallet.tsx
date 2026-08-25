import { useState } from 'react';
import { setAllowed, requestAccess } from '@stellar/freighter-api';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function AdminWallet() {
  const [pubKey, setPubKey] = useState<any>("");
  const [error, setError] = useState("");
  const [isDisconnected, setIsDisconnected] = useState(false);

  const connectWallet = async () => {
    setError("");
    setIsDisconnected(false);
    try {
      await setAllowed(); // Asks Freighter for permission
      const key = await requestAccess(); // Grabs your Treasury G-Address
      setPubKey(key);
    } catch (err) {
      setError("Connection failed. Make sure Freighter is installed and unlocked!");
    }
  };

  const disconnectWallet = () => {
    // 🌟 ABSOLUTE PURGE: We wipe the key completely from React's ephemeral memory.
    // It is never saved to localStorage or cookies.
    setPubKey("");
    setError("");
    setIsDisconnected(true);
  };

  // Safely extract the string regardless of what Freighter returns
  const addressString = typeof pubKey === 'string' 
    ? pubKey 
    : pubKey?.address || pubKey?.publicKey || String(pubKey);

  return (
    <div style={{ padding: "24px", border: "1px solid #EAEAEA", borderRadius: "12px", maxWidth: "400px", margin: "20px auto", textAlign: "center", backgroundColor: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
      <h2 style={{ fontSize: "18px", marginBottom: "20px", marginTop: "0", color: "#111827", fontWeight: "600" }}>🔐 Admin Treasury</h2>
      
      {pubKey ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div>
            <p style={{ fontSize: "13px", color: "#059669", fontWeight: "600", margin: "0 0 8px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <CheckCircle2 size={16} /> Securely Connected
            </p>
            <code style={{ background: "#F9FAFB", padding: "10px 16px", borderRadius: "8px", fontSize: "14px", color: "#111827", fontWeight: "600", border: "1px solid #E5E7EB", display: "inline-block", wordBreak: "break-all" }}>
              {addressString.slice(0, 6)}...{addressString.slice(-4)}
            </code>
          </div>
          
          <button 
            onClick={disconnectWallet}
            style={{ padding: "10px 20px", cursor: "pointer", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", borderRadius: "8px", fontSize: "13px", fontWeight: "600", transition: "all 0.2s", width: "100%" }}
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          
          {isDisconnected && (
             <div style={{ background: "#FFFBEB", border: "1px solid #FEF3C7", padding: "12px", borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "10px", textAlign: "left" }}>
               <ShieldAlert size={18} color="#D97706" style={{ marginTop: "2px", flexShrink: 0 }} />
               <p style={{ margin: 0, fontSize: "12px", color: "#92400E", lineHeight: "1.5" }}>
                 <strong>Session Cleared.</strong> Bingtellar has wiped your credentials. <br/><br/>
                 <em>Note: If Freighter is still unlocked in your browser, reconnecting will bypass the password prompt. Lock Freighter manually to enforce a hard authentication reset.</em>
               </p>
             </div>
          )}

          <button 
            onClick={connectWallet}
            style={{ padding: "12px 24px", cursor: "pointer", background: "#111827", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", transition: "all 0.2s", width: "100%" }}
          >
            Connect Freighter
          </button>
        </div>
      )}

      {error && <p style={{ color: "#EF4444", marginTop: "16px", fontSize: "13px", fontWeight: "500" }}>{error}</p>}
    </div>
  );
}
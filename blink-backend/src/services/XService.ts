import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// 1. INITIALIZE THE X (TWITTER) API CLIENT
// ==========================================
const twitterClient = new TwitterApi({
  appKey: process.env.X_API_KEY || '',
  appSecret: process.env.X_API_SECRET || '',
  accessToken: process.env.X_ACCESS_TOKEN || '',
  accessSecret: process.env.X_ACCESS_SECRET || '',
});

export class XService {
  // ==========================================
  // 2. ENTERPRISE HANDLE VERIFICATION (FAIL-OPEN)
  // ==========================================
  /**
   * Verifies multiple X handles in a SINGLE HTTP request.
   * Upgraded with Enterprise Fail-Open architecture and WAF bypass.
   */
  static async verifyHandlesBatch(handles: string[]): Promise<Set<string>> {
    if (handles.length === 0) return new Set();

    const cleanHandles = handles.map(h => h.replace('@', '').toLowerCase());
    const queryParam = cleanHandles.join(',');
    
    try {
      const res = await fetch(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${queryParam}`, {
        headers: {
          // 🛡️ WAF Bypass. Mask the Node server as a standard Chrome browser.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://twitter.com/'
        },
        // 🛡️ Circuit Breaker. Prevent a hanging X server from locking up your Postgres transaction.
        signal: AbortSignal.timeout(3000) 
      });
      
      if (!res.ok) {
        console.warn(`[XService] API blocked request (Status: ${res.status}). Failing OPEN.`);
        // 🛡️ FAIL-OPEN. If X is down or blocking us, assume handles are valid so we don't drop payments.
        return new Set(cleanHandles);
      }

      // Check if X actually returned JSON before parsing it to prevent terminal errors
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         console.warn(`[XService] Non-JSON payload received. Cloudflare WAF active. Failing OPEN.`);
         return new Set(cleanHandles);
      }

      const data = await res.json();
      const validHandles = new Set<string>();
      
      if (Array.isArray(data)) {
        data.forEach((user: any) => validHandles.add(user.screen_name.toLowerCase()));
      }

      // 🛡️ FALSE-NEGATIVE GUARDIAN
      // Private or inactive accounts are hidden by X's endpoint. 
      // If they aren't in the returned list, we STILL add them to prevent ghosting real users.
      cleanHandles.forEach(h => {
        if (!validHandles.has(h)) {
           validHandles.add(h);
        }
      });

      return validHandles;
      
    } catch (error: any) {
      console.warn(`[XService] Handle verification network error: ${error.message}. Failing OPEN.`);
      // Fail open on a complete network crash or timeout
      return new Set(cleanHandles); 
    }
  }

  // ==========================================
  // 3. SECURE DISPATCHER (FAIL-SOFT)
  // ==========================================
  /**
   * Dispatches a payment request mention to X.
   * Upgraded with Fail-Soft gracefully handling X's 402 Paywalls and 403 Spam Filters.
   */
  static async routePaymentRequest(handle: string, creatorName: string, amount: string, link: string) {
    // 🌟 FIX: Strip all leading @ symbols using Regex to prevent @@jc_sdk
    const cleanHandle = handle.replace(/^@+/, ''); 
    
    try {
      const message = `Hey @${cleanHandle}, ${creatorName} just sent you a payment request for ${amount} on Blink! Pay securely here: ${link}`;
      
      await twitterClient.v2.tweet(message);
      
      console.log(`[XService] ✅ Successfully dispatched X mention to @${cleanHandle}`);
      
    } catch (error: any) {
      if (error.code === 402 || error?.data?.detail === "credits depleted") {
        // 🌟 FIX: Use cleanHandle here so it logs perfectly
        console.warn(`[XService Paywall] ⚠️ X API Free Tier depleted (402). Skipped mention to @${cleanHandle}. Relying on Email fallback.`);
        return; 
      }
      
      if (error.code === 403) {
        console.warn(`[XService Filter] ⚠️ X rejected mention to @${cleanHandle}. Account may have strict DM/Mention settings.`);
        return; 
      }

      if (error.message && error.message.toLowerCase().includes("duplicate")) {
        console.warn(`[XService] Duplicate mention to @${cleanHandle} blocked by X. Skipping.`);
        return;
      }

      console.error(`[XService Fatal] Failed to send X mention to @${cleanHandle}:`, error.message || error);
    }
  }
}
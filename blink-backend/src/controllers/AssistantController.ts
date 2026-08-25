// Backend Brain - A treasury analytics and the Copilot (V1.1.0-PROD-SUPERPOWERED)

// src/controllers/AssistantController.ts
import { Request, Response } from 'express';
import { db } from '../db';
import { transactions, escrows, paymentRequests, subAccounts, users } from '../schema';
import { eq, and, sql, or, inArray, gte, lte, desc } from 'drizzle-orm';
import { DefindexSDK, SupportedNetworks } from '@defindex/sdk';
import Groq, { toFile } from "groq-sdk";

// 🌟 INITIALIZE GROQ
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });

// =========================================================================
// 🌟 IN-MEMORY DEFINDEX APY CACHE 
// Prevents API throttling, guarantees <10ms responses, and prevents memory leaks
// =========================================================================
let cachedApy: { value: number; timestamp: number; source: string } = {
  value: 0.1312,
  timestamp: 0,
  source: 'DeFindex Benchmark'
};

const getLiveDefindexApy = async (): Promise<{ apy: number; source: string }> => {
  const now = Date.now();
  // Return cached APY if fresh (under 60 seconds)
  if (now - cachedApy.timestamp < 60000 && cachedApy.timestamp !== 0) {
    return { apy: cachedApy.value, source: cachedApy.source };
  }

  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const defindexSdk = new DefindexSDK({
      apiKey: process.env.DEFINDEX_API_KEY || 'demo_key',
      baseUrl: process.env.DEFINDEX_API_URL || 'https://api.defindex.io'
    });

    const strategyAddress = process.env.DEFINDEX_STRATEGY_ADDRESS;
    if (!strategyAddress) throw new Error("Missing Strategy Address");

    // 🛡️ CRITICAL FIX: Memory-safe timeout to prevent UnhandledPromiseRejection crashes
    const apyPromise = defindexSdk.getVaultAPY(strategyAddress, SupportedNetworks.TESTNET);
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("DeFindex Timeout")), 1500);
    });

    const apyData: any = await Promise.race([apyPromise, timeoutPromise]);
    
    // Disarm the time bomb if the API wins the race
    if (timeoutId) clearTimeout(timeoutId); 

    const realApy = apyData?.apyPercent || apyData?.apy;

    if (realApy && Number(realApy) > 0) {
      cachedApy = {
        value: parseFloat(realApy.toString()) / 100,
        timestamp: now,
        source: 'Live DeFindex / Blend Oracle'
      };
      return { apy: cachedApy.value, source: cachedApy.source };
    }
  } catch (err) {
    // Clear the timeout even if the API throws a real error
    if (timeoutId) clearTimeout(timeoutId); 
    // Fails silently; will rely on the 13.12% fallback below
  }

  return { apy: 0.1312, source: 'DeFindex Benchmark' };
};

// =========================================================================
// 🌟 IN-MEMORY LIVE FX ORACLE (BINGTELLAR B2B SYNCED)
// Ensures 100% rate parity between Radar Copilot and FiatController modals.
// =========================================================================
interface FxCorridor {
  currency: string;
  name: string;
  country: string;
  symbol: string;
  onrampRate: number;  // Fiat -> USDC
  offrampRate: number; // USDC -> Fiat
  spreadPercent: number;
  railFee: number;
  rails: string;
  sla: string;
}

let cachedFxRates: {
  timestamp: number;
  rates: Record<string, FxCorridor>;
} = {
  timestamp: 0,
  rates: {
    NGN: { currency: "NGN", name: "Nigerian Naira", country: "Nigeria", symbol: "₦", onrampRate: 1410.50, offrampRate: 1380.00, spreadPercent: 0.0035, railFee: 50.00, rails: "NIBSS Instant / Bank Transfer", sla: "< 3 minutes" },
    KES: { currency: "KES", name: "Kenyan Shilling", country: "Kenya", symbol: "KSh", onrampRate: 135.20, offrampRate: 130.00, spreadPercent: 0.0040, railFee: 50.00, rails: "M-Pesa / Pesalink / Bank", sla: "< 2 minutes" },
    GHS: { currency: "GHS", name: "Ghanaian Cedi", country: "Ghana", symbol: "GH₵", onrampRate: 15.65, offrampRate: 15.10, spreadPercent: 0.0045, railFee: 1.00, rails: "MTN MoMo / Bank", sla: "< 5 minutes" },
    ZAR: { currency: "ZAR", name: "South African Rand", country: "South Africa", symbol: "R", onrampRate: 18.80, offrampRate: 18.20, spreadPercent: 0.0040, railFee: 0.00, rails: "BankservAfrica RTC", sla: "< 10 minutes" },
    EUR: { currency: "EUR", name: "Euro", country: "Eurozone", symbol: "€", onrampRate: 0.945, offrampRate: 0.925, spreadPercent: 0.0025, railFee: 0.00, rails: "SEPA Instant (35 Nations)", sla: "< 30 seconds" },
    GBP: { currency: "GBP", name: "British Pound", country: "United Kingdom", symbol: "£", onrampRate: 0.805, offrampRate: 0.785, spreadPercent: 0.0025, railFee: 0.00, rails: "FPS Faster Payments", sla: "< 30 seconds" }
  }
};

const getLiveFxOracle = async (): Promise<Record<string, FxCorridor>> => {
  const now = Date.now();
  if (now - cachedFxRates.timestamp < 60000 && cachedFxRates.timestamp !== 0) {
    return cachedFxRates.rates;
  }

  const bingtellarUrl = process.env.BINGTELLAR_API_URL || "https://api.bingtellar.com";
  const bingtellarKey = process.env.BINGTELLAR_API_KEY;

  if (bingtellarKey) {
    for (const curr of ['NGN', 'KES', 'GHS', 'ZAR', 'EUR', 'GBP']) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const [onRes, offRes] = await Promise.all([
          fetch(`${bingtellarUrl}/api/v1/b2b/rates?asset=USDC&fiatCurrency=${curr}&type=onramp`, {
            headers: { "x-api-key": bingtellarKey },
            signal: controller.signal
          }).catch(() => null),
          fetch(`${bingtellarUrl}/api/v1/b2b/rates?asset=USDC&fiatCurrency=${curr}&type=offramp`, {
            headers: { "x-api-key": bingtellarKey },
            signal: controller.signal
          }).catch(() => null)
        ]);

        clearTimeout(timeoutId);

        if (onRes && onRes.ok) {
          const onData = await onRes.json();
          const rate = onData.rate || onData.data?.rate || onData.data?.indicativeRate;
          if (rate && cachedFxRates.rates[curr]) cachedFxRates.rates[curr].onrampRate = parseFloat(rate);
        }

        if (offRes && offRes.ok) {
          const offData = await offRes.json();
          const rate = offData.rate || offData.data?.rate || offData.data?.indicativeRate;
          if (rate && cachedFxRates.rates[curr]) cachedFxRates.rates[curr].offrampRate = parseFloat(rate);
        }
      } catch (err) {
        // Continue using established cache on network drop
      }
    }
  }

  cachedFxRates.timestamp = now;
  return cachedFxRates.rates;
};

export const AssistantController = {

  // TRANSCRIPTION METHOD
  transcribeAudio: async (req: Request, res: Response) => {
    try {
      const audioFile = req.file; 
      
      // 1. Missing File Guard
      if (!audioFile) {
        return res.status(400).json({ error: "No audio provided" });
      }

      // 2. Empty/Mis-Click Guard (Prevents Groq 400 errors for empty clicks)
      if (audioFile.size < 500) {
        return res.json({ transcript: "" });
      }

      // 3. Dynamic MIME type parsing (Protects against WebM vs Ogg vs MP4 mismatches)
      let extension = 'webm';
      if (audioFile.mimetype.includes('mp4')) extension = 'mp4';
      else if (audioFile.mimetype.includes('ogg')) extension = 'ogg';
      else if (audioFile.mimetype.includes('wav')) extension = 'wav';

      const virtualFilename = `audio.${extension}`;

      // 4. Stream virtually from RAM directly to Groq with Lexical Priming
      const transcription = await groq.audio.transcriptions.create({
        file: await toFile(audioFile.buffer, virtualFilename),
        model: "whisper-large-v3",
        response_format: "json",
        language: "en",
        temperature: 0, // 🌟 Enforces strict, deterministic accuracy (kills hallucinations)
        prompt: "Blink, Bingtellar, Joshua Tebepina, Stellar, Soroban, USDC, USDT, DeFindex, Blend Capital, escrow, treasury, yield, payments, cashflow, off-ramp, transfer, disbursement, payroll, balance.", // 🌟 Context priming
      });

      return res.json({ transcript: transcription.text });
      
    } catch (error: any) {
      console.error("[Enterprise STT Error]:", error?.error || error);
      return res.status(500).json({ error: "Failed to transcribe audio" });
    }
  },

  askRadar: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const { query, tzOffset, currentTab = "dashboard", isMasterWallet } = req.body; 

      // 🌟 SERVER STABILITY FIX: Sanitize the timezone offset against NaN payloads
      const safeTzOffset = (typeof tzOffset === 'number' && !isNaN(tzOffset)) ? tzOffset : Number(tzOffset) || 0;

      if (!query || typeof query !== 'string' || query.length > 500) {
        return res.status(400).json({ error: "Query is invalid or too long." });
      }

      // =========================================================================
      // 🛡️ THE IRON FENCE: Enterprise Multi-Tenant Drizzle Filters
      // Forces every single NLP Layer to strictly obey the UI Ledger boundaries
      // =========================================================================
      const rawSubId = req.body.subAccountId;
      const activeSubId = (rawSubId !== undefined && rawSubId !== null && rawSubId !== "null" && rawSubId !== "undefined" && rawSubId !== "") ? String(rawSubId) : null;

      const txLedgerFilter = activeSubId
          ? eq(transactions.subAccountId, activeSubId)
          : isMasterWallet
              ? and(eq(transactions.userId, userId), sql`(${transactions.subAccountId} IS NULL OR CAST(${transactions.subAccountId} AS TEXT) = 'null')`)
              : or(eq(transactions.userId, userId), eq(transactions.subAccountId, userId));

      const escrowLedgerFilter = activeSubId
          ? eq(escrows.subAccountId, activeSubId)
          : isMasterWallet
              ? and(eq(escrows.creatorId, userId), sql`(${escrows.subAccountId} IS NULL OR CAST(${escrows.subAccountId} AS TEXT) = 'null')`)
              : or(eq(escrows.creatorId, userId), eq(escrows.subAccountId, userId));

      const prLedgerFilter = activeSubId
          ? eq(paymentRequests.subAccountId, activeSubId)
          : isMasterWallet
              ? and(eq(paymentRequests.creatorId, userId), sql`(${paymentRequests.subAccountId} IS NULL OR CAST(${paymentRequests.subAccountId} AS TEXT) = 'null')`)
              : or(eq(paymentRequests.creatorId, userId), eq(paymentRequests.subAccountId, userId));

      // 🌟 SUPERPOWER 1: INTENT UNWRAPPER & PREAMBLE STRIPPER
      // Safely store the raw input for the LLM, but strip greetings for the action router
      const rawInput = query.replace(/[<>\x00-\x1F\x7F]/g, '').trim();
      
      const strippedInput = rawInput
        .replace(/^(?:hi|hello|hey|greetings|good morning|good afternoon|good evening|sup|yo|radar|copilot)\b[,\s:-]*/i, '')
        .replace(/^(?:please|can you|could you|help me|kindly|i want to|i need to)\b[,\s:-]*/i, '')
        .trim();

      // If they JUST said "Hi", we keep it. If they said "Hi, send $5", we only parse "send $5".
      const workingQuery = strippedInput.length > 0 ? strippedInput : rawInput;
      const q = workingQuery.toLowerCase();
      const rawLower = rawInput.toLowerCase();

      // 🌟 DYNAMIC CONTEXT MAPPER: Returns smart suggestions based on the user's active page
      const getContextSuggestions = (tab: string) => {
        const t = String(tab).toLowerCase();
        if (t.includes('setting') || t.includes('profile')) return ["How do I generate an API key?", "Setup Webhooks", "Upload KYC documents"];
        if (t.includes('payment' )) return ["Disburse Bulk Payroll", "Create a Payment Request", "What are the fees?"];
        if (t.includes('account') || t.includes('balance')) return ["Create a Digital Ledger", "Withdraw to Bank", "Fund my account"];
        if (t.includes('transaction')) return ["What's my net cashflow?", "How much did I spend this month?", "Find transaction by ID"];
        if (t.includes('recipient')) return ["Send a payment", "How do I add a new bank?"];
        return ["What's my net cashflow?", "Find transaction by ID", "Help me Send a payment"];
      };

      // =========================================================================
      // 🧠 LAYER 00: PURE GREETINGS & SMALL TALK (The Absolute First Interceptor)
      // Catches casual chatter before the LLM Express Lane tries to over-analyze it.
      // =========================================================================
      
      if (rawLower.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|yo|hi radar|hello radar|hey copilot|Hi copilot| Hi Co-Pilot|Hey Co-pilot| Hello Co-Pilot|Hello copilot)\b[!\s.]*$/i)) {
        return res.json({
          answer: "Hello buddy! I'm here and ready to help. I can assist you with accounting math, track specific transaction IDs, guide you through platform features, or initiate transfers.",
          suggestions: getContextSuggestions(currentTab)
        });
      }

      // 🌟 THE FIX: Permissive regex absorbs conversational prefixes ("Hi, Radar.") and suffixes (", Radar")
      if (rawLower.match(/^(?:hi|hello|hey|yo|greetings)?[\s,.-]*(?:radar|copilot)?[\s,.-]*(what's up|whats up|sup|wassup|wazzup)[\s,.-]*(?:radar|copilot|brita|buddy|man|there|friend)?[\s?!.]*$/i)) {
        return res.json({
          answer: "Not much, just humming along and ready to help. It's great to connect with you. How can I assist you today or would you like to chat about something on your mind?",
          suggestions: getContextSuggestions(currentTab)
        });
      }

      if (rawLower.match(/^(how are you|how are you doing|how's it going|how r u|how you doing)\b[?\s.]*$/i)) {
        return res.json({
          answer: "I'm doing fantastic, thanks for asking! Ready to monitor your cashflow, execute payments, and maximize your treasury yield today. How can I assist you?",
          suggestions: ["What's my account balance?", "What's my net cashflow?", "Calculate yield on 50k USDC"]
        });
      }

      // 🌟 GLOBAL INTENT FLAGS (Prevents Layer Collisions)
      const isComplianceQuery = workingQuery.match(/(limit|limits|maximum|cap|kyc|kyb|tier|verification)/i);
      const isFeeQuery = workingQuery.match(/(fee|fees|cost|gas|charge|price|pricing)/i);
      const isFxQuery = !isComplianceQuery && !isFeeQuery && (
          q.match(/(?:exchange rate|exchange rates|fx rate|fx rates|fx quote|fx quotes|quote me|quote|currency conversion|what is the rate|what are the rates|how much is|convert|swap|exchange).*(?:usdc|usd|dollar|naira|ngn|kes|shilling|ghs|cedi|zar|rand|eur|euro|gbp|pound|corridor|corridors|rates|currencies|currency)/i) ||
          q.match(/(?:what's|whats|what is|what are|tell me|give me|show).*(?:rates|rate|quote|quotes|fx|pricing|corridors|currencies|currency)\b/i) ||
          q.match(/(?:how much(?: usdc| usd| dollars)? (?:will i get|do i get|for|is|to|do i need|will i receive)).*(?:\$|\d+|usdc|naira|ngn|kes|shilling|ghs|cedi|zar|rand|eur|gbp)/i) ||
          (q.match(/(?:buy|fund|deposit|top up|pay|send|withdraw|off-ramp|cash out|payout).*(?:\$|\d+|usdc|naira|ngn|kes|shilling|ghs|cedi|zar|rand|eur|gbp|south africa|kenya|ghana|nigeria)/i) && q.match(/(naira|ngn|kes|shilling|ghs|cedi|zar|rand|eur|euro|gbp|pound|south africa|kenya|ghana|nigeria)/i)) ||
          q.match(/(?:naira|ngn|kes|shillings|ghs|cedis|zar|rand|eur|euros|gbp|pounds)\s*(?:to|in)\s*(?:naira|ngn|kes|shillings|ghs|cedis|zar|rand|eur|euros|gbp|pounds)/i)
      );

      // =========================================================================
      // 🌟 SUPERPOWER 0: THE CONCEPTUAL EXPRESS LANE (LLM Bypasser)
      // Instantly routes high-level, educational, and strategic CFO questions to 
      // the LLM, bypassing all rigid database/regex tripwires below.
      // =========================================================================
      const isConceptualQuestion = q.match(/^(what is|what's|whats|what are|why|how does|explain|define|compare|benefits of|difference between|how can|in what ways)\b/i) &&
                                   !q.match(/\b(my|our|i|we|me|balance|spend|spent|send|sent|pay|history|ledger|statement|activity|limit|limits|export|download|csv|pdf|report|cancel|stop|reverse|runway|burn|survival|rate|rates|fx|quote|quotes|conversion|convert|exchange|naira|ngn|kes|shilling|shillings|ghs|cedi|cedis|zar|rand|euro|euros|eur|gbp|pound|pounds|fee|fees|cost|charge|currency|currencies|corridor|corridors)\b/i) &&
                                   !q.match(/(how much did|total)/i) &&
                                   !q.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}|(?:TRX|REF|TXN|BATCH|idem_|DP-|WD-)[A-Z0-9_-]+)\b/i);

      if (isConceptualQuestion) {
          try {
            const completion = await groq.chat.completions.create({
              model: "openai/gpt-oss-120b",
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `You are Radar, the elite, highly intelligent AI Treasury Copilot for Blink (a Bingtellar Co). Your primary users are CFOs, Heads of Treasury, and institutional financial operators.

CORE KNOWLEDGE BASE (NEVER HALLUCINATE OUTSIDE THESE FACTS):
- Blink Identity: Built by founding CEO Joshua Tebepina. Blink is a stablecoin-native treasury and payment infrastructure platform.
- The Problem (Dead Float): Traditional cross-border B2B payments trap capital in transit or pending payout windows for 3-5 days, earning 0%. Blink tokenizes this liquidity, ensuring funds move in seconds.
- The Solution (Yield-Bearing Escrows): While funds await settlement, Blink automatically routes the idle USDC/USDT float into non-custodial Soroban DeFi vaults (DeFindex/Blend). This allows treasuries to generate automated yield on capital that would otherwise sit dead.
- Tech Stack: Built on the Stellar blockchain. Uses Soroban (Stellar's native Rust/WASM smart contract platform) for secure, non-custodial programmable escrows.
- Security & Custody: Non-custodial. Platform admins cannot seize user principal. All executions require Maker-Checker cryptographic signatures (PIN/Passkeys).

GUIDELINES:
- Tone: Executive, highly analytical, consultative, and sharp. Do not use generic, fluffy chatbot language.
- Contextual Brilliance: When asked general financial questions (like "what's dead float", "what are the benefits of smart contracts", or "how to manage float"), provide a world-class financial answer, but ALWAYS connect it back to how Blink's specific on-chain Stellar infrastructure solves it better than legacy banking rails.
- Formatting: Keep answers concise (1-3 short paragraphs). Use Markdown bolding for key financial terms.

OUTPUT FORMAT:
You MUST return ONLY a strictly valid JSON object. The "answer" value MUST be a properly enclosed string.
{
  "answer": "Your beautifully formatted Markdown response goes here. Use \\n for line breaks.",
  "suggestions": ["Relevant follow-up question 1?", "Relevant follow-up question 2?"]
}`
                },
                {
                  role: "user",
                  content: rawInput 
                }
              ],
              temperature: 0.6,
              max_tokens: 450,
            });

            const rawReply = completion.choices[0]?.message?.content;
            if (rawReply && rawReply.trim().length > 0) {
              try {
                const parsedReply = JSON.parse(rawReply);
                return res.json({
                  answer: parsedReply.answer,
                  suggestions: (parsedReply.suggestions && parsedReply.suggestions.length > 0) ? parsedReply.suggestions : getContextSuggestions(currentTab)
                });
              } catch (e) {
                return res.json({ answer: rawReply.replace(/```json/g, '').replace(/```/g, '').trim(), suggestions: getContextSuggestions(currentTab) });
              }
            }
            
            // 🌟 THE FIX: If Groq returns empty, exit cleanly. Never fall through!
            return res.json({ answer: "I couldn't process that question properly. Could you rephrase?", suggestions: getContextSuggestions(currentTab) });
            
          } catch (llmErr) {
            console.warn("[Express Lane LLM Error]:", llmErr);
            // Warm, witty fallback that reassures the user without technical jargon
            return res.json({ 
              answer: "It looks like my treasury brain just stepped out for a quick coffee break! ☕ Give me a few seconds to catch my breath and try asking me that again. BRB fren!", 
              suggestions: getContextSuggestions(currentTab) 
            });
          }
      }

      // =========================================================================
      // 🧠 LAYER -1: AGENTIC ACTION ROUTING (Read -> Write)
      // Parses natural language instructions to initiate and prefill UI transactions
      // =========================================================================
      
      // 🌟 THE FIX 1: The Inquiry Guard (Prevents questions from triggering actions)
      // 🌟 THE FIX: The Omni-Guard (Prevents questions & math from triggering UI popups)
      // Added search verbs (find, list, get, search, which) to protect deep search queries
      const isInquiry = q.match(/^(how|what|when|why|where|did|have|can you show|show me|find|list|get|which|are there|do i have|search|if|will|calculate|project|simulate|estimate)/i);
      const isYieldQuery = q.match(/(?:yield|earn|interest|apy|return|project|simulate)/i);
      
      // If the user is asking a question, doing yield math, or querying FX, DO NOT open generic UI modals
      const shouldBlockAction = isInquiry || isYieldQuery || isFxQuery;

      // =========================================================================
      // 🌟 NEW FIX: STANDALONE RECIPIENT MEMORY CATCH
      // Catches conversational follow-ups like "joshua@gmail.com" or "Send to 0x123..."
      // =========================================================================
      const cleanRaw = workingQuery.trim();
      const isStandaloneEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanRaw);
      const isStandaloneWallet = /^(0x[a-fA-F0-9]{40}|G[A-Z0-9]{55}|T[1-9A-HJ-NP-Za-km-z]{33})$/.test(cleanRaw);
      const isStandalonePhone = /^\+?\d{8,15}$/.test(cleanRaw.replace(/[\s-]/g, ''));

      const followUpMatch = workingQuery.match(/^(?:use|to|it's|its|send to|pay)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|0x[a-fA-F0-9]{40}|G[A-Z0-9]{55}|\+?\d{8,15})\s*$/i);

      if ((isStandaloneEmail || isStandaloneWallet || isStandalonePhone || followUpMatch) && !shouldBlockAction) {
        const destination = isStandaloneEmail || isStandaloneWallet || isStandalonePhone 
          ? cleanRaw 
          : followUpMatch![1];

        return res.json({
          answer: `I've updated the recipient to **${destination}**. Opening the payment portal now.`,
          action: { type: "SEND", recipient: destination }
        });
      }
      // =========================================================================

      // 🌟 SUPERPOWER 2: ROBUST MULTI-PLURAL SEND COMMAND PARSER
      const sendMatch = workingQuery.match(/(?:send|pay|transfer|make a payment of|make payments of)\s+(?:(?:\$|usdc)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:usdc|dollars|bucks)?\s*)?(.*)/i);
      
      if (sendMatch && (sendMatch[1] || sendMatch[2]) && !shouldBlockAction) {
        const amount = sendMatch[1] ? sendMatch[1].replace(/,/g, '') : "";
        let recipientRaw = sendMatch[2] || "";
        
        let recipient = recipientRaw
          .replace(/\b(?:a|an|the|some)?\s*(?:payments?|transfers?|money|funds?|invoices?|bills?|dollars?|usdc|bucks?)\b/gi, '') 
          .replace(/^\s*to\s+/i, '')
          .replace(/[.?!\s]+$/, '') 
          .trim();

        if (recipient.length <= 2 && !recipient.includes('@')) recipient = "";
        if (recipient) recipient = recipient.split(/\s+(for|because)\s+/i)[0].trim();

        let normalizedRecipient = recipient.replace(/\s+(?:at|@)\s+/gi, '@').replace(/\s+(?:dot|\.)\s+/gi, '.').trim();

        const emailMatch = normalizedRecipient.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const phoneMatch = normalizedRecipient.match(/\+?\d{8,15}/);
        const handleMatch = normalizedRecipient.match(/@[a-zA-Z0-9_]+/);
        const walletMatch = normalizedRecipient.match(/(?:0x[a-fA-F0-9]{40}|G[A-Z0-9]{55}|T[1-9A-HJ-NP-Za-km-z]{33})/);

        if (emailMatch) recipient = emailMatch[0];
        else if (phoneMatch) recipient = phoneMatch[0];
        else if (handleMatch) recipient = handleMatch[0];
        else if (walletMatch) recipient = walletMatch[0];
        else recipient = normalizedRecipient;

        const finalRecipient = recipient.length > 0 ? recipient : undefined;
        let recipientDetails = "";

        // =========================================================================
        // 🌟 ENTERPRISE FIX 1: ADDRESS BOOK DISAMBIGUATION FOR SEND
        // Stops the frontend from hijacking Bank names when the user meant "SEND"
        // =========================================================================
        if (finalRecipient && !emailMatch && !walletMatch && !phoneMatch && !handleMatch) {
            const safeRecipient = finalRecipient.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
            try {
                // Scan the raw address book to catch saved recipients BEFORE a transaction occurs
                const addressBookResult: any = await db.execute(sql`SELECT * FROM recipients WHERE "userId" = ${userId} AND "name" ILIKE ${'%' + safeRecipient + '%'}`);
                const rows = addressBookResult.rows || (Array.isArray(addressBookResult) ? addressBookResult : []);

                if (rows.length > 0) {
                    let hasBank = false;
                    let hasCrypto = false;
                    let bankName = "Bank";

                    rows.forEach((r: any) => {
                        const t = String(r.type || '').toLowerCase();
                        if (t.includes('bank') || t.includes('mobile') || t.includes('momo') || t.includes('fiat')) {
                            hasBank = true;
                            if (r.bankName) bankName = r.bankName;
                        } else if (t.includes('email') || t.includes('wallet') || t.includes('crypto')) {
                            hasCrypto = true;
                            if (!recipientDetails && (r.details || r.email || r.walletAddress)) {
                                recipientDetails = r.details || r.email || r.walletAddress;
                            }
                        }
                    });

                    const explicitClarification = workingQuery.match(/(wallet|email|crypto|address)/i);

                    if (hasBank && hasCrypto && !explicitClarification) {
                        return res.json({
                            answer: `I found multiple recipient records for "**${finalRecipient}**" (both Bank and Digital Wallet). To ensure the funds go to the right place, please clarify: ask me to *"Withdraw to ${finalRecipient}'s bank"* or *"Send to ${finalRecipient}'s wallet"*.`,
                            suggestions: [`Withdraw $${amount || '5'} to ${finalRecipient}'s bank`, `Send $${amount || '5'} to ${finalRecipient}'s wallet`]
                        });
                    }

                    // Intent Violation: User said "Send" but Address Book proves this is a Bank recipient
                    if (hasBank && !hasCrypto && !explicitClarification) {
                        return res.json({
                            answer: `You asked to send a payment to "**${finalRecipient}**", but they are saved in your Address Book as a **${bankName}** recipient.\n\nBank transfers require an off-ramp. To proceed, please ask me to: *"Withdraw to ${finalRecipient}"* instead.`,
                            suggestions: [`Withdraw ${amount ? `$${amount} ` : ''}to ${finalRecipient}`]
                        });
                    }
                }
            } catch (e) {
                console.error("[SEND Disambiguation Error]", e);
            }
        }

        return res.json({
            answer: `I'm drafting a secure transfer${amount ? ` for **$${amount}**` : ''}${finalRecipient ? ` to **${finalRecipient}**${recipientDetails ? ` (${recipientDetails})` : ''}` : ''}. Please review and sign the transaction in the portal.`,
            action: { type: "SEND", amount, recipient: finalRecipient, details: recipientDetails }
        });
      }

      // Advanced Named Entity Recognition (NER) for Withdrawals
      const withdrawMatch = workingQuery.match(/(?:withdraw|cash out|off-ramp)\s+(?:(?:\$|usdc)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:usdc|dollars|bucks)?\s*)?(?:to|into)?\s*(.*)/i);
      
      // Only execute the WITHDRAW action if it's an imperative command
      if (withdrawMatch && !shouldBlockAction) {
        const amount = withdrawMatch[1] ? withdrawMatch[1].replace(/,/g, '') : "";
        const rawDetails = withdrawMatch[2] || "";

        let method = "bank"; // Default
        if (rawDetails.match(/(mobile money|momo|m-pesa|mpesa)/i)) method = "mobile";
        else if (rawDetails.match(/(crypto|wallet|usdc|address|0x|G[A-Z0-9]{55})/i)) method = "usdc";

        let bankCountry = "Nigeria"; // Fallback
        let currency = "NGN";
        if (rawDetails.match(/\b(NGN|Nigeria|Naira)\b/i)) { bankCountry = "Nigeria"; currency = "NGN"; }
        else if (rawDetails.match(/\b(KES|Kenya|Shillings)\b/i)) { bankCountry = "Kenya"; currency = "KES"; }
        else if (rawDetails.match(/\b(GHS|Ghana|Cedis)\b/i)) { bankCountry = "Ghana"; currency = "GHS"; }
        else if (rawDetails.match(/\b(ZAR|South Africa)\b/i)) { bankCountry = "South Africa"; currency = "ZAR"; }
        else if (rawDetails.match(/\b(USD|America)\b/i)) { bankCountry = "United States"; currency = "USD"; }

        let details = "";
        let bankName = "";
        let name = "";

        // 1. Strip conversational filler ("this NGN bank account details:")
        let cleanRest = rawDetails.replace(/(?:this|my)?\s*(?:[A-Z]{3})?\s*(?:bank|momo|mobile money|crypto)?\s*(?:account|wallet)?\s*(?:details|info)?\s*[:-]?\s*/i, '').trim();

        // 2. Parse comma-separated details (e.g. "Joshua tebepina, Opay, 7086693374")
        if (cleanRest.includes(',')) {
          const parts = cleanRest.split(',').map((s: string) => s.trim());
          parts.forEach((p: string) => {
             if (/\b\d{8,15}\b/.test(p) || (method === 'usdc' && p.length > 20)) details = p;
             else if (p.match(/(bank|opay|moniepoint|kuda|access|gtb|zenith|fnb|uba|palmpay|mpesa|mtn)/i) || (parts.length === 3 && p === parts[1])) bankName = p;
             else if (p.length > 2 && p.split(' ').length <= 4 && !name) name = p;
          });
        } else {
           const numMatch = cleanRest.match(/\b\d{8,15}\b/);
           if (numMatch) details = numMatch[0];
           
           const cryptoMatch = cleanRest.match(/(?:0x[a-fA-F0-9]{40}|G[A-Z0-9]{55})/);
           if (cryptoMatch) { details = cryptoMatch[0]; method = "usdc"; }

           // 🌟 CORE BACKEND FIX: Detach name extraction from the if/else chain!
           let remainingText = cleanRest;
           if (details) {
               remainingText = remainingText.replace(details, ''); // Remove the wallet/number so it doesn't pollute the name
           }

           // Look for explicit labeling instructions (e.g., "label it as Treasury", "named John", "for Payroll")
           const explicitLabelMatch = remainingText.match(/(?:label(?:ed)?(?: it)? as|name(?:d)?(?: it)?|for)\s+([a-zA-Z0-9\s_.-]+)/i);
           
           if (explicitLabelMatch && explicitLabelMatch[1]) {
               name = explicitLabelMatch[1].trim();
           } else {
               // Fallback: Clean up remaining conversational filler words to find the latent name
               remainingText = remainingText
                   .replace(/\b(?:at|to|and|the|wallet|account|address|stellar|polygon|base|network)\b/gi, '')
                   .replace(/[^a-zA-Z0-9\s_.-]/g, '') // strip trailing punctuation
                   .trim();

               if (remainingText.length > 2 && !remainingText.match(/\b(?:bank|withdraw|ngn)\b/i)) {
                   name = remainingText;
               }
           }
        }

        // =========================================================================
        // 🌟 ENTERPRISE FIX 2: ADDRESS BOOK DISAMBIGUATION FOR WITHDRAWAL
        // Stops the frontend from hijacking Crypto names when the user meant "WITHDRAW"
        // =========================================================================
        if (name && !details && method !== "usdc") {
            const safeRecipient = name.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
            try {
                // Scan the raw address book to catch saved recipients BEFORE a transaction occurs
                const addressBookResult: any = await db.execute(sql`SELECT * FROM recipients WHERE "userId" = ${userId} AND "name" ILIKE ${'%' + safeRecipient + '%'}`);
                const rows = addressBookResult.rows || (Array.isArray(addressBookResult) ? addressBookResult : []);

                if (rows.length > 0) {
                    let hasBank = false;
                    let hasCrypto = false;
                    let cryptoEmail = "";

                    rows.forEach((r: any) => {
                        const t = String(r.type || '').toLowerCase();
                        if (t.includes('bank') || t.includes('mobile') || t.includes('momo') || t.includes('fiat')) {
                            hasBank = true;
                        } else if (t.includes('email') || t.includes('wallet') || t.includes('crypto')) {
                            hasCrypto = true;
                            if (r.email || r.details) cryptoEmail = r.email || r.details;
                        }
                    });

                    const explicitClarification = workingQuery.match(/(bank|account)/i);

                    if (hasBank && hasCrypto && !explicitClarification) {
                        return res.json({
                            answer: `I found multiple recipient records for "**${name}**" (both Bank and Digital Wallet). To ensure the funds go to the right place, please clarify: ask me to *"Withdraw to ${name}'s bank"* or *"Send to ${name}'s wallet"*.`,
                            suggestions: [`Withdraw $${amount || '5'} to ${name}'s bank`, `Send $${amount || '5'} to ${name}'s wallet`]
                        });
                    }

                    // Intent Violation: User said "Withdraw" but Address Book proves this is an Email/Wallet recipient
                    if (hasCrypto && !hasBank && !explicitClarification) {
                        return res.json({
                            answer: `You asked to withdraw funds to "**${name}**", but your Address Book shows they are saved as an internal digital wallet recipient (${cryptoEmail || 'Email'}).\n\nTo proceed, please ask me to: *"Send a payment to ${name}"* instead.`,
                            suggestions: [`Send ${amount ? `$${amount} ` : ''}to ${name}`]
                        });
                    }
                }
            } catch (e) {
                console.error("[WITHDRAWAL Disambiguation Error]", e);
            }
        }

        return res.json({
            answer: `I'm opening the withdrawal portal and preparing your transaction${amount ? ` for **$${amount}**` : ''}. I've prefilled your destination details. Please review and confirm.`,
            action: { 
               type: "WITHDRAWAL", 
               amount,
               prefill: {
                  method, bankCountry, currency, details, bankName, name,
                  momoCountry: bankCountry, momoNetwork: bankName, network: "Stellar"
               }
            }
        });
      }

      // =========================================================================
      // 🌟 SMART DEPOSIT ROUTER (Crypto Address Fetcher vs. Fiat Modal Opener)
      // =========================================================================
      const isDepositQuery = workingQuery.match(/(?:deposit|add funds|fund account|fund my account|top up|receive funds|receive usdc|deposit address|my address)/i);

      if (isDepositQuery && !shouldBlockAction) {
        // 1. Detect Intent
        const isExplicitFiat = workingQuery.match(/\b(naira|ngn|kes|shilling|ghs|cedi|zar|rand|eur|euro|gbp|pound|bank|transfer|momo|mobile money|fiat|card)\b/i);
        const isExplicitCrypto = workingQuery.match(/\b(crypto|usdc|usdt|stellar|solana|base|polygon|ethereum|eth|token|onchain|wallet|address)\b/i);
        const isExplicitModalRequest = workingQuery.match(/(?:open|show|launch|pop)\s+(?:deposit|funding)?\s*(?:modal|portal|view|screen|qr)/i);

        // 2. Detect Requested Network (Default: Stellar)
        let networkName = "Stellar";
        if (workingQuery.match(/solana/i)) networkName = "Solana";
        else if (workingQuery.match(/polygon/i)) networkName = "Polygon";
        else if (workingQuery.match(/base/i)) networkName = "Base";
        else if (workingQuery.match(/ethereum|eth|erc20/i)) networkName = "Ethereum (ERC-20)";

        // 🚨 SIMULATION FIX 1: Prevent "Multi-Chain Hallucination"
        if (networkName !== "Stellar") {
            return res.json({
                answer: `Right now, your native treasury ledger only accepts direct USDC deposits via the **Stellar Network**.\n\nTo bridge funds securely from **${networkName}**, please open the Deposit Portal to use our cross-chain routing system.`,
                action: { type: "DEPOSIT" },
                suggestions: ["Show my Stellar deposit address"]
            });
        }

        // -----------------------------------------------------------------------
        // PATH A: CRYPTO-TO-CRYPTO DEPOSIT (In-Chat Address & Instructions)
        // -----------------------------------------------------------------------
        // 🌟 REFINED LOGIC: Always favor the Modal if ANY fiat keyword is mentioned
        if (!isExplicitFiat && !isExplicitModalRequest) {
            
            // 🌟 MULTI-TENANT FIX: Read the exact sandbox ID from the frontend interceptor
            let activeWallet: string | null | undefined = undefined;

            // --- BRANCH A: EXPLICIT SUB-ACCOUNT REQUEST ---
            if (activeSubId) {
                try {
                    const subRecord = await db.select().from(subAccounts).where(eq(subAccounts.id, activeSubId)).limit(1);
                    activeWallet = (subRecord[0] as any)?.muxedAddress || (subRecord[0] as any)?.walletAddress || undefined;
                } catch (e) {
                    console.warn("[Radar Sub-Account Query Error]", e);
                }

                // 🚨 CRITICAL FIX 3: Prevent Sub-Account Cross-Contamination
                if (!activeWallet) {
                    return res.json({
                        answer: "This Virtual Ledger does not have a deposit address yet. Please click '+ Create Ledger' on your dashboard to generate its unique Muxed Address before depositing.",
                        suggestions: ["What's my account balance?"]
                    });
                }
            } 
            // --- BRANCH B: MASTER ACCOUNT REQUEST ---
            else {
                const userRecord = await db.select({ walletAddress: users.walletAddress }).from(users).where(eq(users.id, userId)).limit(1);
                activeWallet = userRecord[0]?.walletAddress ?? undefined;
                
                // 🚨 PRODUCTION GUARD: Master Wallet Uninitialized Catch
                if (!activeWallet) {
                    return res.json({
                        answer: "It looks like your main treasury ledger hasn't been fully initialized yet. Please complete your account setup to generate your unique secure deposit address.",
                        suggestions: ["Fund with Bank Transfer"]
                    });
                }
            }

            const cryptoDepositAnswer = 
              `\`${activeWallet}\`\n\n` +
              `👆 **That's your deposit address for USDC on ${networkName}:**\n\n` +
              `• **Network:** ${networkName} (Native USDC)\n` +
              `• **Minimum Deposit:** 1.00 USDC\n` +
              `• **Settlement:** Instant (~5 seconds)\n\n` +
              `Copy the address above and send your USDC from an external exchange or self-custody wallet. I am actively monitoring the blockchain and will notify you the moment the funds arrive.\n\n` +
              `*Need a QR code instead? Click below:*`;

            return res.json({
              answer: cryptoDepositAnswer,
              suggestions: ["Open Deposit Portal", "Fund with Bank Transfer", "What's my balance?"]
            });
        }

        // -----------------------------------------------------------------------
        // PATH B: FIAT ON-RAMP OR EXPLICIT MODAL REQUEST (Trigger Modal)
        // -----------------------------------------------------------------------
        return res.json({
          answer: "I'm opening the deposit portal right now. You can fund your treasury via Bank Transfer, Mobile Money, or QR Code.",
          action: { type: "DEPOSIT" },
          suggestions: ["What's my account balance?", "Show my crypto deposit address"]
        });
      }

      if (workingQuery.match(/(?:show|view|open|see)\s+(?:my\s+)?(?:recent\s+)?(?:transactions|ledger|history|payments)/i)) {
        return res.json({
          answer: "I'm opening your transaction history now so you can review your recent activity.",
          action: { type: "VIEW_TRANSACTIONS" },
          suggestions: ["What's my net cashflow?", "How much did I spend this month?"]
        });
      }

      if (workingQuery.match(/(?:request|ask for)\s+(?:money|funds|payment)/i)) {
        return res.json({
          answer: "I'm opening the Request portal for you. You can easily request funds via email, phone, or X handle.",
          action: { type: "REQUEST_PAYMENT" }
        });
      }

      if (workingQuery.match(/(?:create|make|generate)\s+(?:Digital wallet ledger|sub account|sub-account|muxed)/i)) {
        return res.json({
          answer: "I'm opening the Digital wallet generator. You can create a unique Stellar Muxed Address to isolate incoming payments.",
          action: { type: "CREATE_LEDGER" }
        });
      }

      // =========================================================================
      // 🧠 LAYER 0: THE OMNI-ID TRACKER (Type-Safe Postgres Queries)
      // =========================================================================
      const idRegex = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}|(?:TRX|REF|TXN|BATCH|idem_|DP-|WD-)[A-Z0-9_-]+)\b/i;
      const txIdMatch = workingQuery.match(idRegex);
      
      if (txIdMatch) {
        const targetId = txIdMatch[1];
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

        const txConditions = [
          sql`${transactions.reference} ILIKE ${'%' + targetId + '%'}`,
          sql`${transactions.txHash} ILIKE ${'%' + targetId + '%'}`,
          sql`${transactions.idempotencyKey} ILIKE ${'%' + targetId + '%'}`
        ];
        if (isUuid) txConditions.push(eq(transactions.id, targetId));

        const escConditions = [
          sql`${escrows.claimId} ILIKE ${'%' + targetId + '%'}`,
          sql`${escrows.batchId} ILIKE ${'%' + targetId + '%'}`,
          sql`${escrows.claimHash} ILIKE ${'%' + targetId + '%'}`,
          sql`${escrows.blockchainClaimHash} ILIKE ${'%' + targetId + '%'}`
        ];
        if (isUuid) escConditions.push(eq(escrows.id, targetId));

        const [txResult, escrowResult] = await Promise.all([
          db.select().from(transactions).where(and(txLedgerFilter, or(...txConditions))).limit(1),
          db.select().from(escrows).where(and(escrowLedgerFilter, or(...escConditions))).limit(1)
        ]);

        if (txResult.length > 0) {
          const tx = txResult[0];
          const formattedAmount = Number(tx.amount).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const txDate = new Date(tx.createdAt!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          
          let txMsg = `Here are the details for **${targetId}**:\n\n`;
          const safeType = tx.type || 'transaction';
          txMsg += `• **Type:** ${safeType.charAt(0).toUpperCase() + safeType.slice(1)}\n`;
          txMsg += `• **Amount:** ${formattedAmount} ${tx.fiatAmount ? `(~${Number(tx.fiatAmount).toLocaleString()} ${tx.fiatCurrency})` : ''}\n`;
          txMsg += `• **Status:** ${(tx.status || 'Unknown').toUpperCase()}\n`;
          txMsg += `• **Date:** ${txDate}\n`;
          if (tx.description) txMsg += `• **Details:** ${tx.description}\n`;

          return res.json({ answer: txMsg, suggestions: ["What's my net cashflow?", "Show my recent transactions"] });
        }

        if (escrowResult.length > 0) {
           const esc = escrowResult[0];
           const escAmount = Number(esc.amountLocked).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
           let escMsg = `I found Escrow Contract **${targetId}**:\n\n`;
           escMsg += `• **Recipient:** ${esc.recipientEmail}\n`;
           escMsg += `• **Locked Amount:** ${escAmount}\n`;
           escMsg += `• **Status:** ${(esc.status || 'Unknown').toUpperCase()}\n`;
           escMsg += `• **Yield Policy:** ${esc.yieldRecipient === 'sender' ? 'You earn yield' : esc.yieldRecipient === 'recipient' ? 'Recipient earns yield' : 'Split yield'}\n`;
           return res.json({ answer: escMsg, suggestions: ["Show my recent transactions"] });
        }

        if (q.match(/(find|search|where|status of|transaction|trx)/)) {
          return res.json({
            answer: `I searched your ledger and escrows, but I couldn't find any record matching the ID **${targetId}**. Please verify the ID and try again.`,
            suggestions: ["Show my recent transactions"]
          });
        }
      }

      // =========================================================================
      // 🧠 LAYER 1: EMPATHY & CONVERSATION
      // =========================================================================

      // 🌟 THE FIX: Enforce word boundaries (\b) and guard against FX queries
      if (!isFxQuery && q.match(/\b(help|stuck|issue|problem|error|failed|wrong|confused|frustrated)\b/i) && !q.match(/what problem/i) && !isInquiry) {
        return res.json({
          answer: "I completely understand that running into an issue can be frustrating, but I've got your back. To help me get this sorted, could you share a bit more detail? (If it's a specific payment, just paste the Transaction ID).",
          suggestions: ["My payment failed", "How do I contact support?"]
        });
      }

      // 🌟 AGENTIC SUPPORT CHANNEL (Guarded with \b to prevent matching 'supported' currencies)
      const isExplicitSupportRequest = q.match(/\b(contact|customer service|help desk|email you|reach you|call you|speak to someone|talk to someone|human|agent|representative|ticket)\b/i) ||
                                      (q.match(/\bsupport\b/i) && !q.match(/\b(supported|supporting|support for)\b/i));

      if (isExplicitSupportRequest && !isFxQuery) {
        // Actively scan the user's frustrated message for an ID!
        const idRegex = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:TRX|REF|TXN|BATCH|idem_|DP-|WD-)[A-Z0-9_-]+)\b/i;
        const txIdMatch = workingQuery.match(idRegex);
        const extractedId = txIdMatch ? txIdMatch[1].trim() : undefined;

        return res.json({
          answer: "I am opening a priority support ticket for you right now. Please provide as much detail as possible in the form so our treasury operations team can resolve this quickly.",
          action: { type: "OPEN_SUPPORT_TICKET", transactionId: extractedId }, // 🌟 Dynamically injects the ID!
          suggestions: ["View transactions ledger", "What's my net cashflow?"]
        });
      }

      if (q.match(/(?:cancel|stop|abort|reverse)\s+(?:transaction|escrow|payment|transfer)/i)) {
        return res.json({
          answer: "To cancel a transfer, open your **Transactions** tab, click on the specific Pending/In Escrow transaction, and click the red **'Cancel transfer'** button. This will securely terminate the contract on-chain and refund your account.",
          action: { type: "VIEW_TRANSACTIONS" }
        });
      }

      // =========================================================================
      // 🧠 LAYER 2: DEEP TREASURY ANALYTICS (Cashflow, Yield, Savings)
      // =========================================================================
      // 🌟 NEW: ACCOUNT BALANCE HANDLER
      const isBalanceRequest = 
        q.match(/(what is|what's|whats|show|tell me|check|get).*(my|our|current|account|wallet|treasury)?\s*(balance|available funds|how much money|how much usdc)/i) || 
        q.match(/^(my|our|current|account|wallet|treasury|available)?\s*(account|wallet|treasury)?\s*(balance|funds|money|usdc)[\.\?\!]*$/i);

      if (isBalanceRequest) {
        // 🛡️ IRON FENCE APPLIED: Route balance checks strictly to the active sandbox
        let currentBalanceNum = 0;
        
        if (activeSubId) {
            const subRecord = await db.select({ balance: subAccounts.balance }).from(subAccounts).where(eq(subAccounts.id, activeSubId)).limit(1);
            if (subRecord.length > 0) currentBalanceNum = Number((subRecord[0] as any).balance || 0);
        } else {
            const userRecord = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
            if (userRecord.length > 0) currentBalanceNum = Number(userRecord[0].balance || 0);
        }

        const currentBalance = currentBalanceNum.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
        return res.json({ 
          answer: `Your current available balance is **${currentBalance}**.`,
          suggestions: ["What's my net cashflow?", "Show my recent transactions", "make deposit", "send payment"] 
        });
      }

      // 🛡️ IRON FENCE APPLIED: Deprecate generic userFilter
      const userFilter = txLedgerFilter;
      const now = new Date();
      const userLocalTime = new Date(now.getTime() - (safeTzOffset * 60000));
      
      let startDate = new Date(0); 
      let endDate = new Date();
      let timeContext = "all time";
      

      if (q.includes("today")) {
        startDate = new Date(Date.UTC(userLocalTime.getUTCFullYear(), userLocalTime.getUTCMonth(), userLocalTime.getUTCDate(), 0, 0, 0, 0));
        startDate = new Date(startDate.getTime() + (safeTzOffset * 60000));
        timeContext = "today";
      } else if (q.includes("this month")) {
        startDate = new Date(Date.UTC(userLocalTime.getUTCFullYear(), userLocalTime.getUTCMonth(), 1, 0, 0, 0, 0));
        startDate = new Date(startDate.getTime() + (safeTzOffset * 60000));
        timeContext = "this month";
      } else if (q.includes("last month")) {
        startDate = new Date(Date.UTC(userLocalTime.getUTCFullYear(), userLocalTime.getUTCMonth() - 1, 1, 0, 0, 0, 0));
        startDate = new Date(startDate.getTime() + (safeTzOffset * 60000));
        endDate = new Date(Date.UTC(userLocalTime.getUTCFullYear(), userLocalTime.getUTCMonth(), 0, 23, 59, 59, 999));
        endDate = new Date(endDate.getTime() + (safeTzOffset * 60000));
        timeContext = "last month";
      } else if (q.includes("this year")) {
        startDate = new Date(Date.UTC(userLocalTime.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
        startDate = new Date(startDate.getTime() + (safeTzOffset * 60000));
        timeContext = "this year";
      }

        
      // =========================================================================
      // 🌟 LAYER 2: ENTERPRISE AUDIT & FLOW ANALYTICS (Payments, Withdrawals, Deposits)
      // =========================================================================
      
      // 🌟 THE FIX: Taught the engine to understand passive phrasing ("was withdrawn")
      const flowIntentMatch = workingQuery.match(/(?:how much(?: money)? (?:did (?:i|we) |was )?(pay|paid|spend|spent|send|sent|transfer|transferred|withdraw|withdrawn|cash out|cashed out|deposit|deposited|receive|received)|(?:what is|what are|what's|whats|show me) (?:my|our|the)?\s*(?:total )?(spend|spending|withdrawal|withdrawals|deposit|deposits|inflow|inflows|outflow|outflows))(?:\s+(?:to|from|on|for|this|last|during))?\s*(.*)/i);
      
      if (flowIntentMatch) {
          const actionVerb = (flowIntentMatch[1] || flowIntentMatch[2] || "").toLowerCase();
          
          // 1. Clean the extracted target of temporal keywords and punctuation
          let targetName = (flowIntentMatch[3] || "")
            .replace(/\b(this|last|month|week|year|today|yesterday|day|days|in total)\b/gi, '')
            .trim()
            .replace(/[.?!]+$/, '') 
            .trim();

          if (targetName.length <= 2) {
              targetName = "";
          }

          let txTypes: string[] = [];
          let reportTitle = "";
          let primarySuggestion = "";
          let isInflow = false;

          // 2. Dynamically map the verb to exact database types (Taxonomy Patched)
          if (actionVerb.match(/(withdraw|cash out|withdrawal|withdrawals|withdrawn)/)) {
              txTypes = ['withdrawal'];
              reportTitle = "Withdrawal & Off-Ramp Report";
              primarySuggestion = "Withdraw funds now";
          } else if (actionVerb.match(/(deposit|deposited|receive|received|inflow|inflows|deposits)/)) {
              txTypes = ['deposit', 'incoming_escrow', 'fiat_deposit'];
              reportTitle = "Inflow & Deposit Report";
              primarySuggestion = "Fund my account";
              isInflow = true;
          } else if (actionVerb.match(/(outflow|outflows)/)) {
              txTypes = ['payment', 'bulk_payment', 'withdrawal', 'transfer']; // 🌟 Outflows include EVERYTHING leaving the wallet
              reportTitle = "Total Outbound Flow Report";
              primarySuggestion = "What's my net cashflow?";
          } else {
              // Default to standard outbound spend
              txTypes = ['payment', 'bulk_payment', 'transfer']; 
              reportTitle = "Outbound Spend & Payment Report";
              primarySuggestion = "Send a payment"; 
          }

          // 3. Strict Temporal Bounding Box (Using local timezone)
          let timeframeLabel = "All Time";
          let startCutoff: Date | null = null;
          let endCutoff: Date | null = null;
          
          const utcNow = new Date();
          const userLocalNow = new Date(utcNow.getTime() - (safeTzOffset * 60000));
          const currentYear = userLocalNow.getUTCFullYear();
          const currentMonth = userLocalNow.getUTCMonth();
          const currentDate = userLocalNow.getUTCDate();
          const currentDayOfWeek = userLocalNow.getUTCDay();

          if (q.includes("this month")) {
            timeframeLabel = "This Month";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59));
          } else if (q.includes("last month")) {
            timeframeLabel = "Last Month";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59));
          } else if (q.includes("this week")) {
            timeframeLabel = "This Week";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate + (6 - currentDayOfWeek), 23, 59, 59));
          } else if (q.includes("last week")) {
            timeframeLabel = "Last Week";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek - 7, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek - 1, 23, 59, 59));
          } else if (q.includes("today")) {
            timeframeLabel = "Today";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59));
          } else if (q.includes("yesterday")) {
            timeframeLabel = "Yesterday";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 23, 59, 59));
          } else if (q.includes("this year")) {
            timeframeLabel = "This Year";
            startCutoff = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59));
          } else if (q.includes("last year")) {
            timeframeLabel = "Last Year";
            startCutoff = new Date(Date.UTC(currentYear - 1, 0, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear - 1, 11, 31, 23, 59, 59));
          }

          if (startCutoff) startCutoff = new Date(startCutoff.getTime() + (safeTzOffset * 60000));
          if (endCutoff) endCutoff = new Date(endCutoff.getTime() + (safeTzOffset * 60000));

          // 4. Fetch all account transactions
          const allTxs = await db.select().from(transactions).where(txLedgerFilter);

          // 🌟 BRANCH LOGIC (Global Flow vs. Entity Specific)
          if (targetName.length === 0) {
              
              // PATH A: USER ASKED FOR GLOBAL FLOW
              const generalTxs = allTxs.filter((tx: any) => {
                  if (!txTypes.includes(tx.type)) return false;
                  if (!['completed', 'settled', 'processing'].includes(String(tx.status).toLowerCase())) return false;
                  
                  if (startCutoff && endCutoff) {
                      const txDate = new Date(tx.createdAt || (tx as any).date || 0);
                      return txDate >= startCutoff && txDate <= endCutoff;
                  }
                  return true;
              }).sort((a: any, b: any) => {
                  const dateA = new Date(a.createdAt || a.date || 0).getTime();
                  const dateB = new Date(b.createdAt || b.date || 0).getTime();
                  return dateB - dateA; // Newest first
              });

              if (generalTxs.length === 0) {
                  let zeroResponse = `You have **$0.00** in ${isInflow ? 'incoming funds' : (txTypes.includes('withdrawal') ? 'withdrawals' : 'outbound spending')} for **${timeframeLabel}**.`;
                  if (timeframeLabel === "Today") {
                      if (isInflow) {
                          zeroResponse = `No deposits yet today! You have received **$0.00** so far.`;
                      } else if (txTypes.includes('withdrawal')) {
                          zeroResponse = `No off-ramps today! You have **$0.00** in withdrawals so far.`;
                      } else {
                          zeroResponse = `No debits sounds like good news for your treasury, right? Well, today you have **$0.00** in outbound spending so far.`;
                      }
                  }
                  return res.json({
                      answer: zeroResponse,
                      suggestions: [primarySuggestion, "What's my net cashflow?"]
                  });
              }

              const totalFlow = generalTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
              const formattedTotal = totalFlow.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
              const avgTicket = (totalFlow / generalTxs.length).toLocaleString("en-US", { style: 'currency', currency: 'USD' });

              const itemizedLogs = generalTxs.map((tx: any) => {
                  // 🌟 FINAL FIX: Perfect Server-to-Client Timezone alignment
                  const rawDate = tx.createdAt || tx.date || new Date();
                  const localTxDate = new Date(new Date(rawDate).getTime() - (safeTzOffset * 60000));
                  const formattedDate = localTxDate.toLocaleString("en-US", {
                      timeZone: 'UTC', // Enforce UTC to prevent Node from double-shifting it
                      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
                  });

                  const txAmount = Number(tx.amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
                  const txRef = tx.reference || tx.id || "N/A";
                  const status = String(tx.status || "COMPLETED").toUpperCase();
                  
                  const recipientInfo = 
                      tx.recipientEmail || 
                      (tx as any).senderEmail || 
                      tx.metadata?.recipientDetails?.phoneNumber || 
                      tx.metadata?.recipientDetails?.accountNumber || 
                      tx.metadata?.recipientDetails?.name || 
                      tx.metadata?.senderDetails?.name || 
                      (isInflow ? "External Sender" : "External Recipient");

                  const rail = tx.network ? tx.network.toUpperCase() : (tx.type ? String(tx.type).toUpperCase() : "USDC RAIL");

                  return `• **${txAmount}** (${status}) — Ref: \`${txRef}\`\n  📅 **Date & Time:** ${formattedDate}\n  👤 **Account / Entity:** ${recipientInfo}\n  ⚡ **Rail / Network:** ${rail}${tx.description ? `\n  📝 **Memo:** ${tx.description}` : ""}`;
              }).join("\n\n");

              let detailedAnswer = `**📊 Global ${reportTitle} (${timeframeLabel.toUpperCase()})**\n\n`;
              if (timeframeLabel === "Today") {
                  if (isInflow) {
                      detailedAnswer = `Great day for cash flow! Here is your treasury deposit summary for **Today**:\n\n`;
                  } else if (txTypes.includes('withdrawal') && !txTypes.includes('payment')) {
                      detailedAnswer = `Capital is moving to your banks! Here is your withdrawal summary for **Today**:\n\n`;
                  } else {
                      detailedAnswer = `Capital is moving! Here is your treasury outbound summary for **Today**:\n\n`;
                  }
              }

              detailedAnswer += 
                  `• **Total ${isInflow ? 'Inflow' : 'Volume'}:** **${formattedTotal}**\n` +
                  `• **Transactions Executed:** **${generalTxs.length}**\n` +
                  `• **Average Ticket Size:** **${avgTicket}**\n\n` +
                  `---\n\n` +
                  `**📑 Itemized Ledger Records**\n\n` +
                  `${itemizedLogs}\n\n` +
                  `---`;

              return res.json({
                  answer: detailedAnswer,
                  suggestions: [primarySuggestion, "What's my net cashflow?"]
              });

          } else {
              
              // PATH B: USER ASKED FOR ENTITY/VENDOR/SENDER FLOW
              const entityName = targetName;
              const entityTxs = allTxs.filter((tx: any) => {
                  if (!txTypes.includes(tx.type)) return false;
                  
                  // Explicitly prevent failed/cancelled txs from being summed!
                  if (!['completed', 'settled', 'processing'].includes(String(tx.status).toLowerCase())) return false;
                  
                  const matchesEntity = 
                    (tx.recipientEmail && tx.recipientEmail.toLowerCase().includes(entityName.toLowerCase())) ||
                    ((tx as any).senderEmail && (tx as any).senderEmail.toLowerCase().includes(entityName.toLowerCase())) ||
                    (tx.description && tx.description.toLowerCase().includes(entityName.toLowerCase())) ||
                    (tx.reference && tx.reference.toLowerCase().includes(entityName.toLowerCase())) ||
                    (tx.metadata?.recipientDetails?.name && tx.metadata.recipientDetails.name.toLowerCase().includes(entityName.toLowerCase())) ||
                    (tx.metadata?.senderDetails?.name && tx.metadata.senderDetails.name.toLowerCase().includes(entityName.toLowerCase()));

                  if (!matchesEntity) return false;

                  if (startCutoff && endCutoff) {
                    const txDate = new Date(tx.createdAt || (tx as any).date || 0);
                    return txDate >= startCutoff && txDate <= endCutoff;
                  }

                  return true;
              }).sort((a: any, b: any) => {
                  const dateA = new Date(a.createdAt || a.date || 0).getTime();
                  const dateB = new Date(b.createdAt || b.date || 0).getTime();
                  return dateB - dateA; // Newest first
              });

              if (entityTxs.length > 0) {
                 const totalFlow = entityTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
                 const formattedTotal = totalFlow.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
                 const avgTicket = (totalFlow / entityTxs.length).toLocaleString("en-US", { style: 'currency', currency: 'USD' });

                 const itemizedLogs = entityTxs.map((tx: any) => {
                    // 🌟 FINAL FIX: Perfect Server-to-Client Timezone alignment
                    const rawDate = tx.createdAt || tx.date || new Date();
                    const localTxDate = new Date(new Date(rawDate).getTime() - (safeTzOffset * 60000));
                    const formattedDate = localTxDate.toLocaleString("en-US", {
                        timeZone: 'UTC',
                        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
                    });

                    const txAmount = Number(tx.amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
                    const txRef = tx.reference || tx.id || "N/A";
                    const status = String(tx.status || "COMPLETED").toUpperCase();
                    
                    const recipientInfo = 
                      tx.recipientEmail || 
                      (tx as any).senderEmail || 
                      tx.metadata?.recipientDetails?.phoneNumber || 
                      tx.metadata?.recipientDetails?.accountNumber || 
                      tx.metadata?.recipientDetails?.name || 
                      tx.metadata?.senderDetails?.name || 
                      entityName;

                    const rail = tx.network ? tx.network.toUpperCase() : (tx.type ? String(tx.type).toUpperCase() : "USDC RAIL");

                    return `• **${txAmount}** (${status}) — Ref: \`${txRef}\`\n  📅 **Date & Time:** ${formattedDate}\n  👤 **Account / Entity:** ${recipientInfo}\n  ⚡ **Rail / Network:** ${rail}${tx.description ? `\n  📝 **Memo:** ${tx.description}` : ""}`;
                 }).join("\n\n");

                 let detailedAnswer = `**📊 ${isInflow ? 'Inflow' : 'Disbursement'} Report: ${entityName.toUpperCase()} (${timeframeLabel.toUpperCase()})**\n\n`;
                 if (timeframeLabel === "Today") {
                     detailedAnswer = `Hope you're having a productive day! Here is your treasury ${isInflow ? 'deposit' : 'spend'} summary for **${entityName.toUpperCase()}** today:\n\n`;
                 }

                 detailedAnswer += 
                    `• **Total ${isInflow ? 'Inflow' : 'Volume'}:** **${formattedTotal}**\n` +
                    `• **Transactions Executed:** **${entityTxs.length}**\n` +
                    `• **Average Ticket Size:** **${avgTicket}**\n\n` +
                    `---\n\n` +
                    `**📑 Itemized Ledger Records**\n\n` +
                    `${itemizedLogs}\n\n` +
                    `---`;

                 return res.json({
                   answer: detailedAnswer,
                   suggestions: [primarySuggestion, "What's my net cashflow?"]
                 });
              } else {
                 let zeroAnswer = `I scanned your ledger, but couldn't find any ${isInflow ? 'incoming' : 'outbound'} records matching "**${entityName}**" for **${timeframeLabel}**.`;
                 if (timeframeLabel === "Today") {
                     zeroAnswer = `Hope you're having a great day! I scanned your ledger, but you haven't ${isInflow ? 'received anything from' : 'spent anything on'} "**${entityName}**" today.`;
                 }
                 return res.json({
                   answer: zeroAnswer,
                   suggestions: [primarySuggestion, "View transactions ledger"]
                 });
              }
          }
      }
           

        
      const safeAmountSql = sql`CAST(${transactions.amount} AS NUMERIC)`;
      const timeFilter = and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate));

      // =========================================================================
      // 🌟 LAYER 2.05: LIVE FX & CROSS-BORDER QUOTING ORACLE (FINAL)
      // Synchronized with Bingtellar B2B rails, Cross-Fiat Routing, and UI Modals
      // =========================================================================
      if (isFxQuery) {
          const fxOracle = await getLiveFxOracle();

          // 1. Check for Global Corridor Overview
          const isGlobalOverview = q.match(/(?:all rates|all exchange rates|all corridors|what are your (?:rates|exchange rates|fx rates)|show (?:me )?(?:all )?(?:rates|supported currencies|currencies)|supported corridors|supported countries)/i) ||
                                  (!q.match(/\b(ngn|naira|kes|shilling|shillings|ghs|cedi|cedis|zar|rand|eur|euro|gbp|pound)\b/i) && q.match(/(?:rates|exchange rate|fx)/i));

          if (isGlobalOverview) {
              const corridors = Object.values(fxOracle);
              const flags: Record<string, string> = { NGN: "🇳🇬", KES: "🇰🇪", GHS: "🇬🇭", ZAR: "🇿🇦", EUR: "🇪🇺", GBP: "🇬🇧" };
              
              const corridorCards = corridors.map(c => {
                  const flag = flags[c.currency] || "🌐";
                  return `${flag} **${c.currency} — ${c.country}**\n` +
                         `• **Off-Ramp (Payout):** **${c.symbol}${c.offrampRate.toFixed(2)}**  ||  **On-Ramp (Deposit):** **${c.symbol}${c.onrampRate.toFixed(2)}**\n` +
                         `• **Settlement:** ${c.rails}  ⚡ *${c.sla.replace('< ', '<')}*`;
              }).join("\n\n");

              const overviewAnswer = 
                  `### 🟢 Live Institutional FX & Liquidity Map\n\n` +
                  `Real-time liquidity pricing and fulfillment rails across all active corridors:\n\n` +
                  `${corridorCards}\n\n` +
                  `---\n` +
                  `*Ask for a specific volume quote (e.g., "Quote 50,000 USDC to KES" or "Convert 5M Naira to USDC").*`;

              return res.json({
                  answer: overviewAnswer,
                  suggestions: ["Quote 10,000 USDC to NGN", "Quote 50,000 USDC to KES", "Fund my account"]
              });
          }

          // 2. Identify all currencies mentioned (For Cross-Fiat Routing)
          const currRegex = /\b(naira|ngn|kes|shilling|shillings|ghs|cedi|cedis|zar|rand|rands|eur|euro|euros|gbp|pound|pounds)\b/gi;
          const matchedCurrencies = [...new Set(Array.from(q.matchAll(currRegex), m => m[1].toLowerCase()))];
          
          const mapCurrencyToCode = (str: string) => {
              if (str.match(/(naira|ngn)/)) return "NGN";
              if (str.match(/(kes|shilling)/)) return "KES";
              if (str.match(/(ghs|cedi)/)) return "GHS";
              if (str.match(/(zar|rand)/)) return "ZAR";
              if (str.match(/(eur|euro)/)) return "EUR";
              if (str.match(/(gbp|pound)/)) return "GBP";
              return null;
          };

          const uniqueCodes = [...new Set(matchedCurrencies.map(mapCurrencyToCode).filter(Boolean))] as string[];

          // 3. Robust Principal Quantity Extraction
          let extractedNum = 0;
          let isExplicitOneUnit = false;

          const millionMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
          const thousandMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
          const standardMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*([\d,]+(?:\.\d{1,2})?)/i);

          if (millionMatch) {
              extractedNum = parseFloat(millionMatch[1]) * 1000000;
          } else if (thousandMatch) {
              extractedNum = parseFloat(thousandMatch[1]) * 1000;
          } else if (standardMatch && standardMatch[1]) {
              const cleanStr = standardMatch[1].replace(/,/g, '');
              const parsed = parseFloat(cleanStr);
              if (parsed === 1 && q.match(/\b(?:1|one)\s*(?:usdc|usd|dollar|ngn|naira|kes|ghs|zar|eur|gbp)\b/i)) {
                  extractedNum = 1;
                  isExplicitOneUnit = true;
              } else if (parsed > 0 && parsed !== 1) {
                  extractedNum = parsed;
              }
          }

          const isGenericRateQuery = extractedNum <= 0 && !isExplicitOneUnit;
          if (isGenericRateQuery) {
              extractedNum = 1000; // Standard $1,000 Benchmark
          }

          // 🌟 THE CROSS-FIAT ARBITRAGE ENGINE (e.g. NGN -> KES)
          if (uniqueCodes.length >= 2 && !q.match(/\b(usdc|usd|dollars|\$)\b/i)) {
              const sourceCode = uniqueCodes[0];
              const targetCode = uniqueCodes[1];
              const sourceCorridor = fxOracle[sourceCode];
              const targetCorridor = fxOracle[targetCode];

              if (!sourceCorridor || !targetCorridor) throw new Error("Corridor resolution failed");

              const sourceFiatAmount = isGenericRateQuery ? 1000000 : extractedNum;
              
              const onrampFee = sourceFiatAmount * sourceCorridor.spreadPercent;
              const netSourceFiat = Math.max(0, sourceFiatAmount - onrampFee);
              const bridgedUsdc = netSourceFiat / Math.max(sourceCorridor.onrampRate, 0.0001);

              const grossTargetFiat = bridgedUsdc * targetCorridor.offrampRate;
              const netTargetFiat = Math.max(0, grossTargetFiat - targetCorridor.railFee);

              const formattedSource = `${sourceCorridor.symbol}${sourceFiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
              const formattedTarget = `${targetCorridor.symbol}${netTargetFiat.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
              
              let crossAnswer = `**💱 B2B Cross-Border Quote: ${sourceCode} to ${targetCode}**\n\n`;
              crossAnswer += `To send **${formattedSource} ${sourceCode}** to a vendor in **${targetCorridor.country}**:\n\n` +
                             `• **Estimated Net Payout:** **${formattedTarget} ${targetCode}**\n` +
                             `• **Intermediate Bridge:** ~${bridgedUsdc.toLocaleString("en-US", {style: 'currency', currency: 'USD'})} USDC\n` +
                             `• **Effective Cross-Rate:** 1 ${sourceCode} ≈ ${targetCorridor.symbol}${(netTargetFiat/sourceFiatAmount).toFixed(4)} ${targetCode}\n` +
                             `• **Settlement Rails:** ${targetCorridor.rails} (${targetCorridor.sla})\n\n` +
                             `*Powered by Blink's stablecoin liquidity routing.*`;

              return res.json({
                  answer: crossAnswer,
                  suggestions: ["Fund my account", `Withdraw to ${targetCorridor.currency} Bank`]
              });
          }

          // 4. Standard USDC <-> FIAT Directional Resolution
          const targetCorridor = uniqueCodes[0] || "NGN";
          const corridor = fxOracle[targetCorridor] || fxOracle.NGN;

          const isExplicitFiatSource = workingQuery.match(new RegExp(`(?:from|convert|swap|exchange)?\\s*(?:[₦€£]|${corridor.currency}|${corridor.name})\\s*[\\d,]+`, 'i')) ||
                                      workingQuery.match(new RegExp(`[\\d,]+\\s*(?:₦|${corridor.currency}|naira|kes|shilling|ghs|cedi|zar|rand|eur|gbp)\\s*(?:to|into|in|for)\\s*(?:usdc|usd|dollar)`, 'i'));

          const isDepositIntent = q.match(/(?:buy usdc|buy|deposit|fund|onramp|how much usdc (?:do i get|will i receive|for))/i) ||
                                  Boolean(isExplicitFiatSource) ||
                                  (q.match(/\b(naira|ngn|kes|ghs|zar|eur|gbp)\b/i) && !q.match(/\b(usdc|usd|\$)\b/i) && !q.match(/(?:withdraw|payout|send|off-ramp|cash out)/i));

          let usdcAmount = 0;
          let fiatAmount = 0;
          let appliedRate = isDepositIntent ? corridor.onrampRate : corridor.offrampRate;
          appliedRate = Math.max(appliedRate, 0.0001); 
          
          let railFeeDeduction = corridor.railFee;

          if (isDepositIntent) {
              const isUsdcTarget = q.match(/(?:buy|need|get)\s*(?:\$|usdc|usd|dollars)?\s*[\d,.]+(?:k|m|million)?\s*(?:usdc|usd|dollars)?/i) && !isExplicitFiatSource;
              if (isUsdcTarget && !isGenericRateQuery) {
                  usdcAmount = extractedNum;
                  fiatAmount = (usdcAmount * appliedRate) + (appliedRate * 0.015);
              } else {
                  fiatAmount = isGenericRateQuery ? (extractedNum * appliedRate) : extractedNum;
                  const fiatAfterFee = Math.max(0, fiatAmount - (appliedRate * 0.015));
                  usdcAmount = fiatAfterFee / appliedRate;
              }
          } else {
              if (q.match(new RegExp(`(?:need|want|payout|send)\\s*(?:${corridor.symbol}|${corridor.currency})\\s*[\\d,]+`, 'i')) && !isGenericRateQuery) {
                  fiatAmount = extractedNum;
                  const grossFiatNeeded = fiatAmount + railFeeDeduction;
                  usdcAmount = grossFiatNeeded / appliedRate;
              } else {
                  usdcAmount = extractedNum;
                  const grossFiat = usdcAmount * appliedRate;
                  fiatAmount = Math.max(0, grossFiat - railFeeDeduction);
              }
          }

          const formattedUsdc = usdcAmount.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedFiat = `${corridor.symbol}${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const formattedRate = `${corridor.symbol}${appliedRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const formattedFee = railFeeDeduction > 0 ? `${corridor.symbol}${railFeeDeduction.toFixed(2)}` : "Free (0.00)";

          let quoteAnswer = "";

          // 🌟 THE FIX: Separate cleanly between Generic Quotes, 1-Unit Rates, and Volume Exchanges
          if (isGenericRateQuery && !isExplicitOneUnit && !isDepositIntent && !q.match(/(?:withdraw|payout|send|cash out|off-ramp)/i)) {
              quoteAnswer = `**💱 Live Treasury FX Oracle: USDC / ${corridor.currency}**\n\n` +
                             `Here is the current live wholesale exchange rate for the **${corridor.country} (${corridor.currency})** corridor:\n\n` +
                             `• **Live Off-Ramp Rate (Payouts):** **1 USDC = ${corridor.symbol}${corridor.offrampRate.toFixed(2)}**\n` +
                             `• **Live On-Ramp Rate (Deposits):** **1 USDC = ${corridor.symbol}${corridor.onrampRate.toFixed(2)}**\n` +
                             `• **Settlement Rails:** ${corridor.rails}\n` +
                             `• **Settlement SLA:** ⚡ **${corridor.sla}**\n`;
          } else {
              const exchangeType = (isGenericRateQuery || isExplicitOneUnit) ? "Rate" : "Exchange";
              quoteAnswer = `**💱 Live Treasury FX ${exchangeType}: USDC / ${corridor.currency}**\n\n`;

              if (isGenericRateQuery || isExplicitOneUnit) {
                  quoteAnswer += `Here is your real-time quote for **1 USDC** to **${corridor.name}**:\n\n` +
                                 `• **Execution Rate:** **1 USDC = ${formattedRate}**\n` +
                                 `• **Network / Rail Fee:** ${formattedFee}\n` +
                                 `• **Delivery Channel:** ${corridor.rails}\n` +
                                 `• **Settlement SLA:** ⚡ **${corridor.sla}**\n`;
              } else if (isDepositIntent) {
                  quoteAnswer += `Here is your guaranteed deposit quote to fund your treasury with **${formattedUsdc}**:\n\n` +
                                 `• **Total Deposit Required:** **${formattedFiat} ${corridor.currency}**\n` +
                                 `• **Guaranteed Net USDC:** **${formattedUsdc}**\n` +
                                 `• **Execution Rate:** **1 USDC = ${formattedRate}**\n` +
                                 `• **Fulfillment Rail:** ${corridor.rails} (${corridor.sla})\n\n` +
                                 `*Click "Fund my account" to generate your unique funding virtual account.*`;
              } else {
                  quoteAnswer += `Here is your real-time quote to disburse **${formattedUsdc}** to **${corridor.name}**:\n\n` +
                                 `• **Guaranteed Net Payout:** **${formattedFiat} ${corridor.currency}**\n` +
                                 `• **Execution Rate:** **1 USDC = ${formattedRate}**\n` +
                                 `• **Bank / Mobile Rail Fee:** -${formattedFee}\n` +
                                 `• **Delivery Channel:** ${corridor.rails}\n` +
                                 `• **Settlement Guarantee:** ⚡ **${corridor.sla}**\n\n` +
                                 `*Funds disburse directly from Stellar Soroban settlement pools into local clearing rails.*`;
              }
          }

          // 🌟 NEW: Advanced Named Entity Recognition (NER) to lift prefill work off user's shoulders
          let extractedDetails = "";
          let extractedBankName = "";
          let extractedName = "";
          let resolvedMethod = (targetCorridor === "KES" || targetCorridor === "GHS") ? "mobile" : "bank";

          if (!isDepositIntent) {
              const rawText = workingQuery;
              
              // 1. Extract Account Number (8-15 digits)
              const numMatch = q.match(/(?:account number|account|acct|number|no)\s*[:=-]?\s*(\d{8,15})/i) || q.match(/\b(\d{8,15})\b/);
              if (numMatch) extractedDetails = numMatch[1];

              // 2. Extract Bank Name explicitly (e.g. "bank: Opay")
              const bankExplicit = rawText.match(/(?:bank|provider|network)\s*[:=-]\s*([a-zA-Z\s]+?)(?:,|\baccount\b|\bnumber\b|\brecipient\b|$)/i);
              if (bankExplicit && bankExplicit[1].trim().length > 2) {
                  extractedBankName = bankExplicit[1].trim();
              }

              // 3. Extract Recipient Name explicitly
              // Looks for formats like "recipient Joshua", "to Joshua Tebepina", etc.
              const nameExplicit = rawText.match(/(?:recipient|to|name)\s*[:=-]?\s*([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){1,3})(?:,|\bbank\b|\baccount\b|\bnumber\b|$)/) || 
                                   rawText.match(/(?:recipient|name)\s*[:=-]?\s*([a-zA-Z]+(?: [a-zA-Z]+){1,3})(?:,|\bbank\b|\baccount\b|\bnumber\b|$)/i);
              if (nameExplicit && nameExplicit[1].trim().length > 2) {
                  const cleanedName = nameExplicit[1].trim().replace(/\b(?:bank|account|number)\b/gi, '').trim();
                  if (cleanedName.toLowerCase() !== "ngn bank" && cleanedName.toLowerCase() !== "this recipient") extractedName = cleanedName;
              }

              // 4. Fallback: comma-separated heuristic parsing
              if (!extractedBankName || !extractedName) {
                  const commaParts = rawText.split(',').map(s => s.trim());
                  commaParts.forEach(p => {
                      if (!extractedBankName && p.match(/\b(opay|moniepoint|kuda|access|gtb|zenith|fnb|uba|palmpay|mpesa|mtn|airtel|vodafone|stanbic|absa|equity)\b/i)) {
                          extractedBankName = p.replace(/\b(?:bank|momo|mobile money)\b/gi, '').trim();
                      } else if (!extractedName && p.length > 2 && p.split(' ').length >= 2 && p.split(' ').length <= 4 && !/\d/.test(p) && !p.match(/\b(?:withdraw|send|pay|bank|account|naira|ngn|kes|ghs|zar|eur|usd|this)\b/i)) {
                          extractedName = p;
                      }
                  });
              }

              // 5. Normalization
              if (extractedBankName) extractedBankName = extractedBankName.replace(/^bank\s+/i, '').trim();
              const toTitleCase = (str: string) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
              
              if (extractedName && extractedName.toLowerCase().startsWith("this recipient ")) {
                  extractedName = extractedName.substring(15).trim();
              }
              
              if (extractedName) extractedName = toTitleCase(extractedName);
              if (extractedBankName) extractedBankName = toTitleCase(extractedBankName);

              // 6. Override method if specific keywords found
              if (extractedBankName.match(/(momo|m-pesa|mpesa|mtn|airtel|vodafone)/i)) resolvedMethod = "mobile";
              if (rawText.match(/(0x[a-fA-F0-9]{40}|G[A-Z0-9]{55})/i)) {
                  extractedDetails = rawText.match(/(0x[a-fA-F0-9]{40}|G[A-Z0-9]{55})/i)![0];
                  resolvedMethod = "usdc";
              }
          }

          // 🌟 THE FIX: Semantic Intent Classifier to dynamically route between Payments and Withdrawals
          const isSendIntent = q.match(/\b(send|pay|transfer|vendor|contractor|team|payroll|salary|supplier)\b/i) && !q.match(/\b(withdraw|cash out|payout|pay out|off-ramp|my bank|my account)\b/i);
          const outboundType = isSendIntent ? "SEND" : "WITHDRAWAL";

          // Uniform Prefill Payload Output
          const actionPayload = isDepositIntent ? {
              type: "DEPOSIT",
              currency: corridor.currency,
              // Strips empty .00 trailing zeros to prevent frontend calculation errors
              amount: String(parseFloat(usdcAmount.toFixed(2)))
          } : {
              type: outboundType, // 🌟 Dynamically routes to SEND or WITHDRAWAL
              amount: String(parseFloat(usdcAmount.toFixed(2))),
              prefill: {
                  method: resolvedMethod,
                  bankCountry: corridor.country,
                  currency: corridor.currency,
                  momoCountry: corridor.country,
                  momoNetwork: resolvedMethod === "mobile" ? (extractedBankName || (targetCorridor === "KES" ? "M-PESA" : "MTN Mobile Money")) : undefined,
                  bankName: resolvedMethod === "bank" ? extractedBankName : undefined,
                  name: extractedName,
                  details: extractedDetails,
                  // Strips empty .00 trailing zeros to prevent frontend calculation errors
                  estimatedPayout: String(parseFloat(fiatAmount.toFixed(2))),
                  rate: appliedRate
              }
          };

          return res.json({
              answer: quoteAnswer,
              action: actionPayload,
              suggestions: [
                  // 🌟 Updates the UI prompt buttons based on the user's recognized intent
                  isDepositIntent ? "Fund my account" : (isSendIntent ? `Send ${corridor.currency} payment` : `Withdraw to ${corridor.currency} Bank`),
                  `What is the rate for ${targetCorridor === "NGN" ? "KES" : "NGN"}?`,
                  "What's my net cashflow?"
              ]
          });
      }
      
      if (isFxQuery) {
          const fxOracle = await getLiveFxOracle();

          // 1. Check for Global Corridor Overview
          const isGlobalOverview = q.match(/(?:all rates|all exchange rates|all corridors|what are your (?:rates|exchange rates|fx rates)|show (?:me )?(?:all )?rates|supported corridors|supported currencies)/i) ||
                                  (!q.match(/\b(ngn|naira|kes|shilling|shillings|ghs|cedi|cedis|zar|rand|eur|euro|gbp|pound)\b/i) && q.match(/(?:rates|exchange rate|fx)/i));

          if (isGlobalOverview) {
              const corridors = Object.values(fxOracle);
              const rows = corridors.map(c => 
                  `| **${c.currency}** (${c.country}) | ${c.symbol}${c.offrampRate.toFixed(2)} | ${c.symbol}${c.onrampRate.toFixed(2)} | ${c.rails} | ⚡ ${c.sla} |`
              ).join("\n");

              const overviewAnswer = 
                  `**📊 Blink Institutional FX & Liquidity Matrix**\n\n` +
                  `Here are our live wholesale exchange rates and fulfillment channels across all active corridors:\n\n` +
                  `| Corridor | Off-Ramp (Payout) | On-Ramp (Deposit) | Delivery Channel | Settlement SLA |\n` +
                  `| :--- | :--- | :--- | :--- | :--- |\n` +
                  `${rows}\n\n` +
                  `---\n\n` +
                  `• **Pricing Model:** Direct wholesale liquidity pool pass-through (zero wire spreads).\n` +
                  `• **Settlement Guarantee:** Powered by Stellar Soroban programmable escrows.\n\n` +
                  `*Ask for a specific volume quote (e.g., "Quote 50,000 USDC to KES" or "Convert 5M Naira to KES").*`;

              return res.json({
                  answer: overviewAnswer,
                  suggestions: ["Quote 10,000 USDC to NGN", "Convert 1M NGN to KES", "Fund my account"]
              });
          }

          // 2. Identify all currencies mentioned (For Cross-Fiat Routing)
          const currRegex = /\b(naira|ngn|kes|shilling|shillings|ghs|cedi|cedis|zar|rand|rands|eur|euro|euros|gbp|pound|pounds)\b/gi;
          const matchedCurrencies = [...new Set(Array.from(q.matchAll(currRegex), m => m[1].toLowerCase()))];
          
          const mapCurrencyToCode = (str: string) => {
              if (str.match(/(naira|ngn)/)) return "NGN";
              if (str.match(/(kes|shilling)/)) return "KES";
              if (str.match(/(ghs|cedi)/)) return "GHS";
              if (str.match(/(zar|rand)/)) return "ZAR";
              if (str.match(/(eur|euro)/)) return "EUR";
              if (str.match(/(gbp|pound)/)) return "GBP";
              return null;
          };

          const uniqueCodes = [...new Set(matchedCurrencies.map(mapCurrencyToCode).filter(Boolean))] as string[];

          // 3. Robust Principal Quantity Extraction
          let extractedNum = 0;
          let isExplicitOneUnit = false;

          const millionMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
          const thousandMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
          const standardMatch = workingQuery.match(/(?:[\$₦€£]|usdc|ngn|kes|ghs|zar|eur|gbp)?\s*([\d,]+(?:\.\d{1,2})?)/i);

          if (millionMatch) {
              extractedNum = parseFloat(millionMatch[1]) * 1000000;
          } else if (thousandMatch) {
              extractedNum = parseFloat(thousandMatch[1]) * 1000;
          } else if (standardMatch && standardMatch[1]) {
              const cleanStr = standardMatch[1].replace(/,/g, '');
              const parsed = parseFloat(cleanStr);
              if (parsed === 1 && q.match(/\b(?:1|one)\s*(?:usdc|usd|dollar|ngn|naira|kes|ghs|zar|eur|gbp)\b/i)) {
                  extractedNum = 1;
                  isExplicitOneUnit = true;
              } else if (parsed > 0 && parsed !== 1) {
                  extractedNum = parsed;
              }
          }

          const isGenericRateQuery = extractedNum <= 0 && !isExplicitOneUnit;
          if (isGenericRateQuery) {
              extractedNum = 1000; // Standard $1,000 Benchmark
          }

          // 🌟 RED TEAM FIX: THE CROSS-FIAT ARBITRAGE ENGINE (e.g. NGN -> KES)
          if (uniqueCodes.length >= 2 && !q.match(/\b(usdc|usd|dollars|\$)\b/i)) {
              // Assume first mentioned is Source, second is Target
              const sourceCode = uniqueCodes[0];
              const targetCode = uniqueCodes[1];
              const sourceCorridor = fxOracle[sourceCode];
              const targetCorridor = fxOracle[targetCode];

              if (!sourceCorridor || !targetCorridor) throw new Error("Corridor resolution failed");

              const sourceFiatAmount = isGenericRateQuery ? 1000000 : extractedNum;
              
              // Step 1: On-Ramp Source to USDC
              const onrampFee = sourceFiatAmount * sourceCorridor.spreadPercent;
              const netSourceFiat = Math.max(0, sourceFiatAmount - onrampFee);
              const bridgedUsdc = netSourceFiat / Math.max(sourceCorridor.onrampRate, 0.0001);

              // Step 2: Off-Ramp USDC to Target
              const grossTargetFiat = bridgedUsdc * targetCorridor.offrampRate;
              const netTargetFiat = Math.max(0, grossTargetFiat - targetCorridor.railFee);

              const formattedSource = `${sourceCorridor.symbol}${sourceFiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
              const formattedTarget = `${targetCorridor.symbol}${netTargetFiat.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
              
              let crossAnswer = `**💱 B2B Cross-Border Quote: ${sourceCode} to ${targetCode}**\n\n`;
              crossAnswer += `To send **${formattedSource} ${sourceCode}** to a vendor in **${targetCorridor.country}**:\n\n` +
                             `• **Estimated Net Payout:** **${formattedTarget} ${targetCode}**\n` +
                             `• **Intermediate Bridge:** ~${bridgedUsdc.toLocaleString("en-US", {style: 'currency', currency: 'USD'})} USDC\n` +
                             `• **Effective Cross-Rate:** 1 ${sourceCode} ≈ ${targetCorridor.symbol}${(netTargetFiat/sourceFiatAmount).toFixed(4)} ${targetCode}\n` +
                             `• **Settlement Rails:** ${targetCorridor.rails} (${targetCorridor.sla})\n\n` +
                             `*Powered by Blink's stablecoin liquidity routing.*`;

              return res.json({
                  answer: crossAnswer,
                  suggestions: ["Fund my account", `Withdraw to ${targetCorridor.currency} Bank`]
              });
          }

          // 4. Standard USDC <-> FIAT Directional Resolution
          const targetCorridor = uniqueCodes[0] || "NGN";
          const corridor = fxOracle[targetCorridor] || fxOracle.NGN;

          const isExplicitFiatSource = workingQuery.match(new RegExp(`(?:from|convert|swap|exchange)?\\s*(?:[₦€£]|${corridor.currency}|${corridor.name})\\s*[\\d,]+`, 'i')) ||
                                      workingQuery.match(new RegExp(`[\\d,]+\\s*(?:₦|${corridor.currency}|naira|kes|shilling|ghs|cedi|zar|rand|eur|gbp)\\s*(?:to|into|in|for)\\s*(?:usdc|usd|dollar)`, 'i'));

          const isDepositIntent = q.match(/(?:buy usdc|deposit|fund|onramp|how much usdc (?:do i get|will i receive|for))/i) ||
                                  Boolean(isExplicitFiatSource) ||
                                  (q.match(/\b(naira|ngn|kes|ghs|zar|eur|gbp)\b/i) && !q.match(/\b(usdc|usd|\$)\b/i) && !q.match(/(?:withdraw|payout|send)/i));

          let usdcAmount = 0;
          let fiatAmount = 0;
          let appliedRate = isDepositIntent ? corridor.onrampRate : corridor.offrampRate;
          appliedRate = Math.max(appliedRate, 0.0001); // Guard against zero-division
          
          let railFeeDeduction = corridor.railFee;

          if (isDepositIntent) {
              if (q.match(/(?:buy|need|get)\s*(?:\$|usdc)\s*[\d,]+/i) && !isExplicitFiatSource && !isGenericRateQuery) {
                  usdcAmount = extractedNum;
                  fiatAmount = (usdcAmount * appliedRate) + (appliedRate * 0.015);
              } else {
                  fiatAmount = isGenericRateQuery ? (extractedNum * appliedRate) : extractedNum;
                  const fiatAfterFee = Math.max(0, fiatAmount - (appliedRate * 0.015));
                  usdcAmount = fiatAfterFee / appliedRate;
              }
          } else {
              if (q.match(new RegExp(`(?:need|want|payout|send)\\s*(?:${corridor.symbol}|${corridor.currency})\\s*[\\d,]+`, 'i')) && !isGenericRateQuery) {
                  fiatAmount = extractedNum;
                  const grossFiatNeeded = fiatAmount + railFeeDeduction;
                  usdcAmount = grossFiatNeeded / appliedRate;
              } else {
                  usdcAmount = extractedNum;
                  const grossFiat = usdcAmount * appliedRate;
                  fiatAmount = Math.max(0, grossFiat - railFeeDeduction);
              }
          }

          const formattedUsdc = usdcAmount.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedFiat = `${corridor.symbol}${fiatAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const formattedRate = `${corridor.symbol}${appliedRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const formattedFee = railFeeDeduction > 0 ? `${corridor.symbol}${railFeeDeduction.toFixed(2)}` : "Free (0.00)";

          let quoteAnswer = `**💱 Live Treasury FX Oracle: USDC / ${corridor.currency}**\n\n`;

          if (isGenericRateQuery) {
              quoteAnswer += `Here is the current live liquidity rate for the **${corridor.country} (${corridor.currency})** corridor:\n\n` +
                             `• **Live Off-Ramp Rate (Payouts):** **1 USDC = ${corridor.symbol}${corridor.offrampRate.toFixed(2)} ${corridor.currency}**\n` +
                             `• **Live On-Ramp Rate (Deposits):** **1 USDC = ${corridor.symbol}${corridor.onrampRate.toFixed(2)} ${corridor.currency}**\n` +
                             `• **Settlement Rails:** ${corridor.rails}\n` +
                             `• **Settlement SLA:** ⚡ **${corridor.sla}**\n\n` +
                             `---\n\n` +
                             `**Standard $1,000.00 USDC Off-Ramp Execution:**\n` +
                             `• **Gross Output:** ${corridor.symbol}${(1000 * corridor.offrampRate).toLocaleString("en-US", { minimumFractionDigits: 2 })}\n` +
                             `• **Bank/MoMo Rail Fee:** -${formattedFee}\n` +
                             `• **Net Delivered to Beneficiary:** **${corridor.symbol}${Math.max(0, (1000 * corridor.offrampRate) - railFeeDeduction).toLocaleString("en-US", { minimumFractionDigits: 2 })}**\n\n` +
                             `*Non-custodial settlement via Stellar liquidity rails with zero correspondent banking delays.*`;
          } else if (isDepositIntent) {
              quoteAnswer += `Here is your guaranteed deposit quote to fund your treasury with **${formattedUsdc}**:\n\n` +
                             `• **Total Deposit Required:** **${formattedFiat} ${corridor.currency}**\n` +
                             `• **Execution Rate:** **1 USDC = ${formattedRate}**\n` +
                             `• **Fulfillment Rail:** ${corridor.rails} (${corridor.sla})\n` +
                             `• **Crediting Asset:** Native USDC on Stellar\n\n` +
                             `*Click "Fund my account" to generate your unique funding virtual account.*`;
          } else {
              quoteAnswer += `Here is your real-time quote to disburse **${formattedUsdc}** to **${corridor.name}**:\n\n` +
                             `• **Guaranteed Net Payout:** **${formattedFiat} ${corridor.currency}**\n` +
                             `• **Exchange Rate:** **1 USDC = ${formattedRate}**\n` +
                             `• **Bank / Mobile Rail Fee:** -${formattedFee}\n` +
                             `• **Delivery Channel:** ${corridor.rails}\n` +
                             `• **Settlement Guarantee:** ⚡ **${corridor.sla}**\n\n` +
                             `*Funds disburse directly from Stellar Soroban settlement pools into local clearing rails.*`;
          }

          // 🌟 THE FIX: Semantic Intent Classifier to dynamically route FX cross-border transactions
          const isSendIntent = q.match(/\b(send|pay|transfer|vendor|contractor|team|payroll|salary|supplier)\b/i) && !q.match(/\b(withdraw|cash out|payout|pay out|off-ramp|my bank|my account)\b/i);
          const outboundType = isSendIntent ? "SEND" : "WITHDRAWAL";

          // Uniform Prefill Payload Output
          const actionPayload = isDepositIntent ? {
              type: "DEPOSIT",
              currency: corridor.currency,
              amount: String(parseFloat(usdcAmount.toFixed(2))),
              prefill: {
                  method: (targetCorridor === "KES" || targetCorridor === "GHS") ? "mobile" : "bank",
                  bankCountry: corridor.country,
                  momoCountry: corridor.country,
                  currency: corridor.currency,
                  amount: String(parseFloat(usdcAmount.toFixed(2))),
                  fiatAmount: String(parseFloat(fiatAmount.toFixed(2))),
                  rate: appliedRate
              }
          } : {
              type: outboundType, // 🌟 Routes perfectly to SEND or WITHDRAWAL
              amount: String(parseFloat(usdcAmount.toFixed(2))),
              prefill: {
                  method: (targetCorridor === "KES" || targetCorridor === "GHS") ? "mobile" : "bank",
                  bankCountry: corridor.country,
                  currency: corridor.currency,
                  momoCountry: corridor.country,
                  momoNetwork: targetCorridor === "KES" ? "M-PESA" : "MTN Mobile Money",
                  amount: String(parseFloat(usdcAmount.toFixed(2))),
                  estimatedPayout: String(parseFloat(fiatAmount.toFixed(2))),
                  rate: appliedRate
              }
          };

          return res.json({
              answer: quoteAnswer,
              action: actionPayload,
              suggestions: [
                  isDepositIntent ? "Fund my account" : (isSendIntent ? `Send ${corridor.currency} payment` : `Withdraw to ${corridor.currency} Bank`),
                  `What is the rate for ${targetCorridor === "NGN" ? "KES" : "NGN"}?`,
                  "What's my net cashflow?"
              ]
          });
      }

      // =========================================================================
      // 🧠 LAYER 2.1: PREDICTIVE YIELD & ESCROW RETURN SIMULATOR (DEFINDEX ORACLE)
      // =========================================================================
      const isPredictiveYield = 
        // 🌟 THE FIX: Strictly enforcing word boundaries \b so "generatiON" doesn't trigger "ON"
        q.match(/(?:how much|what|calculate|project|estimate|predict|simulate).*(?:yield|interest|return|earn).*\b(if|will|would|on|for|with)\b/i) ||
        q.match(/(?:how much|what|calculate|project|estimate|predict|simulate).*(?:yield|interest|return|earn).*(?:\$|\b\d+\b|\busdc\b)/i) ||
        q.match(/(?:yield|interest|return).*(?:calculator|projection|estimate|simulation)/i) ||
        q.match(/(?:if i (?:lock|send|deposit|escrow|hold|put)).*(?:how much|what).*(?:yield|earn|interest)/i) ||
        q.match(/(?:what will|what would).*(?:\$|\d+k|\d+m|usdc).*(?:earn|generate|yield)/i);

      const isHistoricalExplicit = 
        q.match(/(?:total|harvested|earned|my|so far|past|historical|already).*(?:yield|interest)/i) ||
        q.match(/(?:yield|interest).*(?:harvested|earned|so far|to date)/i);

      if (isPredictiveYield && !isHistoricalExplicit) {
          // 1. ROBUST MULTI-NOTATION PRINCIPAL EXTRACTION
          let principal = 0;

          // Check for Millions ($1.5M, 2m usdc)
          const millionMatch = workingQuery.match(/(?:\$|usdc)?\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
          // Check for Thousands ($50k, 100k)
          const thousandMatch = workingQuery.match(/(?:\$|usdc)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
          // Check for explicit currency ($50,000, 50000 USDC, 50000 USD)
          const currencyMatch = workingQuery.match(/(?:\$|usdc|usd)\s*([\d,]+(?:\.\d+)?)/i) || 
                                workingQuery.match(/([\d,]+(?:\.\d+)?)\s*(?:usdc|usd|dollars|bucks)/i);
          // General fallback for standalone amounts tied to prepositions
          const prepositionMatch = workingQuery.match(/(?:on|of|deposit|lock|escrow|send|with)\s+([\d,]+(?:\.\d+)?)/i);

          if (millionMatch) {
              principal = parseFloat(millionMatch[1]) * 1000000;
          } else if (thousandMatch) {
              principal = parseFloat(thousandMatch[1]) * 1000;
          } else if (currencyMatch) {
              principal = parseFloat(currencyMatch[1].replace(/,/g, ''));
          } else if (prepositionMatch) {
              principal = parseFloat(prepositionMatch[1].replace(/,/g, ''));
          }

          // 2. TIMEFRAME & DURATION EXTRACTION (Order-Independent)
          let days = 30; // Default 30-day benchmark
          let durationLabel = "30 Days";

          const daysMatch = workingQuery.match(/(\d+)\s*(?:day|days|d)\b/i);
          const weeksMatch = workingQuery.match(/(\d+)\s*(?:week|weeks|w)\b/i);
          const monthsMatch = workingQuery.match(/(\d+)\s*(?:month|months|m)\b/i);
          const yearsMatch = workingQuery.match(/(\d+)\s*(?:year|years|y)\b/i);

          if (daysMatch) {
              days = parseInt(daysMatch[1], 10);
              durationLabel = `${days} Days`;
          } else if (weeksMatch) {
              days = parseInt(weeksMatch[1], 10) * 7;
              durationLabel = `${weeksMatch[1]} Weeks (${days} Days)`;
          } else if (monthsMatch) {
              days = parseInt(monthsMatch[1], 10) * 30;
              durationLabel = `${monthsMatch[1]} Months (${days} Days)`;
          } else if (yearsMatch) {
              days = parseInt(yearsMatch[1], 10) * 365;
              durationLabel = `${yearsMatch[1]} Year(s) (${days} Days)`;
          }

          // 3. APY ORACLE RESOLUTION (User Custom vs. DeFindex Live)
          let { apy, source: apySource } = await getLiveDefindexApy();
          
          const customApyMatch = workingQuery.match(/(\d+(?:\.\d+)?)\s*%\s*(?:apy|interest|rate)?/i);
          if (customApyMatch) {
              apy = parseFloat(customApyMatch[1]) / 100;
              apySource = "Custom User Rate";
          }

          // Slot-filling guide if no principal is detected (Safety net for zero-math errors)
          if (principal <= 0) {
              return res.json({
                  answer: `### 📈 Blink Soroban Yield Simulator\n\nI can calculate your exact yield accrual before you deploy capital or lock an escrow.\n\n• **Current Protocol APY:** **${(apy * 100).toFixed(2)}%** *(${apySource})*\n• **Supported Assets:** USDC / USDT on Stellar Soroban\n\n*Try asking:*\n• *"How much yield will $50,000 earn in 60 days?"*\n• *"Calculate return on 1.5M USDC for 3 months"*`,
                  suggestions: ["Calculate yield on $10,000 for 30 days", "What is my total yield earned?"]
              });
          }

          // 4. PRECISION COMPOUNDING CALCULATIONS (Net of 5% Fee)
          const grossDailyRate = apy / 365;
          const grossTotalYield = principal * (Math.pow(1 + grossDailyRate, days) - 1);
          
          const performanceFeeCut = grossTotalYield * 0.05; // 5% Blink platform cut
          const netTotalYield = grossTotalYield - performanceFeeCut;

          const netDailyEarnings = (principal * grossDailyRate) * 0.95;
          const netMonthlyEarnings = (principal * (Math.pow(1 + grossDailyRate, 30) - 1)) * 0.95;
          const netAnnualizedEarnings = (principal * apy) * 0.95;

          // Formatting
          const formattedPrincipal = principal.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedGrossYield = grossTotalYield.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedNetYield = netTotalYield.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedDaily = netDailyEarnings.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedMonthly = netMonthlyEarnings.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedAnnual = netAnnualizedEarnings.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedApy = (apy * 100).toFixed(2);
          const halfSplit = (netTotalYield / 2).toLocaleString("en-US", { style: 'currency', currency: 'USD' });

          const detailedReport = 
              `### 🔮 Projected Yield Outcome (${formattedApy}% ${apySource})\n\n` +
              `• **Principal Capital:** **${formattedPrincipal}**\n` +
              `• **Escrow Lock Period:** **${durationLabel}**\n` +
              `• **Gross Interest:** ${formattedGrossYield}\n` +
              `• **Net Yield to Treasury (After 5% Cut):** **${formattedNetYield}**\n\n` +
              `---\n\n` +
              `### ⏱️ Accrual Velocity Breakdown\n\n` +
              `| Timeframe | Net Accrued Return | Effective Balance |\n` +
              `| :--- | :--- | :--- |\n` +
              `| **Daily Pace** | +${formattedDaily}/day | ${(principal + netDailyEarnings).toLocaleString("en-US", { style: 'currency', currency: 'USD' })} |\n` +
              `| **30-Day Monthly** | +${formattedMonthly} | ${(principal + netMonthlyEarnings).toLocaleString("en-US", { style: 'currency', currency: 'USD' })} |\n` +
              `| **Full Lock Term (${days}d)** | **+${formattedNetYield}** | **${(principal + netTotalYield).toLocaleString("en-US", { style: 'currency', currency: 'USD' })}** |\n` +
              `| **1-Year Annualized** | +${formattedAnnual} | ${(principal + netAnnualizedEarnings).toLocaleString("en-US", { style: 'currency', currency: 'USD' })} |\n\n` +
              `---\n\n` +
              `### 🤝 Escrow Yield Policy Distribution\n` +
              `• **Sender Retains Yield (Default):** You receive **+${formattedNetYield}** upon settlement.\n` +
              `• **Recipient Incentive:** Recipient receives principal + **${formattedNetYield}** upon claim.\n` +
              `• **50/50 Split:** Both parties receive **+${halfSplit}** each.\n\n` +
              `*Funds remain secured in non-custodial Soroban yield vaults during settlement float.*`;

          return res.json({
              answer: detailedReport,
              suggestions: [`Lock ${formattedPrincipal} in Escrow`, "What's my net cashflow?", "View transactions ledger"]
          });
      }

      // =========================================================================
      // 🧠 LAYER 2.2: HISTORICAL HARVESTED YIELD
      // =========================================================================
      if (isHistoricalExplicit || q.match(/(yield|interest|earned).*(total|earned|how much|my|show|harvested)|(total|how much|my|show|harvested).*(yield|interest)/i)) {
        const yieldResult = await db.select({
          totalYield: sql<number>`COALESCE(SUM(CASE WHEN (${transactions.reference} ILIKE '%\\_yield%' ESCAPE '\\' OR ${transactions.description} ILIKE '%yield harvest%') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`
        })
        .from(transactions)
        .where(
          and(
            userFilter,
            timeFilter,
            inArray(transactions.status, ['completed', 'settled'])
          )
        );

        const totalYield = Number(yieldResult[0].totalYield);
        const formattedYield = totalYield.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
        const timePhrase = timeContext === "all time" ? "so far" : `during ${timeContext}`;

        // 🌟 THE FIX: Dynamic Upsell for Zero-Yield Accounts
        if (totalYield === 0) {
           return res.json({
             answer: `Your idle capital has generated **$0.00** in automated yield ${timePhrase}.\n\n💡 **Treasury Tip:** To start earning, select the **Yield-Bearing Escrow** option when sending your next payment. Your capital will automatically generate interest in secure Soroban vaults during the settlement float!`,
             suggestions: ["Calculate yield on 50k USDC for 30 days", "Send a payment"]
           });
        }

        // Standard response for users who HAVE earned yield
        return res.json({
          answer: `Your idle capital has generated **${formattedYield}** in automated yield ${timePhrase}.`,
          suggestions: ["How does yield auto-harvesting work?", "What's my net cashflow?"]
        });
      }

      // INTENT: Net Cashflow
      if (q.match(/(net flow|cashflow|cash flow|net cashflow)/i)) {
        const result = await db.select({
          totalIn: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('deposit', 'incoming_escrow', 'fiat_deposit') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`
        }).from(transactions).where(and(userFilter, timeFilter, inArray(transactions.status, ['completed', 'settled', 'processing'])));

        const totalIn = Number(result[0].totalIn);
        const totalOut = Number(result[0].totalOut);
        const netFlow = totalIn - totalOut;
        
        const formattedNet = Math.abs(netFlow).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
        const timePhrase = timeContext === "all time" ? "historically" : `for ${timeContext}`;

        if (netFlow > 0) {
          return res.json({ answer: `Your net cashflow is **positive**. You have brought in **${formattedNet}** more than you sent out ${timePhrase}.\n\n* 🟢 (Inflows: $${totalIn.toLocaleString()} | Outflows: $${totalOut.toLocaleString()})*`, suggestions: ["Show my total yield"] });
        } else if (netFlow < 0) {
          return res.json({ answer: `Your net cashflow is **negative** at **-${formattedNet}** ${timePhrase}.\n\n*(Inflows: $${totalIn.toLocaleString()} | Outflows: $${totalOut.toLocaleString()})*`, suggestions: ["How much have I saved in fees?"] });
        } else {
          return res.json({ answer: `Your net cashflow is exactly **$0.00** ${timePhrase}.` });
        }
      }

      // INTENT: Capital Saved (Blink USP)
      if (q.match(/(save|avoid|capital saved|fees saved)/i)) {
        const result = await db.select({
          totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          outflowTxCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN 1 END)`
        }).from(transactions).where(and(userFilter, timeFilter, inArray(transactions.status, ['completed', 'settled'])));

        const estimatedWireFeesAvoided = Number(result[0].outflowTxCount) * 25.00;
        const estimatedFxSpreadAvoided = Number(result[0].totalOut) * 0.01;
        const capitalSaved = estimatedWireFeesAvoided + estimatedFxSpreadAvoided;

        return res.json({
          answer: `By utilizing Blink's stablecoin rails instead of legacy banking, you have avoided an estimated **$${capitalSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** in FX spread and wire fees ${timeContext === "all time" ? "so far" : `during ${timeContext}`}.`,
          suggestions: ["What's my net cashflow?"]
        });
      }

      // =========================================================================
      // 🧠 LAYER 2.3: PREDICTIVE RUNWAY & BURN RATE ANALYTICS
      // =========================================================================
      if (q.match(/(burn rate|runway|how long will (?:my|our|the)?\s*(?:funds|money|balance|capital)?\s*last|when will (?:i|we) run out|survival|burn velocity)/i)) {
        
        // 1. Fetch live balance
        const userRecord = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
        const currentBalance = Number(userRecord[0]?.balance || 0);

        // 2. Calculate rolling 30-day outflow across primary and sub-accounts
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const outflowRes = await db.select({
          totalOut: sql<number>`COALESCE(SUM(CAST(${transactions.amount} AS NUMERIC)), 0)`
        }).from(transactions).where(
          and(
            userFilter, 
            gte(transactions.createdAt, thirtyDaysAgo), 
            inArray(transactions.type, ['payment', 'withdrawal', 'bulk_payment']), 
            inArray(transactions.status, ['completed', 'settled', 'processing'])
          )
        );

        const thirtyDayBurn = Number(outflowRes[0].totalOut);
        const dailyBurnRate = thirtyDayBurn / 30;
        const monthlyBurnRate = thirtyDayBurn;

        // 3. Look ahead: Fetch incoming escrows for user and sub-accounts
        const incomingEscrows = await db.select({
          totalPending: sql<number>`COALESCE(SUM(CAST(${escrows.amountLocked} AS NUMERIC)), 0)`
        }).from(escrows).where(
          and(
            escrowLedgerFilter, // 🛡️ IRON FENCE APPLIED
            inArray(escrows.status, ['active', 'ready', 'locked', 'in_escrow', 'pending'])
          )
        );
        const pendingInflow = Number(incomingEscrows[0].totalPending);
        const effectiveLiquidity = currentBalance + pendingInflow;

        // 🌟 NEW: Determine the user's exact semantic focus
        const askingAboutBurn = q.match(/(burn rate|burn velocity)/i);
        const askingAboutRunway = q.match(/(runway|how long|when will|survival|last)/i);

        let response = `**🛫 Treasury Runway & Burn Rate Analysis**\n\n`;

        // Case A: Unfunded / Depleted Account
        if (currentBalance <= 0 && pendingInflow <= 0) {
          response += `Your treasury currently has **$0.00 in available liquidity** and no incoming escrows scheduled.\n\n`;
          response += `• **Burn Rate:** $0.00/day\n`;
          response += `• **Status:** 🔴 **DEPLETED** — Please fund your account or create an incoming payment request to establish operational runway.`;
          return res.json({
            answer: response,
            suggestions: ["Fund my account", "Create a Payment Request"]
          });
        }

        // Case B: Zero Outbound Spend (Infinite Runway)
        if (thirtyDayBurn === 0) {
          if (askingAboutBurn && !askingAboutRunway) {
            response += `Great news! You have **$0.00 in outbound spending** over the trailing 30 days. Your burn velocity is currently zero.\n\n`;
          } else {
            response += `You have **$0.00 in outbound spending** over the trailing 30 days. With a zero burn velocity, your current balance has an **unlimited operational runway**.\n\n`;
          }
          
          response += `• **Available Liquid Balance:** ${currentBalance.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}`;
          if (pendingInflow > 0) {
            response += `\n• **Locked Incoming Escrows:** +${pendingInflow.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}`;
            response += `\n• **Total Effective Capital:** **${effectiveLiquidity.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}**`;
          }
          return res.json({
            answer: response,
            suggestions: ["What's my net cashflow?", "Calculate yield on 50k USDC"]
          });
        }

        // Case C: Active Spend Velocity Forecasting
        const runwayDays = Math.max(0, Math.floor(currentBalance / dailyBurnRate));
        const effectiveRunwayDays = Math.max(0, Math.floor(effectiveLiquidity / dailyBurnRate));
        const runwayMonths = (runwayDays / 30).toFixed(1);
        
        const safetyIndicator = runwayDays < 30 ? '🔴 **CRITICAL:**' : runwayDays < 90 ? '🟡 **WARNING:**' : '🟢 **HEALTHY:**';

        // 🌟 NEW: Dynamic Introduction based on user intent
        if (askingAboutBurn && !askingAboutRunway) {
            response += `Let's break down your capital outflow. Based on your trailing 30-day activity, your treasury is currently burning **${monthlyBurnRate.toLocaleString("en-US", { style: 'currency', currency: 'USD' })} per month**.\n\n`;
        } else if (askingAboutRunway && !askingAboutBurn) {
            response += `Based on your current spend velocity of ${dailyBurnRate.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}/day, your treasury has approximately **${runwayDays} days** (~${runwayMonths} months) of liquid runway remaining.\n\n`;
        } else {
            response += `Here is your complete treasury survival analysis, combining your current burn velocity with your available liquidity:\n\n`;
        }
        
        response += `**Velocity Metrics:**\n`;
        response += `• **Monthly Burn Rate:** ${monthlyBurnRate.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}/mo\n`;
        response += `• **Average Daily Spend:** ${dailyBurnRate.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}/day\n\n`;

        response += `**Liquidity Breakdown:**\n`;
        response += `• **Current Liquid Balance:** ${currentBalance.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}\n`;
        
        if (pendingInflow > 0) {
          response += `• **Incoming Escrow Float:** +${pendingInflow.toLocaleString("en-US", { style: 'currency', currency: 'USD' })}\n`;
          response += `• **Effective Runway (Post-Settlement):** **${effectiveRunwayDays} days**\n\n`;
        } else {
          response += `\n`;
        }

        response += `${safetyIndicator} At your current burn rate of $${dailyBurnRate.toFixed(2)}/day, your available balance will reach $0.00 in **${runwayDays} days**.`;

        return res.json({ 
          answer: response, 
          suggestions: ["What's my net cashflow?", "How much did I spend this month?"] 
        });
      }

      // =========================================================================
      // 🧠 LAYER 2.4: CONSOLIDATED TREASURY STATEMENT & LEDGER ACTIVITY
      // CFO-Grade single source of truth for overall account activity.
      // =========================================================================
      const statementMatch = workingQuery.match(/(?:show|what is|whats|what's|get|generate|pull|review).*(?:my|our|the)?\s*(?:transaction history|ledger|account activity|statement|treasury report|financial summary|activity)/i);

      if (statementMatch) {
          // 1. Strict Temporal Bounding Box
          let timeframeLabel = "All Time";
          let startCutoff: Date | null = null;
          let endCutoff: Date | null = null;

          const utcNow = new Date();
          const userLocalNow = new Date(utcNow.getTime() - (safeTzOffset * 60000));
          const currentYear = userLocalNow.getUTCFullYear();
          const currentMonth = userLocalNow.getUTCMonth();
          const currentDate = userLocalNow.getUTCDate();
          const currentDayOfWeek = userLocalNow.getUTCDay();

          if (q.includes("this month")) {
            timeframeLabel = "This Month";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59));
          } else if (q.includes("last month")) {
            timeframeLabel = "Last Month";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59));
          } else if (q.includes("this week")) {
            timeframeLabel = "This Week";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate + (6 - currentDayOfWeek), 23, 59, 59));
          } else if (q.includes("last week")) {
            timeframeLabel = "Last Week";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek - 7, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - currentDayOfWeek - 1, 23, 59, 59));
          } else if (q.includes("today")) {
            timeframeLabel = "Today";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59));
          } else if (q.includes("yesterday")) {
            timeframeLabel = "Yesterday";
            startCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 23, 59, 59));
          } else if (q.includes("this year")) {
            timeframeLabel = "This Year";
            startCutoff = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59));
          } else if (q.includes("last year")) {
            timeframeLabel = "Last Year";
            startCutoff = new Date(Date.UTC(currentYear - 1, 0, 1, 0, 0, 0));
            endCutoff = new Date(Date.UTC(currentYear - 1, 11, 31, 23, 59, 59));
          }

          // Robust preposition and specific date extraction
          const specificDateMatch = q.match(/(?:on|for|from)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i);
          if (specificDateMatch && !startCutoff) {
              const monthStr = specificDateMatch[1].toLowerCase();
              const dayInt = parseInt(specificDateMatch[2], 10);
              const yearInt = specificDateMatch[3] ? parseInt(specificDateMatch[3], 10) : currentYear;

              const monthMap: Record<string, number> = {
                  "jan": 0, "january": 0, "feb": 1, "february": 1, "mar": 2, "march": 2,
                  "apr": 3, "april": 3, "may": 4, "jun": 5, "june": 5, "jul": 6, "july": 6,
                  "aug": 7, "august": 7, "sep": 8, "september": 8, "oct": 9, "october": 9,
                  "nov": 10, "november": 10, "dec": 11, "december": 11
              };
              const targetMonth = monthMap[monthStr] || currentMonth;

              timeframeLabel = `${specificDateMatch[1].charAt(0).toUpperCase() + specificDateMatch[1].slice(1)} ${dayInt}, ${yearInt}`;
              startCutoff = new Date(Date.UTC(yearInt, targetMonth, dayInt, 0, 0, 0));
              endCutoff = new Date(Date.UTC(yearInt, targetMonth, dayInt, 23, 59, 59));
          }

          if (startCutoff) startCutoff = new Date(startCutoff.getTime() + (safeTzOffset * 60000));
          if (endCutoff) endCutoff = new Date(endCutoff.getTime() + (safeTzOffset * 60000));

          // 2. 🌟 ULTIMATE SECURITY FIX: Offload all math to Postgres C-Engine to prevent RAM crashes
          const queryConditions = [
              txLedgerFilter, // 🛡️ IRON FENCE APPLIED
              // 🌟 DB FIX 1: Enforce LOWER() on the master query to prevent case-sensitive Postgres omissions
              sql`LOWER(${transactions.status}) IN ('completed', 'settled', 'processing', 'failed', 'cancelled', 'canceled', 'error', 'declined', 'refunded', 'claim_canceled', 'claim_completed', 'pending', 'locked', 'active', 'in_escrow')`
          ];

          if (startCutoff && endCutoff) {
              queryConditions.push(gte(transactions.createdAt, startCutoff));
              queryConditions.push(lte(transactions.createdAt, endCutoff));
          }

          // Execute parallel optimized SQL aggregations
          const [aggregates, topTxsData] = await Promise.all([
              db.select({
                  totalCount: sql<number>`COUNT(*)`,
                  
                  // 🌟 DB FIX 2: Wrap all status checks in LOWER() for case-insensitive perfection
                  failedCount: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${transactions.status}) IN ('failed', 'error', 'cancelled', 'canceled', 'declined', 'refunded', 'claim_canceled') THEN 1 ELSE 0 END), 0)`,
                  
                  // 🌟 DB FIX 3: Added 'refund' and 'reversal' to inflow logic so balance sheets perfectly reconcile
                  inflowVolume: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${transactions.status}) NOT IN ('failed', 'error', 'cancelled', 'canceled', 'declined', 'claim_canceled') AND LOWER(${transactions.type}) IN ('deposit', 'incoming_escrow', 'fiat_deposit', 'refund', 'reversal') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
                  
                  // 🌟 DB FIX 4: Added 'fee', 'charge', and pending escrows to outflow logic to capture all liquidity leaving balance
                  outflowVolume: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${transactions.status}) NOT IN ('failed', 'error', 'cancelled', 'canceled', 'declined', 'refunded', 'claim_canceled') AND LOWER(${transactions.type}) IN ('payment', 'bulk_payment', 'transfer', 'escrow', 'fee', 'charge') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
                  
                  withdrawalVolume: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${transactions.status}) NOT IN ('failed', 'error', 'cancelled', 'canceled', 'declined', 'refunded', 'claim_canceled') AND LOWER(${transactions.type}) = 'withdrawal' THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`
              }).from(transactions).where(and(...queryConditions)),
              
              db.select()
                .from(transactions)
                .where(and(...queryConditions))
                .orderBy(desc(transactions.createdAt))
                .limit(6) // Fetch 6 just to know if there are "more" to show
          ]);

          const agg = aggregates[0];
          const totalTxsCount = Number(agg.totalCount);
          const failedTxsCount = Number(agg.failedCount);

          if (totalTxsCount === 0) {
              return res.json({
                  answer: `You have **0** transactions recorded for **${timeframeLabel}**.\n\nYour consolidated ledger is currently empty for this period. Would you like to create a payment request or fund your treasury to begin?`,
                  suggestions: ["Fund my account", "Create a Payment Request"]
              });
          }

          // 3. Extract mathematically perfect Postgres metrics
          const totalInflow = Number(agg.inflowVolume);
          const withdrawalVolume = Number(agg.withdrawalVolume);
          const totalOutflow = Number(agg.outflowVolume) + withdrawalVolume; // Add withdrawals to total outflows
          
          const netDelta = totalInflow - totalOutflow;
          const totalVolume = totalInflow + totalOutflow;

          const formattedInflow = totalInflow.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedOutflow = totalOutflow.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedWithdrawals = withdrawalVolume.toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedNet = Math.abs(netDelta).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const formattedTotal = totalVolume.toLocaleString("en-US", { style: 'currency', currency: 'USD' });

          const netIndicator = netDelta > 0 ? "🟢 **POSITIVE**" : netDelta < 0 ? "🔴 **NEGATIVE**" : "⚪ **NEUTRAL**";
          const netSign = netDelta > 0 ? "+" : netDelta < 0 ? "-" : "";

          // 4. Generate Itemized Logs (Render top 5 cleanly)
          const displayTxs = topTxsData.slice(0, 5);
          const itemizedLogs = displayTxs.map((tx: any) => {
              const rawDate = tx.createdAt || tx.date || new Date();
              const localTxDate = new Date(new Date(rawDate).getTime() - (safeTzOffset * 60000));
              const formattedDate = localTxDate.toLocaleString("en-US", { timeZone: 'UTC', month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
              const txAmount = Number(tx.amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
              const status = String(tx.status || "COMPLETED").toUpperCase();
              const type = String(tx.type).toUpperCase();
              
              const directionIcon = ['deposit', 'incoming_escrow', 'fiat_deposit', 'refund', 'reversal'].includes(String(tx.type).toLowerCase()) ? "📥" : "📤";
              
              let displayIcon = directionIcon;
              if (['failed', 'error', 'cancelled', 'canceled', 'declined', 'refunded', 'claim_canceled'].includes(String(tx.status).toLowerCase())) {
                  displayIcon = "❌";
              } else if (['pending', 'processing', 'locked', 'active', 'in_escrow'].includes(String(tx.status).toLowerCase())) {
                  displayIcon = "⏳";
              }

              return `${displayIcon} **${txAmount}** (${type}) — ${status}\n  📅 ${formattedDate} | Ref: \`${tx.reference || tx.id}\``;
          }).join("\n\n");

          let answer = `**📑 Consolidated Treasury Statement (${timeframeLabel.toUpperCase()})**\n\n`;
          
          if (timeframeLabel === "Today") {
              answer = `Here is your real-time liquidity and transaction activity for **Today**:\n\n`;
          } else {
              answer = `Here is your consolidated treasury and working capital report for **${timeframeLabel}**:\n\n`;
          }

          answer += 
              `**Working Capital Insights:**\n` +
              `• **Net Liquidity Delta:** ${netIndicator} (${netSign}${formattedNet})\n` +
              `• **Total Volume Processed:** **${formattedTotal}**\n` +
              `• **Success Rate:** ${totalTxsCount - failedTxsCount}/${totalTxsCount} Transactions\n\n` +
              `---\n\n` +
              `**Categorized Flow Breakdown:**\n` +
              `• 📥 **Inflows (Deposits/Receivables):** **${formattedInflow}**\n` +
              `• 📤 **Outflows (Payments/Transfers):** **${formattedOutflow}**\n` +
              `  *(Includes **${formattedWithdrawals}** in off-ramp withdrawals)*\n\n` +
              `---\n\n` +
              `**Recent Itemized Records:**\n\n` +
              `${itemizedLogs}\n\n`;
              
          if (totalTxsCount > 5) {
              answer += `*+ ${totalTxsCount - 5} more transactions. Click "View transactions ledger" for the full list.*`;
          }

          return res.json({
              answer: answer,
              suggestions: ["View transactions ledger", "What is my burn rate?", "Export ledger to CSV"]
          });
      }

      // =========================================================================
      // 🧠 LAYER 2.5: TREND & MULTI-PERIOD ANALYSIS (Month-over-Month)
      // =========================================================================
      // 🌟 THE FIX: Removed 'history' from this regex to prevent it from stealing statement queries
      if (q.match(/(compare|trend|month over month|6 months|swings|historical performance)/i)) {
        const sixMonthsAgo = new Date(Date.UTC(userLocalTime.getUTCFullYear(), userLocalTime.getUTCMonth() - 5, 1, 0, 0, 0, 0));
        sixMonthsAgo.setTime(sixMonthsAgo.getTime() + (safeTzOffset * 60000));

        const monthlyData = await db.select({
          monthName: sql<string>`TO_CHAR(DATE_TRUNC('month', ${transactions.createdAt}), 'Mon YYYY')`,
          inflow: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'deposit' THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          outflow: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`
        })
        .from(transactions)
        .where(and(userFilter, inArray(transactions.status, ['completed', 'settled']), gte(transactions.createdAt, sixMonthsAgo)))
        .groupBy(sql`DATE_TRUNC('month', ${transactions.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${transactions.createdAt})`);

        if (monthlyData.length === 0) {
           return res.json({ answer: "I don't have enough transaction history in your ledger to run a multi-month trend analysis yet.", suggestions: ["How much did I spend this week?"] });
        }

        let narrative = "Like most financial ledgers, I don't store historical daily balance snapshots, but I can break down your **cash flow trends over the last 6 months:**\n\n";
        monthlyData.forEach((row: any) => {
          const inFormatted = Number(row.inflow).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const outFormatted = Number(row.outflow).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const net = Number(row.inflow) - Number(row.outflow);
          const netFormatted = Math.abs(net).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const trendIcon = net >= 0 ? "🟢" : "🔴";
          const trendText = net >= 0 ? `+${netFormatted}` : `-${netFormatted}`;
          narrative += `• **${row.monthName}:** ${trendIcon} ${trendText} Net\n  *(In: ${inFormatted} | Out: ${outFormatted})*\n`;
        });

        return res.json({ answer: narrative, suggestions: ["What is my net cash flow this month?", "How many transactions did I do today?"] });
      }


        // =========================================================================
      // 🧠 LAYER 2.8: AGENTIC EXPORTS & TAX REPORTS
      // =========================================================================
      if (q.match(/(export|download|generate|send me).*(csv|excel|spreadsheet|pdf|report|statement|ledger|history)/i)) {
        const format = q.includes("pdf") ? "pdf" : "csv";
        
        let timeframe = "all";
        if (q.includes("this month")) timeframe = "this_month";
        else if (q.includes("last month")) timeframe = "last_month";
        else if (q.includes("this year")) timeframe = "this_year";
        else if (q.includes("today")) timeframe = "today";

        const label = timeframe.replace('_', ' ').toUpperCase();

        return res.json({
          answer: `I am generating your **${label}** treasury statement in **${format.toUpperCase()}** format. Your download should start automatically in a moment.`,
          suggestions: ["What's my net cashflow?", "How much did I spend this month?"],
          action: { type: "EXPORT_DOCUMENT", format, timeframe } // Triggers the frontend Generator
        });
      }
        
        
        
      // =========================================================================
      // 🧠 LAYER 3: DYNAMIC LEDGER QUANT (Recipients, Volumes, Counts)
      // =========================================================================
      const spendMatchAmount = workingQuery.match(/(how much|total)(?: did we| did i)? (pay|paid|send|sent|spend on|spent on)(?: to)? ([a-z0-9\s.,'&@\-_()[\]*+\u00C0-\u017F]+)/i);
      if (spendMatchAmount) {
        let recipient = spendMatchAmount[3].trim().replace(/(this month|last month|this year|today|yesterday|this week|recently|lately|\?)/g, '').trim();
        if (recipient.length > 1) {
          const safeSqlRecipient = recipient.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
          const result = await db.select({
            total: sql<number>`COALESCE(SUM(${safeAmountSql}), 0)`,
            count: sql<number>`COUNT(*)`
          }).from(transactions).where(
            and(userFilter, timeFilter, sql`${transactions.description} ILIKE ${'%' + safeSqlRecipient + '%'} ESCAPE '\\'`, 
            or(eq(transactions.type, 'payment'), eq(transactions.type, 'withdrawal'), eq(transactions.type, 'bulk_payment')),
            inArray(transactions.status, ['completed', 'settled', 'processing']))
          );

          if (Number(result[0].count) === 0) {
            return res.json({ 
              answer: `I couldn't find any completed payments to "**${recipient}**" ${timeContext === 'all time' ? 'in your ledger' : timeContext}.`,
              suggestions: ["How many total transactions did we do?"]
            });
          }
          const total = Number(result[0].total).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
          const timePhrase = timeContext === "all time" ? "in total" : `for ${timeContext}`;
          return res.json({ answer: `You have paid **${recipient}** a total of **${total}** ${timePhrase} across ${result[0].count} transactions.`, suggestions: [] });
        }
      }

      // 🌟 THE FIX: Added "withdrawn", "deposited", "paid", and "sent" to the allowed vocabulary
      if (!isComplianceQuery && !isFeeQuery && q.match(/(how many|how much|total|sum|what is my|whats my|what's my).*(transaction|tx|payment|pay|paid|spend|spent|send|sent|transfer|transferred|deposit|deposited|withdraw|withdrawn|withdrawal|escrow|money|received|inflow|outflow)/i)) {
        let typeFilter = undefined;
        let actionWord = "transactions";
        let statusFilter = undefined;
        
        // 🌟 CFO ADDITION: Allow status-based transaction counting ("how many failed transactions")
        const specificStatusMatch = q.match(/(failed|pending|processing|completed|settled|cancelled|canceled|rejected)/i);
        if (specificStatusMatch) {
            let s = specificStatusMatch[1].toLowerCase();
            if (s === 'canceled') s = 'cancelled';
            statusFilter = eq(transactions.status, s);
            actionWord = `${s} ${actionWord}`;
        }

        if (q.match(/(deposit|receive|inflow)/i)) {
          typeFilter = inArray(transactions.type, ['deposit', 'incoming_escrow']);
          actionWord = statusFilter ? actionWord.replace("transactions", "inflows") : "inflows";
        } else if (q.match(/(withdraw|off-ramp)/i)) {
          typeFilter = eq(transactions.type, 'withdrawal');
          actionWord = statusFilter ? actionWord.replace("transactions", "withdrawals") : "withdrawals";
        } else if (q.match(/(pay|send|spent|outflow)/i)) {
          typeFilter = inArray(transactions.type, ['payment', 'bulk_payment']);
          actionWord = statusFilter ? actionWord.replace("transactions", "payments") : "payments";
        } else if (q.match(/(escrow)/i)) {
          typeFilter = eq(transactions.type, 'escrow');
          actionWord = statusFilter ? actionWord.replace("transactions", "escrows") : "escrows";
        }

        const conditions = and(
          userFilter, 
          timeFilter, 
          ...(typeFilter ? [typeFilter] : []), 
          ...(statusFilter ? [statusFilter] : [])
        );

        const result = await db.select({ 
          count: sql<number>`COUNT(*)`,
          total: sql<number>`COALESCE(SUM(${safeAmountSql}), 0)`
        }).from(transactions).where(conditions);

        const count = Number(result[0].count);
        const total = Number(result[0].total).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
        const timePhrase = timeContext === "all time" ? "in total" : timeContext;

        if (count === 0) return res.json({ answer: `You have **0** ${actionWord} recorded ${timePhrase === 'in total' ? 'on your account' : timePhrase}.`, suggestions: ["How do I fund my account?"] });
        return res.json({ answer: `You have initiated **${count}** ${actionWord} ${timePhrase}, totaling **${total}**.`, suggestions: ["What's my net cashflow?"] });
      }


      // ==================================================================================================
      // 🧠 LAYER 3.2: UNIVERSAL SCHEMA-COMPLETE AUDITOR (Deep Multi-Variable Search)
      // Fully wired to transactions, escrows, sub-accounts, payment requests, and dual fiat/crypto columns
      // ==================================================================================================
      
      const targetStatusMatch = q.match(/(failed|pending|processing|locked|completed|settled|error|declined|refunded|cancelled|canceled|claimed|funded|paused|in progress|successful|reversed|open)/i);
      const hasAmountCondition = q.match(/(over|under|greater than|less than|more than|above|below|>|<)\s*(?:\$|usdc|usd|ngn|kes|ghs|zar)?\s*([\d,]+(?:\.\d+)?)/i);
      const isSearchIntent = q.match(/^(show|find|list|get|which|what|are there|do i have|search|pull|fetch|track|audit)/i);
      const isEntitySpecific = q.match(/(escrow|contract|payment|transfer|spend|deposit|inflow|withdrawal|off-ramp|request|invoice|ledger)/i);

      // 🌟 THE FIX: The Conceptual Guard. If the user asks a high-level question (and doesn't use 'my/our'), bypass the audit and send to the LLM.
      const isConceptualQueryAudit = q.match(/\b(what is|what's|whats|what are|explain|why|how|define|manage|solve|difference|versus|vs|compare)\b/i) && !q.match(/\b(my|our)\b/i);

      if (isSearchIntent && !isConceptualQueryAudit && (targetStatusMatch || hasAmountCondition || (isEntitySpecific && timeContext !== "all time") || isEntitySpecific)) {
          
          // 1. Precise Entity Resolution
          let entityType = 'transaction'; 
          if (q.match(/(escrow|contract|milestone|locked fund|claim|release)/i)) entityType = 'escrow';
          else if (q.match(/(payment request|invoice|bill request)/i)) entityType = 'payment_request';
          else if (q.match(/(payment|transfer|spend|outflow|disbursement|payout)/i)) entityType = 'payment';
          else if (q.match(/(deposit|inflow|receive|top up)/i)) entityType = 'deposit';
          else if (q.match(/(withdraw|off-ramp|cash out)/i)) entityType = 'withdrawal';

          // 2. Comprehensive Status Mapping 
          let targetStatus: string[] = [];
          if (q.match(/(failed|error|declined)/i)) targetStatus = ['failed', 'declined', 'error'];
          else if (q.match(/(pending|processing|waiting|in progress)/i)) targetStatus = ['pending', 'processing', 'in_progress'];
          // 🌟 FIX: Added 'claim_completed' to completed states
          else if (q.match(/(completed|settled|successful)/i)) targetStatus = ['completed', 'settled', 'success', 'claim_completed'];
          // 🌟 FIX: Handle 'unlocked' before 'locked' to prevent substring collision
          else if (q.match(/(unlocked|released|claimable)/i)) targetStatus = ['active', 'ready', 'claim_completed', 'claimed'];
          // 🌟 FIX: Strict word boundary so 'unlocked' doesn't trigger 'locked'
          else if (q.match(/\b(?<!un)locked\b|in escrow|funded/i)) targetStatus = ['locked', 'funded', 'pending', 'active']; 
          // 🌟 FIX: Added 'claim_completed' explicitly to claimed matches
          else if (q.match(/(claimed|claim completed)/i)) targetStatus = ['claimed', 'completed', 'claim_completed']; 
          else if (q.match(/(refunded|reversed|cancelled|canceled)/i)) targetStatus = ['refunded', 'cancelled', 'canceled', 'claim_canceled']; 
          else if (q.match(/(paused)/i)) targetStatus = ['paused'];
          else if (q.match(/(open|unpaid)/i)) targetStatus = ['open', 'pending'];

          // 3. Amount & Currency Threshold Parsing
          let amountGreaterThan: number | null = null;
          let amountLessThan: number | null = null;
          let isFiatThreshold = false;
          let requestedCurrency = "USD"; 

          const fiatMatch = q.match(/\b(ngn|naira|kes|shillings|ghs|cedis|zar)\b/i);
          if (fiatMatch) {
            isFiatThreshold = true;
            requestedCurrency = fiatMatch[1].toUpperCase();
            if (requestedCurrency === 'NAIRA') requestedCurrency = 'NGN';
            if (requestedCurrency === 'SHILLINGS') requestedCurrency = 'KES';
            if (requestedCurrency === 'CEDIS') requestedCurrency = 'GHS';
          }

          const overMatch = workingQuery.match(/(?:over|greater than|more than|>|above)\s*(?:\$|usdc|usd|ngn|kes|ghs|zar)?\s*([\d,]+(?:\.\d+)?)/i);
          if (overMatch) amountGreaterThan = parseFloat(overMatch[1].replace(/,/g, ''));

          const underMatch = workingQuery.match(/(?:under|less than|<|below)\s*(?:\$|usdc|usd|ngn|kes|ghs|zar)?\s*([\d,]+(?:\.\d+)?)/i);
          if (underMatch) amountLessThan = parseFloat(underMatch[1].replace(/,/g, ''));

          let conditionLabels = [];
          if (targetStatusMatch) conditionLabels.push(`**${targetStatusMatch[1].toUpperCase()}**`);
          if (amountGreaterThan !== null) conditionLabels.push(`over **${amountGreaterThan.toLocaleString()} ${requestedCurrency}**`);
          if (amountLessThan !== null) conditionLabels.push(`under **${amountLessThan.toLocaleString()} ${requestedCurrency}**`);
          
          let filterDescription = conditionLabels.length > 0 ? conditionLabels.join(" and ") : "all";
          const timePhrase = timeContext === "all time" ? "in your records" : `for **${timeContext}**`;
          const entityLabel = entityType.replace('_', ' ') + 's';

          const explorerNetwork = process.env.NODE_ENV === 'production' ? 'public' : 'testnet';

          // =========================================================================
          // PATH A: SMART CONTRACT ESCROWS 
          // =========================================================================
          if (entityType === 'escrow') {
              let escrowConditions = [
                  escrowLedgerFilter, // 🛡️ IRON FENCE APPLIED
                  and(gte(escrows.createdAt, startDate), lte(escrows.createdAt, endDate))
              ];
              
              if (targetStatus.length > 0) escrowConditions.push(inArray(escrows.status, targetStatus));
              if (amountGreaterThan !== null) escrowConditions.push(sql`CAST(${escrows.amountLocked} AS NUMERIC) > ${amountGreaterThan}`);
              if (amountLessThan !== null) escrowConditions.push(sql`CAST(${escrows.amountLocked} AS NUMERIC) < ${amountLessThan}`);
              if (isFiatThreshold) escrowConditions.push(sql`UPPER(${escrows.currency}) = ${requestedCurrency}`);

              // 🌟 FINAL FIX: Escrow Drizzle Aggregation to prevent .limit(10) truncation bugs
              const [escResults, aggResult] = await Promise.all([
                  db.select().from(escrows).where(and(...escrowConditions)).orderBy(desc(escrows.createdAt)).limit(10),
                  db.select({ 
                      count: sql<number>`COUNT(*)`, 
                      total: sql<number>`COALESCE(SUM(CAST(${escrows.amountLocked} AS NUMERIC)), 0)` 
                  }).from(escrows).where(and(...escrowConditions))
              ]);
              
              const totalMatches = Number(aggResult[0].count);

              if (totalMatches === 0) {
                  return res.json({
                      answer: `I audited your smart contracts, but I couldn't find any ${filterDescription} escrows ${timePhrase}.`,
                      suggestions: ["Show my recent transactions", "How do I create a secure escrow?"]
                  });
              }

              const itemizedLogs = escResults.map((esc: any) => {
                  const dateStr = new Date(esc.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const amt = Number(esc.amountLocked).toLocaleString("en-US", { 
                      style: isFiatThreshold ? undefined : "currency", 
                      currency: isFiatThreshold ? undefined : "USD" 
                  }) + (isFiatThreshold ? ` ${requestedCurrency}` : "");
                  
                  const stat = String(esc.status).toUpperCase();
                  const role = esc.creatorId === userId ? "Sender" : "Recipient";
                  
                  let logStr = `• **${amt}** (${stat}) — Ref: \`${esc.id || esc.claimId}\`\n  📅 ${dateStr} | 👤 ${esc.recipientEmail || 'External'} | 🏷️ Role: ${role}`;

                  if (esc.contractId && esc.contractId.startsWith('C') && esc.contractId.length === 56 && !esc.contractId.includes('MOCK')) {
                      const expertUrl = `https://stellar.expert/explorer/${explorerNetwork}/contract/${esc.contractId}`;
                      const yieldMap: Record<string, string> = { "sender": "Sender Retains", "recipient": "Recipient Earns", "split": "50/50 Split" };
                      const policy = yieldMap[esc.yieldRecipient?.toLowerCase() || "split"] || "Split";
                      logStr += `\n  🏦 **Vault Contract:** [\`${esc.contractId.substring(0, 8)}...${esc.contractId.substring(48)}\`](${expertUrl}) | Yield: ${policy}`;
                  }

                  const finalHash = esc.claimHash || esc.blockchainClaimHash;
                  if (finalHash && finalHash.length > 20 && !finalHash.includes('MOCK')) {
                      const txUrl = `https://stellar.expert/explorer/${explorerNetwork}/tx/${finalHash}`;
                      logStr += `\n  ⛓️ **Settlement Tx:** [\`${finalHash.substring(0, 8)}...${finalHash.substring(finalHash.length - 6)}\`](${txUrl})`;
                  }

                  return logStr;
              }).join("\n\n");

              const sumVolume = Number(aggResult[0].total).toLocaleString("en-US", { 
                  style: isFiatThreshold ? undefined : "currency", 
                  currency: isFiatThreshold ? undefined : "USD" 
              }) + (isFiatThreshold ? ` ${requestedCurrency}` : "");

              let introMsg = `### 🔍 Soroban Smart Contract Audit\n\nI found **${totalMatches}** ${filterDescription} escrows ${timePhrase}, totaling **${sumVolume}**.\n\n`;
              if (totalMatches > 10) introMsg += `*Showing the 10 most recent records:*\n\n`;

              return res.json({ answer: introMsg + itemizedLogs, suggestions: ["What's my net cashflow?", "Calculate yield on 50k USDC"] });

          // =========================================================================
          // PATH B: PAYMENT REQUESTS 
          // =========================================================================
          } else if (entityType === 'payment_request') {
              let prConditions = [
                  prLedgerFilter, // 🛡️ IRON FENCE APPLIED
                  and(gte(paymentRequests.createdAt, startDate), lte(paymentRequests.createdAt, endDate))
              ];

              const prAmountCol = isFiatThreshold ? paymentRequests.fiatAmount : paymentRequests.amount;

              if (targetStatus.length > 0) prConditions.push(inArray(paymentRequests.status, targetStatus));
              if (amountGreaterThan !== null) prConditions.push(sql`CAST(${prAmountCol} AS NUMERIC) > ${amountGreaterThan}`);
              if (amountLessThan !== null) prConditions.push(sql`CAST(${prAmountCol} AS NUMERIC) < ${amountLessThan}`);
              if (isFiatThreshold) prConditions.push(sql`UPPER(${paymentRequests.fiatCurrency}) = ${requestedCurrency}`);

              const [prResults, aggResult] = await Promise.all([
                  db.select().from(paymentRequests).where(and(...prConditions)).orderBy(desc(paymentRequests.createdAt)).limit(10),
                  db.select({ count: sql<number>`COUNT(*)`, total: sql<number>`COALESCE(SUM(CAST(${prAmountCol} AS NUMERIC)), 0)` }).from(paymentRequests).where(and(...prConditions))
              ]);

              const totalMatches = Number(aggResult[0].count);
              const sumVolume = Number(aggResult[0].total).toLocaleString("en-US", { 
                  style: isFiatThreshold ? undefined : 'currency', 
                  currency: isFiatThreshold ? undefined : 'USD' 
              }) + (isFiatThreshold ? ` ${requestedCurrency}` : "");

              if (totalMatches === 0) {
                return res.json({
                  answer: `I checked your billing records, but couldn't find any ${filterDescription} payment requests ${timePhrase}.`,
                  suggestions: ["Create a Payment Request", "Show my recent transactions"]
                });
              }

              const itemizedLogs = prResults.map((pr: any) => {
                const dateStr = new Date(pr.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                const amt = isFiatThreshold ? Number(pr.fiatAmount).toLocaleString() + ` ${pr.fiatCurrency}` : Number(pr.amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
                const stat = String(pr.status).toUpperCase();
                return `• **${amt}** (${stat}) — Ref: \`${pr.reference}\`\n  📅 ${dateStr} | 👤 Payer: ${pr.payerEmail || 'Direct Link'}`;
              }).join("\n\n");

              let introMsg = `### 📑 Payment Requests Audit\n\nI found **${totalMatches}** ${filterDescription} requests ${timePhrase}, totaling **${sumVolume}**.\n\n`;
              if (totalMatches > 10) introMsg += `*Showing the 10 most recent records:*\n\n`;

              return res.json({ answer: introMsg + itemizedLogs, suggestions: ["Create a Payment Request", "What's my net cashflow?"] });

          // =========================================================================
          // PATH C: TRANSACTIONS & TRANSFERS 
          // =========================================================================
          } else {
              let txConditions = [
                txLedgerFilter, // 🛡️ IRON FENCE APPLIED
                and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate))
              ];
              
              if (entityType === 'payment') txConditions.push(inArray(transactions.type, ['payment', 'bulk_payment', 'transfer']));
              if (entityType === 'deposit') txConditions.push(inArray(transactions.type, ['deposit', 'incoming_escrow', 'fiat_deposit']));
              if (entityType === 'withdrawal') txConditions.push(eq(transactions.type, 'withdrawal'));
              
              if (targetStatus.length > 0) txConditions.push(inArray(transactions.status, targetStatus));

              const amountCol = isFiatThreshold ? transactions.fiatAmount : transactions.amount;
              if (amountGreaterThan !== null) txConditions.push(sql`CAST(${amountCol} AS NUMERIC) > ${amountGreaterThan}`);
              if (amountLessThan !== null) txConditions.push(sql`CAST(${amountCol} AS NUMERIC) < ${amountLessThan}`);
              if (isFiatThreshold) txConditions.push(sql`UPPER(${transactions.fiatCurrency}) = ${requestedCurrency}`);

              const [txResults, aggResult] = await Promise.all([
                  db.select().from(transactions).where(and(...txConditions)).orderBy(desc(transactions.createdAt)).limit(10),
                  db.select({ count: sql<number>`COUNT(*)`, total: sql<number>`COALESCE(SUM(CAST(${amountCol} AS NUMERIC)), 0)` }).from(transactions).where(and(...txConditions))
              ]);

              const totalMatches = Number(aggResult[0].count);
              const sumVolume = Number(aggResult[0].total).toLocaleString("en-US", { 
                  style: isFiatThreshold ? undefined : 'currency', 
                  currency: isFiatThreshold ? undefined : 'USD' 
              }) + (isFiatThreshold ? ` ${requestedCurrency}` : "");

              if (totalMatches === 0) {
                  return res.json({
                      answer: `I audited your ledger, but I couldn't find any ${filterDescription} ${entityLabel} ${timePhrase}.`,
                      suggestions: ["Show my recent transactions", "What's my net cashflow?"]
                  });
              }

              const itemizedLogs = txResults.map((tx: any) => {
                  const dateStr = new Date(tx.createdAt || (tx as any).date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const amt = isFiatThreshold && tx.fiatAmount && tx.fiatCurrency 
                      ? `${Number(tx.fiatAmount).toLocaleString()} ${tx.fiatCurrency}` 
                      : Number(tx.amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
                  const stat = String(tx.status).toUpperCase();
                  const recipient = tx.recipientEmail || tx.metadata?.recipientDetails?.name || tx.metadata?.recipientDetails?.accountNumber || "External";
                  
                  let logStr = `• **${amt}** (${stat}) — Ref: \`${tx.reference || tx.id}\`\n  📅 ${dateStr} | 👤 ${recipient}`;

                  if (tx.txHash && tx.txHash.length > 20 && !tx.txHash.includes('MOCK')) {
                      const isContract = tx.txHash.startsWith('C') && tx.txHash.length === 56;
                      const urlType = isContract ? 'contract' : 'tx';
                      const expertUrl = `https://stellar.expert/explorer/${explorerNetwork}/${urlType}/${tx.txHash}`;
                      const label = isContract ? 'Smart Contract' : 'Stellar TxHash';
                      
                      logStr += `\n  ⛓️ **${label}:** [\`${tx.txHash.substring(0, 8)}...${tx.txHash.substring(tx.txHash.length - 6)}\`](${expertUrl})`;
                  }

                  return logStr;
              }).join("\n\n");

              let introMsg = `### 🔍 Stellar Ledger Audit Report\n\nI found **${totalMatches}** ${filterDescription} ${entityLabel} ${timePhrase}, totaling **${sumVolume}**.\n\n`;
              if (totalMatches > 10) introMsg += `*Showing the 10 most recent records:*\n\n`;

              return res.json({ answer: introMsg + itemizedLogs, suggestions: ["What's my net cashflow?", "Show my recent transactions"] });
          }
      }


      // =========================================================================
      // 🧠 LAYER 3.3: TOP VENDORS / LARGEST EXPENSES (CFO Analytics)
      // Extracts the largest outbound liquidity movements in the specified timeframe
      // =========================================================================
      if (q.match(/(top|biggest|largest|highest|most).*(expense|expenses|vendor|vendors|recipient|recipients|payment|payments|spend|spending|withdrawal)/i)) {
          const topTxs = await db.select({
              amount: transactions.amount,
              description: transactions.description,
              recipientEmail: transactions.recipientEmail,
              type: transactions.type
          })
          .from(transactions)
          .where(and(userFilter, timeFilter, inArray(transactions.type, ['payment', 'bulk_payment', 'withdrawal']), inArray(transactions.status, ['completed', 'settled'])))
          .orderBy(desc(sql`CAST(${transactions.amount} AS NUMERIC)`))
          .limit(5);

          if (topTxs.length === 0) {
              return res.json({
                  answer: `You have no settled outbound spending ${timeContext === "all time" ? "on record" : `for ${timeContext}`} to calculate top expenses.`,
                  suggestions: ["What's my net cashflow?"]
              });
          }

          const itemizedTop = topTxs.map((tx: any, idx: number) => {
              const amt = Number(tx.amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
              const isWithdrawal = tx.type === 'withdrawal';
              const recipient = tx.recipientEmail || tx.description || (isWithdrawal ? "Bank Off-Ramp" : "External Vendor");
              return `${idx + 1}. **${amt}** — ${recipient}`;
          }).join("\n");

          return res.json({
              answer: `### 📊 Top Outbound Flow (${timeContext.toUpperCase()})\n\nHere are your largest settled expenditures and withdrawals:\n\n${itemizedTop}`,
              suggestions: ["How much did we spend this month?", "What's my burn rate?"]
          });
      }



      // =========================================================================
      // 🧠 LAYER 3.5: TRANSACTION LOOKUP & PLATFORM NAVIGATION
      // =========================================================================

      // 1. ATTEMPT TO EXTRACT AN ID FIRST (Parameter Extraction)
      let targetTxId = null;
      
      // Broadened to catch conversational queries like "I want to track transaction TRX123"
      const explicitLookupMatch = workingQuery.match(/(?:find|search|lookup|track|status of).*(?:transaction|tx|payment|escrow|id|ref)[^\w]*([a-zA-Z0-9_-]{6,})/i);
      const loneIdMatch = workingQuery.match(/^([a-zA-Z0-9_-]{8,})$/); // User just pastes the ID directly

      if (explicitLookupMatch && explicitLookupMatch[1]) {
        targetTxId = explicitLookupMatch[1].trim();
      } else if (loneIdMatch && loneIdMatch[1]) {
        targetTxId = loneIdMatch[1].trim();
      }

      // If we found an ID, execute the database search
      if (targetTxId) {
        const txRecords = await db.select().from(transactions).where(
          or(
            eq(transactions.id, targetTxId),
            eq(transactions.reference, targetTxId)
          )
        ).limit(1);

        if (txRecords.length > 0) {
          const tx = txRecords[0];
          
          // 🛡️ IRON FENCE APPLIED: Strict Horizontal Authorization
          const txSubId = tx.subAccountId ? String(tx.subAccountId) : null;
          const isAuthorized = activeSubId 
              ? (txSubId === activeSubId) 
              : isMasterWallet
                  ? (tx.userId === userId && (!txSubId || txSubId === "null")) 
                  : (tx.userId === userId || tx.subAccountId === userId); 

          if (isAuthorized) {
            const amount = Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const rawDate = tx.createdAt || (tx as any).date || new Date();
            const dateStr = new Date(rawDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            return res.json({
              answer: `Here are the details for Transaction **${targetTxId}**:\n\n• **Type:** ${String(tx.type).toUpperCase()}\n• **Status:** ${String(tx.status).toUpperCase()}\n• **Amount:** $${amount}\n• **Date:** ${dateStr}\n• **Description:** ${tx.description || 'N/A'}\n\nWould you like to view this in your main transactions ledger?`,
              suggestions: ["Show recent transactions", "What's my net cashflow?"],
              action: { type: "VIEW_TRANSACTIONS" } // Tells the frontend agent to switch tabs!
            });
          }
        }
        
        return res.json({
          answer: `I searched the ledger but couldn't find any record matching the ID **${targetTxId}**. Please check the ID and try again.`,
          suggestions: ["Show recent transactions", "Find transaction by ID"]
        });
      }

      // 2. SLOT-FILLING PROMPT (No ID found, but search intent detected)
      // This will now perfectly catch "i want to search for a transaction" or "help me track a payment"
      if (q.match(/(find|search|lookup|track).*(transaction|tx|payment|escrow)/i)) {
        return res.json({
          answer: "I can pull up that record for you. Please paste the exact **Transaction ID** or **Reference ID** below.",
          suggestions: []
        });
      }

      // 3. Virtual Ledger explanation
      if (q.match(/(create|make|add|setup|set up|how do i).*(virtual ledger|sub-account|sub account)/i)) {
        return res.json({
          answer: "**Virtual Ledgers** (Sub-Accounts) allow you to generate unique wallet addresses to isolate incoming payments and funds for different departments or projects.\n\n**To create one:** Navigate to your Accounts dashboard and click '+ Create Virtual Ledger'. I can take you there now.",
          suggestions: ["What's my account balance?", "How do I fund my account?"],
          action: { type: "CREATE_LEDGER" } // Triggers the MainDashboard interceptor to open the modal
        });
      }

        // 🌟 NEW: User-Initiated Tab Navigation
      if (q.match(/^(view|show|open|take me to|go to).*(transaction|ledger|history)/i)) {
        return res.json({
          answer: "Opening your transaction ledger now.",
          action: { type: "VIEW_TRANSACTIONS" } // This safely fires ONLY when requested
        });
      }


      // =========================================================================
      // 🧠 LAYER 3.8: DEEP ESCROW EXECUTION (CANCEL & APPROVE)
      // =========================================================================
      
      // 1. Parameter Extraction (Look for Action + ID)
      const escrowExecMatch = workingQuery.match(/(cancel|stop|abort|reverse|refund|release|approve|unlock|pay out)\s+(?:escrow|contract|payment|tx|transaction|id|ref|for)?[^\w]*([a-zA-Z0-9_-]{6,})/i);

      if (escrowExecMatch) {
          const actionIntent = escrowExecMatch[1].toLowerCase();
          const targetId = escrowExecMatch[2].trim();
          
          const isCancel = ["cancel", "stop", "abort", "reverse", "refund"].includes(actionIntent);
          const isRelease = ["release", "approve", "unlock", "pay out"].includes(actionIntent);

          // 🌟 CRASH FIX: Conditionally query UUIDs to prevent Postgres 22P02 Errors
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
          
          // 🌟 BUG FIX: Expanded to include Stellar/Soroban blockchain hashes
          const escConditions = [
              eq(escrows.claimId, targetId), 
              eq(escrows.batchId, targetId),
              eq(escrows.claimHash, targetId),
              eq(escrows.blockchainClaimHash, targetId)
          ];
          if (isUuid) escConditions.push(eq(escrows.id, targetId));

          // 🛡️ IRON FENCE APPLIED: Strict Horizontal Authorization for Smart Contracts
          const escRecords = await db.select()
              .from(escrows)
              .where(and(escrowLedgerFilter, or(...escConditions))) 
              .limit(1);

          if (escRecords.length > 0) {
              const esc = escRecords[0];
              const escAmount = Number(esc.amountLocked || 0).toLocaleString("en-US", { style: 'currency', currency: 'USD' });
              
              // Prevent actions on already settled/failed contracts
              const escStatus = String(esc.status || 'unknown').toLowerCase();
              if (['completed', 'claimed', 'failed', 'cancelled', 'claim_canceled'].includes(escStatus)) {
                   return res.json({
                       answer: `Escrow **${targetId}** cannot be modified because it has already been marked as **${escStatus.toUpperCase()}** on the blockchain.`,
                       suggestions: ["View transactions ledger", "What's my net cashflow?"]
                   });
              }

              if (isCancel) {
                  // Role-Based Gate: Even if they are involved in the contract, only the Sender can cancel
                  if (esc.creatorId !== userId) {
                      return res.json({
                          answer: `Security Alert: You do not have authorization to cancel Escrow **${targetId}**. Only the fund sender can reverse this smart contract.`,
                          suggestions: ["View transactions ledger"]
                      });
                  }
                  
                  return res.json({
                      answer: `I have located Escrow **${targetId}** for **${escAmount}**. I am teleporting you to the secure terminal now. Please confirm with your PIN to execute the on-chain cancellation and refund your wallet.`,
                      action: { type: "CANCEL_ESCROW", targetId: esc.id || esc.claimId }
                  });
              } else if (isRelease) {
                  return res.json({
                      answer: `I have located Escrow **${targetId}** for **${escAmount}**. I am teleporting you to the secure terminal now. Please confirm with your PIN to approve the smart contract and release the funds to the recipient.`,
                      action: { type: "RELEASE_ESCROW", targetId: esc.id || esc.claimId }
                  });
              }
          }

          // Fallback if ID is invalid or belongs to another company (Safe from enumeration)
          return res.json({
              answer: `I searched the Soroban registry but couldn't find an active Escrow matching the ID **${targetId}** tied to your account. Please check the ID and try again.`,
              suggestions: ["View transactions ledger", "Find transaction by ID"]
          });
      }

      // 2. Slot-Filling Prompt
      if (q.match(/(cancel|stop|abort|reverse|refund|release|approve|unlock).*(escrow|contract|payment|transaction)/i)) {
          return res.json({
              answer: "I can execute that smart contract action for you. Please paste the exact **Escrow ID** or **Transaction Reference** you want to modify.",
              suggestions: ["View transactions ledger"]
          });
      }
        
        

        
      // =========================================================================
      // 🧠 LAYER 4: INFRASTRUCTURE & PLATFORM KNOWLEDGE BASE
      // =========================================================================

      // 🌟 THE ULTIMATE KNOWLEDGE GUARD
      // Protects static UI navigation FAQs from hijacking intellectual/strategic CFO questions
      const isStrategicQuestion = q.match(/\b(what is|what's|whats|what are|why|how does|explain|define|compare|benefits of|difference between|how can|in what ways|tell me)\b/i) &&
                                  !q.match(/\b(my|our|i|we|me|balance|spend|spent|send|sent|pay|history|ledger|limit|export|download|csv|pdf|report|cancel|stop|reverse)\b/i);

      if (!isStrategicQuestion) {
          
          if (q.match(/(Digital wallet|sub account|sub-account|muxed|multiple account)/i)) {
            return res.json({
              answer: "Sub-Accounts allow you to generate unique wallet Addresses to isolate incoming payments and funds for different departments or projects.\n\n• **To create one:** Navigate to **Accounts** → click **'+ Create OnchainAccount'**.\n• **Switching:** You can switch active context between ledgers inside the Accounts menu.",
              suggestions: ["How do I generate an API key?"]
            });
          }

          // 🌟 THE FIX: Tightened regex so the standalone word "security" doesn't hijack queries!
          if (q.match(/(?:how to|where is|change|update|setup|enable).*(password|2fa|api key|webhook|security|settings)/i) || q.match(/^(password|2fa|api keys?|webhooks?|settings)$/i)) {
            return res.json({
              answer: "Platform settings and security are managed in your dashboard:\n\n• **Passwords & 2FA:** Go to **Settings** → **Security** to update passwords and enable Two-Step Authentication.\n• **Developer Tools:** Go to **Settings** → **Developer** to generate your API keys and configure webhooks.",
              suggestions: ["How do I upload KYC documents?"]
            });
          }

          if (q.match(/(kyc|kyb|verify|verification|limit|document|passport|government id|bvn|nin|driver)/i)) {
            return res.json({
              answer: "Account verification increases your operational limits and unlocks full settlement features.\n\n• **Individuals (KYC):** Requires Government ID and BVN/NIN (for Nigeria).\n• **Businesses (KYB):** Requires Corporate Registration Documents (e.g., CAC, MemArt).\n• **To verify:** Go to **Profile** → **Identity Documents** → click **'Start now'**.",
              suggestions: ["What are the fees on Blink?"]
            });
          }

          if (q.match(/(bulk|payroll|batch|multiple|csv)/i)) {
            return res.json({
              answer: "You can execute **Bulk Payments** to pay up to 500 vendors, contractors, or employees in a single transaction:\n\n• **How to use:** Navigate to **Payments** → **Send bulk payments**.\n• **Upload:** You can manually add recipients or upload a CSV template directly.",
              suggestions: ["How do I create a secure escrow?"]
            });
          }

          if (q.match(/^(?:what are the fees|pricing|gas fees|how much does it cost)/i) || q.match(/(fee|cost|gas|charge|price|pricing)/i)) {
            return res.json({
              answer: "Blink's fee structure is highly optimized for enterprise treasury:\n\n• **Network Gas Fees:** Powered by Stellar (~$0.00001 per tx).\n• **Escrow Creation:** Flat $1.00 base fee + 0.1% on volume.\n• **Yield Harvesting:** 0% deposit/withdrawal fees. We take a small 1-5% cut of the generated yield.\n• **Bank Off-Ramping:** Low FX spread with zero hidden fees.",
              suggestions: ["How do I create an escrow?", "What are our transaction limits?"]
            });
          }

          // 🌟 THE FIX: Tightened the regex so it only triggers on explicit "How-to" or "What are" FAQ intents.
          // This prevents it from stealing mathematical ledger analytics queries!
          if (q.match(/^(?:how to|how do i|can i|where do i|help me)\s*(?:withdraw|off-ramp|cash out|use a bank|add a bank)/i) || q.match(/^(?:what are the )?(?:supported banks|bank corridors|what banks|what fiat|what mobile money)/i)) {
            return res.json({
              answer: "Blink supports seamless off-ramps across multiple corridors:\n\n• **Local Bank:** Available in NG, KE, ZA, UK, US, and 35+ Euro nations.\n• **Mobile Money:** Available in GH, KE, UG, RW, TZ, CM, etc. (M-Pesa, MTN, Airtel).\n• **Crypto:** Direct withdrawals via Stellar, Polygon, Base, Solana, or ERC20.\n\nTo withdraw, navigate to **Balance** → click **'Withdraw'**.",
              suggestions: ["How long do bank withdrawals take?"]
            });
          }

          // 🌟 THE FIX: Tightened regex so the standalone word "escrow" doesn't hijack queries!
          if (q.match(/^(how to|can i|what happens).*(create|make).*(escrow|milestone|lock)/i)) {
            return res.json({
              answer: "Blink Escrows lock funds on-chain using Soroban smart contracts until conditions are met.\n\n• **Features:** You can set strict 'Claimable After' and 'Due Date' locks.\n• **Security:** Recipients must verify via OTP before the smart contract releases funds.",
              suggestions: ["How do I request money from someone?"]
            });
          }

          if (q.match(/(request\s+(payment|money|funds)|\bpayme\b|ask for money)/i)) {
            return res.json({
              answer: "You can request stablecoin payments globally:\n\n• **Direct Request:** Send a prompt via Email, WhatsApp, or X (@handle). They don't need an account to pay.\n• **Payme Link:** Create a personalized, reusable link to share anywhere.\n\nNavigate to **Payments** → click the **Request** tab.",
              suggestions: []
            });
          }
      }

      /*  <--- COMMENTING OUT THIS BLOCK FOR NOW

      // =========================================================================
      // 🧠 LAYER 4.5: EDUCATIONAL & BRAND KNOWLEDGE BASE 
      // NOTE: Temporarily disabled. This knowledge has been migrated directly into 
      // the Groq LLaMA 3.3 System Prompt (Layer 5) for dynamic JSON generation.
      // =========================================================================

      if (q.match(/(what is|what's|whats|who is|who built|who created|explain).*(blink|bingtellar)/i)) {
        if (q.match(/(who is|who built|who created|founder|ceo)/i)) {
          return res.json({
            answer: "Blink, (a Bingtellar Co), was built by our founding CEO, Joshua Tebepina, alongside our core engineering team. The mission is to completely modernize cross-border B2B liquidity and solve the problem of dead float and capital efficiency in global payments for Enterprises and business (like Fintechs, PSPs, remittance providers, card issuers, payroll platforms, contractors) and also make Humanitarian aid distribution and bulk payments disbursment better and efficient. ",
            suggestions: ["What problem is Blink solving?", "How does yield auto-harvesting work?"]
          });
        }
        return res.json({
          answer: "Blink is a stablecoin-native treasury and payment infrastructure platform. We utilize the Stellar network and Soroban smart contracts to provide yield-bearing escrow protocols and seamless cross-border liquidity routing.",
          suggestions: ["How do I create a Digital Ledger?", "Who built Blink?"]
        });
      }

      if (q.match(/(what problem|explain).*(is blink solving|does blink solve)/i)) {
        return res.json({
          answer: "Blink solves the problem of **dead float and capital inefficiency** in global B2B payments.\n\nGlobal B2B payments are fundamentally crippled by a 3-to-5-day settlement void, Funds in transit or in pending payout windows, whether card issuer's collateral, or for NGO grants, payroll cycles, or supplier and vendor escrow payments are dead capital - that money doesn't just move, it goes dormant, un-optimised, earn zero-yield, and prone to intermediary fees. In a high-interest rate environment, this idle float represents a multi-billion dollar economic failure. Businesses ( like fintechs, PSPs or remittance providers, card issuers, payroll platforms and contractors) aren't just losing time, they are losing the opportunity cost of their own working capital and in an era of tokenized yield-bearing assets, this structural inefficiency is a massive economic drain. Blink solves this effortlessly and efficiently. By leveraging stablecoins and Soroban smart contracts, Blink allows enterprises, fintechs, and humanitarian organizations to route liquidity instantly and earn automated yield while funds are in transit.",
          suggestions: ["How does yield auto-harvesting work?", "What are stablecoins?"]
        });
      }


       if (q.match(/(how|explain).*(does|how|blink work)/i)) {
        return res.json({
          answer: "It's simple. Each payment is tied to either a phone number or email and a temporary wallet. When you send money through Blink, a secure payment link is automatically generated. You can share this link via text, email, or WhatsApp — just like sharing a photo. The recipient clicks the link, verifies their identity, and instantly receives the funds in their preferred local currency or digital wallet. Under the hood, Blink leverages stablecoin rails for settlement, ensuring transactions move in seconds instead of days, with fees that are a fraction of traditional methods.",
          suggestions: ["What are stablecoins?", "How do I fund my account?"]
        });
        } 

        

      if (q.match(/(what is|what's|whats|explain).*(stellar|stellar blockchain)/i)) {
        return res.json({
          answer: "**Stellar** is an enterprise-grade blockchain network optimized for payments. We build our architecture on Stellar and its smart contract platform, **Soroban**, because it offers near-instant settlement, sub-cent transaction fees, and institutional-grade reliability.",
          suggestions: ["What are stablecoins?", "How do I fund my account?"]
        });
      }

    if (q.match(/(what is|what's|whats|explain).*(soroban|stellar soroban)/i)) {
        return res.json({
          answer: "**Stellar Soroban** is a native smart contract platform built on the Stellar network. Launched on mainnet in early 2024, it adds general-purpose, programmable smart contracts and decentralized finance (DeFi) capabilities to Stellar's fast, low-cost payment infrastructure without requiring a separate blockchain",
          suggestions: ["What are stablecoins?", "How do I fund my account?"]
        });
      } 
        
      if (q.match(/(what is|what's|whats|explain|how do).*(stablecoin|usdc|usdt)/i)) {
        return res.json({
          answer: "**Stablecoins** (like USDC and USDT) are digital dollars powered by blockchain technology. They are fully backed 1:1 with fiat reserves, meaning they bypass traditional crypto volatility. We use them to circumvent legacy correspondent banking rails, saving you massive FX spreads and wire fees.",
          suggestions: ["How much have I saved in fees?", "What's my account balance?"]
        });
      }

      if (q.match(/(what is|what's|explain).*(blockchain|crypto|web3|distributed ledger)/i)) {
        return res.json({
          answer: "A **Blockchain** is a secure, decentralized database. Instead of relying on a single, slow intermediary (like a traditional clearinghouse), blockchain networks allow our platform to verify, reconcile, and settle your cross-border transactions cryptographically in seconds.",
          suggestions: ["What is Stellar?", "How do I create an escrow?"]
        });
      }
      
      */  // <--- END THE COMMENT BLOCK


        // =========================================================================
      // 🧠 LAYER 4.6: SETTLEMENT & SPEED INQUIRIES
      // =========================================================================
      if (q.match(/(how long|when will|why is).*(settle|arrive|clear|take|pending|stuck|delayed)/i)) {
        return res.json({
          answer: "Crypto and stablecoin transfers on our network settle almost instantly. However, if you are withdrawing to a local bank or mobile money provider, settlement can take anywhere from a few minutes to 24 hours depending on the destination country's banking hours and specific rail speeds.",
          suggestions: ["Find transaction by ID", "Check my network limits"]
        });
      }

      // =========================================================================
      // 🧠 LAYER 4.7: FEES & FX RATES
      // =========================================================================
      if (isFeeQuery) {
        return res.json({
          answer: "We believe in transparent pricing. **USDC/USDT transfers** within our ecosystem incur zero platform fees. For **fiat off-ramps** (like Bank or Mobile Money withdrawals), we pass through a minimal, flat rail fee and use competitive, real-time FX execution rates to eliminate hidden spreads.",
          suggestions: ["Fund my account", "Send a payment"]
        });
      }

      // =========================================================================
      // 🧠 LAYER 4.8: COMPLIANCE & LIMITS
      // =========================================================================
      if (isComplianceQuery) {
        return res.json({
          answer: "To keep our network secure and compliant, accounts are bound by tiered transaction limits. If you need to increase your daily or monthly volume, you can upgrade your verification tier by submitting additional business documentation.",
          suggestions: ["Upload KYC documents", "What's my account balance?"],
          action: { type: "NAVIGATE_SETTINGS" } // Maps to frontend router
        });
      }

      // =========================================================================
      // 🧠 LAYER 4.9: DEVELOPER & API OPS
      // =========================================================================
      if (q.match(/(how do i|where is|generate|create|find).*(api key|webhook|sandbox|documentation|docs|integration)/i)) {
        return res.json({
          answer: "You can manage your developer ecosystem directly from the dashboard. Navigate to **Settings** to generate secure API keys, configure webhook endpoint URLs for transaction events, and toggle between Live and Sandbox environments.",
          suggestions: ["Go to Developer Settings", "How do I create a Virtual Ledger?"],
          action: { type: "NAVIGATE_SETTINGS" } // Maps to frontend router
        });
      }

      // =========================================================================
      // 🧠 LAYER 4.10: ESCROW & YIELD OPERATIONS
      // =========================================================================
      if (q.match(/(how to|can i|what happens).*(release|unlock|dispute|cancel|milestone).*(escrow|contract|funds)/i)) {
        return res.json({
          answer: "Escrowed funds are locked on-chain via Soroban smart contracts. As the creator, you can **cancel** an escrow to instantly return the funds to your balance. If conditions are met, you can **release** the funds to the recipient. If there is a disagreement, you can initiate a **dispute** for mediation.",
          suggestions: ["Find transaction by ID", "How much yield have we earned?"]
        });
      }

        
      // =========================================================================
      // 🌟 SUPERPOWER 3: ZERO-COST GENERATIVE AI INTELLIGENCE (Groq LLaMA 3.3)
      // Connects open questions directly to a hyper-fast 70B model to kill static fallbacks
      // =========================================================================
      try {
        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are Radar, the elite, highly intelligent AI Treasury Copilot for Blink (a Bingtellar Co). Your primary users are CFOs, Heads of Treasury, and institutional financial operators.

CORE KNOWLEDGE BASE (NEVER HALLUCINATE OUTSIDE THESE FACTS):

1. COMPANY IDENTITY & MISSION:
- Brand: Blink (a Bingtellar Company).
- Leadership: Founded by CEO Joshua Tebepina, built by the the CEO and Bingtellar team.
- Mission: Modernize cross-border B2B liquidity and eliminate capital inefficiency by turning dead float into yield-generating assets using stablecoin rails, smart contracts, vaults and yield strategies.
- Target Market: Enterprise treasuries, fintechs, payment service providers (PSPs), card issuers, payroll platforms, NGOs, and global contractors.

2. THE PROBLEM (DEAD FLOAT & SETTLEMENT VOID):
- Traditional cross-border settlement suffers from a 3–5 day settlement void where funds sit dormant in intermediary bank queues, earning 0% interest and incurring wire/FX fees.
- Capital trapped in vendor escrows, collateral reserves, or payroll transit represents dead working capital with massive opportunity cost.

3. THE CORE SOLUTION & ARCHITECTURE:
- Float Monetization: Idle capital awaiting milestone release or transit is routed into non-custodial Stellar Soroban smart contract vaults (integrating protocol strategies like DeFindex and Blend Capital) earning benchmark yield (~10%–13% APY).
- Yield Distribution Policies: Flexible yield allocation configured at escrow creation:
  • Sender Retains: 100% of accrued interest returns to the creator upon settlement.
  • Recipient Incentive: Accrued interest is added to the recipient's payout.
  • 50/50 Split: Both parties equally share the yield.
- Execution Speed: Near-instant settlement (~5 seconds) on Stellar with sub-cent network fees (~$0.00001).

4. ENTERPRISE TREASURY & PAYOUT ENGINE:
- Virtual Ledgers (Sub-Accounts): Dynamic allocation of Stellar Muxed Addresses to segregate capital across departments, subsidiaries, or projects without multi-wallet overhead.
- Bulk Disbursements: Execute single-batch payouts for up to 500 recipients via manual entry or CSV upload with unified master OTP or itemized security codes.
- Request & Payme Infrastructure: Payment request links generated with multi-channel delivery (Email, WhatsApp, X) and dual-currency denomination (USDC and local fiat).

5. GLOBAL CORRIDORS & LIQUIDITY RAILS:
- Bank Off-Ramps: Direct local clearing in Nigeria (NGN), Kenya (KES), South Africa (ZAR), United Kingdom (GBP), United States (USD), and 35+ European SEPA nations (EUR).
- Mobile Money: Instant payouts via M-Pesa, MTN, Airtel across Ghana, Kenya, Uganda, Rwanda, Tanzania, and Cameroon.
- Crypto Asset Rails: Direct routing via Stellar USDC/USDT, with bridge settlement across Polygon, Base, Solana, and Ethereum.

6. SECURITY, CUSTODY & COMPLIANCE:
- Maker-Checker Cryptographic Execution: Radar is an autonomous drafting assistant, NOT a signer. All transactions, fund releases, and escrow cancellations require explicit human cryptographic confirmation (PIN / passkey / wallet signature).
- Non-Custodial Architecture: Smart contracts hold funds in isolated Soroban vaults. Platform admins cannot seize user principal.
- RAM-Only Data Protection: Spoken voice queries and financial parameters process in volatile memory with zero training retention on public LLMs.
- Compliance Tiers: Tiered limits enforced via automated KYC/KYB identity verification (Government IDs, BVN/NIN, Corporate Registry CAC/MemArt).

7. TRANSPARENT PRICING & ECONOMICS:
- Network Gas: ~$0.00001 per transaction.
- Escrow Creation: Flat $1.00 base fee + 0.1% volume fee.
- Yield Performance Fee: 0% deposit/withdrawal fee; Blink retains a small 5% cut of net accrued yield.
- Fiat Off-Ramping: Competitive wholesale FX rates with transparent pass-through rail fees and zero hidden spread markups.
              
GUIDELINES:

- Keep answers concise, engaging, and professional (1 to 3 short paragraphs max).
- If the user asks casual questions or engages in small talk ("How are you?", "Tell me a joke", "What can you do?"), respond warmly with charm and wit.
- If they ask about financial concepts, explain them clearly and simply.
- Format key terms with clean Markdown bolding.
- Tone: Executive, highly analytical, consultative, and sharp. Do not use generic, fluffy chatbot language.
- Contextual Brilliance: When asked general financial questions (like "what's dead float", "how to manage float", or "what is liquidity risk"), provide a world-class financial answer, but ALWAYS connect it back to how Blink's specific on-chain Stellar infrastructure solves it better than legacy banking rails.
- Formatting: Keep answers concise (1-3 short paragraphs). Use Markdown bolding for key financial terms.
- Boundaries: Never fabricate account balances or transaction IDs. If the user wants to inspect their ledger, guide them to ask "What is my balance?" or "Find transaction <ID>".

OUTPUT FORMAT:
You MUST return ONLY a strictly valid JSON object. The "answer" value MUST be a properly enclosed string.
{
  "answer": "Your beautifully formatted Markdown response goes here. Use \\n for line breaks.",
  "suggestions": ["Relevant follow-up question 1?", "Relevant follow-up question 2?"]
}`
            },
            {
              role: "user",
              content: rawInput 
            }
          ],
          temperature: 0.6,
          max_tokens: 450,
        });

        const rawReply = completion.choices[0]?.message?.content;
        if (rawReply && rawReply.trim().length > 0) {
          try {
            // Parse the JSON and securely map it to the UI response
            const parsedReply = JSON.parse(rawReply);
            return res.json({
              answer: parsedReply.answer,
              suggestions: (parsedReply.suggestions && parsedReply.suggestions.length > 0) 
                              ? parsedReply.suggestions 
                              : getContextSuggestions(currentTab) // Fallback to UI tab if empty
            });
          } catch (parseError) {
            // Failsafe in case the LLM hallucinates raw text instead of JSON
            return res.json({
              answer: rawReply.replace(/```json/g, '').replace(/```/g, '').trim(),
              suggestions: getContextSuggestions(currentTab)
            });
          }
        }
      } catch (llmErr) {
        console.warn("[Groq LLM Fallback Error]:", llmErr);
      }

      // Final Graceful Fallback (Only executes if the Groq LLM API is completely down)
      return res.json({ 
        answer: "I want to make sure I get you the exact information you need. Could you rephrase that slightly, or select one of the common actions below?",
        suggestions: getContextSuggestions(currentTab) 
      });

    } catch (error: any) {
      console.error("[Radar Controller Error]:", error);
      res.status(500).json({ error: "Failed to analyze the ledger." });
    }
  }
};
import { z } from 'zod';

/**
 * ==========================================
 * 🕒 TIMELINE EVENT SCHEMA
 * ==========================================
 * Blueprint for the chronological history of an escrow or transaction.
 * Used to lock down the `timeline` jsonb column in the Drizzle schema.
 */
export const TimelineEventSchema = z.object({
  state: z.string(),  // The exact status of the event (e.g., 'Active', 'OTP_Verified', 'Settled')
  timestamp: z.string().datetime(),   // Standardized ISO-8601 timestamp string ensuring global time consistency
  metadata: z.record(z.string(), z.any()).optional(),  // Optional key-value pairs for extra event context (e.g., { notes: 'USDC securely transferred.' })
});

/**
 * ==========================================
 * 🗄️ ESCROW / TRANSACTION METADATA SCHEMA
 * ==========================================
 * Strict blueprint for all dynamic off-chain and on-chain data.
 * Used to lock down the `metadata` jsonb columns in the Drizzle schema.
 * If a controller tries to save a property not listed here, TypeScript will block it.
 */
export const EscrowMetadataSchema = z.object({
  // --- Web3 / Smart Contract Tracking ---
  contractId: z.string().length(56).optional(), // Must be exactly 56 characters (Stellar/Soroban standard contract ID)
  txHash: z.string().optional(),    // The final settlement hash on the blockchain
  
  // --- Yield & Strategy Tracking (ORACLE SYNC) ---
  yieldDistributed: z.number().optional(), 
  exactUsdcOutput: z.number().optional(),
  strategyLoss: z.number().optional(),

  // --- Fiat & Off-Ramp Tracking (Bingtellar Integrations) ---
  recipientDetails: z.record(z.string(), z.any()).optional(), // Details regarding the bank account or mobile money destination
  bingtellarOrderId: z.string().optional(),  // Unique tracking ID provided by the Bingtellar API
  
  grossFiatAmount: z.union([z.string(), z.number()]).optional(), // The total fiat value before network deductions, accepting both strings or numbers
  railFee: z.union([z.string(), z.number()]).optional(),  // The fee charged by the fiat rail/payment processor
  deliveryProvider: z.string().optional(),  // The external service facilitating the fiat transfer (e.g., 'Mobile Money', 'Bank')
  
  // --- General System Tracking ---
  notes: z.string().optional(),  // Human-readable notes or internal audit memos
});

/**
 * ==========================================
 * 🛠️ EXPORTED TYPESCRIPT TYPES
 * ==========================================
 * These extract the raw TypeScript types from the Zod schemas above.
 * Import these directly into `src/schema.ts` to strictly type the `$type<...>()` methods.
 */
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type EscrowMetadata = z.infer<typeof EscrowMetadataSchema>;
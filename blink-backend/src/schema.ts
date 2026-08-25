// src/schema.ts
import { 
  pgTable, 
  varchar, 
  numeric, 
  timestamp, 
  jsonb, 
  boolean, 
  integer, 
  text, 
  uuid, 
  index 
} from "drizzle-orm/pg-core";
import { TimelineEvent, EscrowMetadata } from "./utils/validators";

// --- 1. USERS (Main Web2.5 Accounts) ---
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 20 }).default("user").notNull(),

  // Access Management Fields
  department: varchar("department", { length: 50 }),
  modules: jsonb("modules").default([]),
  
  // Magic Link Provisioning Fields
  provisionToken: varchar("provision_token", { length: 255 }),
  provisionExpires: timestamp("provision_expires"),

  accountType: varchar("account_type", { length: 50 }),
  resetOtp: varchar('reset_otp', { length: 6 }),
  otpExpiry: timestamp('otp_expiry'),
  resetToken: varchar('reset_token', { length: 64 }),
  tokenExpiry: timestamp('token_expiry'),

  kycStatus: varchar("kyc_status", { length: 50 }).default("unverified"), 
  kycRejectionReason: text("kyc_rejection_reason"),
  businessName: varchar("business_name", { length: 255 }),
  registrationNumber: varchar("registration_number", { length: 100 }),
  
  // Security Audit Trail Columns
  country: varchar("country", { length: 100 }),
  countryCode: varchar("country_code", { length: 2 }),
  lastIp: varchar("last_ip", { length: 45 }),
  
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  services: jsonb("services").default([]),

  documentUrl: text("document_url"), 
  bvn: varchar("bvn", { length: 20 }), 
  nin: varchar("nin", { length: 20 }), 
  isReady: boolean("is_ready").default(false).notNull(), 
  
  walletAddress: varchar("wallet_address", { length: 56 }).unique(), 
  encryptedWalletKey: text("encrypted_wallet_key"),
  
  balance: numeric("balance", { precision: 20, scale: 7 }).default("0"),
  isFrozen: boolean("is_frozen").default(false).notNull(), 
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// --- 1.5 SUB-ACCOUNTS (Virtual Ledgers / Muxed Routing) ---
export const subAccounts = pgTable("sub_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(), 
  muxedId: varchar("muxed_id", { length: 50 }).notNull().unique(), 
  muxedAddress: varchar("muxed_address", { length: 100 }).notNull(), 
  balance: numeric("balance", { precision: 20, scale: 7 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => ({
  parentIdx: index("subacc_parent_idx").on(table.parentId),
  muxedIdIdx: index("subacc_muxed_idx").on(table.muxedId),
}));

// --- 2. ESCROW PAYMENTS (Web3 & Security Tracking) ---
export const escrows = pgTable("escrows", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  subAccountId: uuid("sub_account_id").references(() => subAccounts.id, { onDelete: "set null" }), 
  
  batchId: varchar("batch_id", { length: 100 }),
  claimId: varchar("claim_id", { length: 100 }).unique().notNull(),
  
  idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(), 
  
  senderName: varchar("sender_name", { length: 100 }),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),

  // Identity Binding for Internal Routing
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
  isInternal: boolean("is_internal").default(false).notNull(),

  amountLocked: numeric("amount_locked", { precision: 20, scale: 7 }).notNull(), 
  currency: varchar("currency", { length: 10 }).default("USD"),
  usdcEquivalent: numeric("usdc_equivalent", { precision: 20, scale: 7 }),
  feeAmount: numeric("fee_amount", { precision: 20, scale: 7 }).default("0"),
  
  status: varchar("status", { length: 50 }).notNull(), 
  timeline: jsonb("timeline").$type<TimelineEvent[]>().notNull().default([]),
  note: text("note"),
  yieldRecipient: varchar("yield_recipient", { length: 50 }).default("split"),
  estimatedYield: numeric("estimated_yield", { precision: 20, scale: 8 }).default("0"),
  otp: varchar("otp", { length: 10 }),
  
  lockedAt: timestamp("locked_at"),
  claimableAfter: timestamp("claimable_after"),
  dueDate: timestamp("due_date"),
  claimDate: timestamp("claim_date"), 
  expiryDate: timestamp("expiry_date"), 
  claimedAt: timestamp("claimed_at"), 
  
  claimLink: varchar("claim_link", { length: 255 }),
  tokenHash: varchar("token_hash", { length: 255 }), 
  notifySenderOnClaim: boolean("notify_sender_on_claim").default(true),

  contractId: varchar("contract_id", { length: 56 }), 
  title: varchar("title", { length: 100 }).default('General Service'),
  clientName: varchar("client_name", { length: 100 }),
  agreementType: varchar("agreement_type", { length: 50 }).default("Instant"),
  sender: varchar("sender", { length: 56 }), 
  asset: varchar("asset", { length: 56 }), 
  platformAddress: varchar("platform_address", { length: 56 }),
  defindexAddress: varchar("defindex_address", { length: 56 }),
  shareTokenAddress: varchar("share_token_address", { length: 56 }),
  claimHash: varchar("claim_hash", { length: 64 }), 
  blockchainClaimHash: varchar("blockchain_claim_hash", { length: 128 }), 
  principal: numeric("principal", { precision: 20, scale: 7 }).default("0"), 
  baseFee: numeric("base_fee", { precision: 20, scale: 7 }).default("0"),
  cancellationFee: numeric("cancellation_fee", { precision: 20, scale: 7 }).default("0"),
  amountClaimed: numeric("amount_claimed", { precision: 20, scale: 7 }).default("0"),
  bufferAmount: numeric("buffer_amount", { precision: 20, scale: 7 }).default("0"),
  strategyShares: numeric("strategy_shares", { precision: 20, scale: 7 }).default("0"),
  platformFeeBps: integer("platform_fee_bps").default(0),
  reserveRatioBps: integer("reserve_ratio_bps").default(0),
  isPaused: boolean("is_paused").default(false).notNull(),
  milestoneApproved: boolean("milestone_approved").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => ({
  creatorIdx: index("escrow_creator_idx").on(table.creatorId),
  recipientIdx: index("escrow_recipient_idx").on(table.recipientEmail),
  statusIdx: index("escrow_status_idx").on(table.status),
  idempotencyIdx: index("escrow_idempotency_idx").on(table.idempotencyKey),
}));

// --- 3. PAYMENT REQUESTS ---
export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  subAccountId: uuid("sub_account_id").references(() => subAccounts.id, { onDelete: "set null" }), 
  reference: varchar("reference", { length: 100 }).unique().notNull(),
  creatorName: varchar("creator_name", { length: 100 }),
  amount: numeric("amount", { precision: 20, scale: 7 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 20, scale: 7 }).default("0"),
  fiatAmount: numeric("fiat_amount", { precision: 20, scale: 2 }),
  fiatAmountPaid: numeric("fiat_amount_paid", { precision: 20, scale: 2 }).default("0"),
  fiatCurrency: varchar("fiat_currency", { length: 10 }),
  status: varchar("status", { length: 50 }).notNull(), 
  timeline: jsonb("timeline").notNull().default([]), 
  note: text("note"),
  recipients: jsonb("recipients").default([]),
  isPublicLink: boolean("is_public_link").default(false),
  isBaseRequest: boolean("is_base_request").default(false),
  baseRequestId: varchar("base_request_id", { length: 100 }),
  payerEmail: varchar("payer_email", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => ({
  creatorIdx: index("pr_creator_idx").on(table.creatorId),
  referenceIdx: index("pr_reference_idx").on(table.reference),
}));

// --- 4. TRANSACTIONS / UI HISTORY ---
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), 
  subAccountId: uuid("sub_account_id").references(() => subAccounts.id, { onDelete: "set null" }), 
  type: varchar("type", { length: 50 }).notNull(), 
  amount: numeric("amount", { precision: 20, scale: 7 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),

  // ENGINE-LEVEL FIX: txHash remains non-unique for bulk txs, but reference MUST be unique!
  txHash: varchar("tx_hash", { length: 100 }), 
  status: varchar("status", { length: 50 }).default("completed"),
  description: varchar("description", { length: 255 }),
  trackingState: varchar("tracking_state", { length: 50 }),
  
  reference: varchar("reference", { length: 100 }).unique(),
  network: varchar("network", { length: 50 }),

  // Fiat & Exchange Fields
  fiatAmount: numeric("fiat_amount", { precision: 20, scale: 2 }),
  fiatCurrency: varchar("fiat_currency", { length: 10 }),
  exchangeRate: numeric("exchange_rate", { precision: 20, scale: 6 }),

  // Fee Breakdown
  networkFee: numeric("network_fee", { precision: 20, scale: 7 }),       
  processingFee: numeric("processing_fee", { precision: 20, scale: 7 }), 
  railFee: numeric("rail_fee", { precision: 20, scale: 2 }),             
  
  metadata: jsonb("metadata").$type<EscrowMetadata>().default({}),

  note: text("note"), 
  memo: text("memo"), 

  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipients: jsonb("recipients").default([]),
  role: varchar("role", { length: 20 }), 
  amountDisbursed: numeric("amount_disbursed", { precision: 20, scale: 7 }),
  completedCount: integer("completed_count").default(0),
  cancelledCount: integer("cancelled_count").default(0),
  totalCount: integer("total_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => ({
  userIdx: index("tx_user_idx").on(table.userId),
  subAccountIdx: index("tx_sub_account_idx").on(table.subAccountId),
  txHashIdx: index("tx_hash_idx").on(table.txHash),
  referenceIdx: index("tx_reference_idx").on(table.reference), 
  idempotencyIdx: index("tx_idempotency_idx").on(table.idempotencyKey),
  typeStatusIdx: index("tx_type_status_idx").on(table.type, table.status),
}));

// --- 5. SYSTEM LEDGER ---
export const ledger = pgTable("ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: varchar("account_id", { length: 100 }).notNull(), 
  amount: numeric("amount", { precision: 20, scale: 7 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), 
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  accountIdx: index("ledger_account_idx").on(table.accountId),
}));

// --- 6. ADMIN NOTIFICATIONS ---
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), 
  type: varchar("type", { length: 20 }).notNull(), 
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(), 
});

// --- 7. RECIPIENTS DIRECTORY ---
export const recipients = pgTable("recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), 
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }),
  details: text("details"),
  email: varchar("email", { length: 255 }),
  walletAddress: varchar("wallet_address", { length: 56 }),
  beneficiaryType: varchar("beneficiary_type", { length: 50 }),
  bankCountry: varchar("bank_country", { length: 50 }),
  bankName: varchar("bank_name", { length: 100 }),
  accountTypeOption: varchar("account_type_option", { length: 50 }),
  routingNumber: varchar("routing_number", { length: 50 }),
  momoCountry: varchar("momo_country", { length: 50 }),
  momoNetwork: varchar("momo_network", { length: 50 }),
  token: varchar("token", { length: 50 }),
  network: varchar("network", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => ({
  userIdx: index("recipients_user_idx").on(table.userId),
}));

// --- 8. OTPs (Email Verification) ---
export const otps = pgTable("otps", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// --- 9. ADMIN SYSTEM NOTIFICATIONS (Event Bus) ---
export const adminNotifications = pgTable("admin_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // ENTERPRISE FIX: Indexes prevent dashboard polling from crashing the database
  readIdx: index("admin_notif_read_idx").on(table.isRead),
  createdIdx: index("admin_notif_created_idx").on(table.createdAt),
}));

// --- 10. SYSTEM AUDIT LOGS (SOC2 COMPLIANCE) ---
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").references(() => users.id).notNull(), 
  targetUserId: uuid("target_user_id").references(() => users.id), 
  action: varchar("action", { length: 100 }).notNull(), 
  description: text("description").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  metadata: jsonb("metadata").default({}), 
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("audit_admin_idx").on(table.adminId),
  actionIdx: index("audit_action_idx").on(table.action),
}));

// --- 11. SUPPORT TICKET SYSTEM ---
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  message: text('message').notNull(),
  transactionId: varchar('transaction_id', { length: 255 }), 
  status: varchar('status', { length: 50 }).default('open').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
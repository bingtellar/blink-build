CREATE TABLE "escrows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"sub_account_id" uuid,
	"batch_id" varchar(100),
	"claim_id" varchar(100) NOT NULL,
	"idempotency_key" varchar(100),
	"sender_name" varchar(100),
	"recipient_email" varchar(255) NOT NULL,
	"amount_locked" numeric(20, 7) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"usdc_equivalent" numeric(20, 7),
	"fee_amount" numeric(20, 7) DEFAULT '0',
	"status" varchar(50) NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"yield_recipient" varchar(50) DEFAULT 'split',
	"estimated_yield" numeric(20, 8) DEFAULT '0',
	"otp" varchar(10),
	"locked_at" timestamp,
	"claimable_after" timestamp,
	"due_date" timestamp,
	"claim_date" timestamp,
	"expiry_date" timestamp,
	"claimed_at" timestamp,
	"claim_link" varchar(255),
	"token_hash" varchar(255),
	"notify_sender_on_claim" boolean DEFAULT true,
	"contract_id" varchar(56),
	"title" varchar(100) DEFAULT 'General Service',
	"client_name" varchar(100),
	"agreement_type" varchar(50) DEFAULT 'Instant',
	"sender" varchar(56),
	"asset" varchar(56),
	"platform_address" varchar(56),
	"defindex_address" varchar(56),
	"share_token_address" varchar(56),
	"claim_hash" varchar(64),
	"blockchain_claim_hash" varchar(128),
	"principal" numeric(20, 7) DEFAULT '0',
	"base_fee" numeric(20, 7) DEFAULT '0',
	"cancellation_fee" numeric(20, 7) DEFAULT '0',
	"amount_claimed" numeric(20, 7) DEFAULT '0',
	"buffer_amount" numeric(20, 7) DEFAULT '0',
	"strategy_shares" numeric(20, 7) DEFAULT '0',
	"platform_fee_bps" integer DEFAULT 0,
	"reserve_ratio_bps" integer DEFAULT 0,
	"is_paused" boolean DEFAULT false NOT NULL,
	"milestone_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrows_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(100) NOT NULL,
	"amount" numeric(20, 7) NOT NULL,
	"type" varchar(20) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "otps_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"sub_account_id" uuid,
	"reference" varchar(100) NOT NULL,
	"creator_name" varchar(100),
	"amount" numeric(20, 7) NOT NULL,
	"amount_paid" numeric(20, 7) DEFAULT '0',
	"fiat_amount" numeric(20, 2),
	"fiat_amount_paid" numeric(20, 2) DEFAULT '0',
	"fiat_currency" varchar(10),
	"status" varchar(50) NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"recipients" jsonb DEFAULT '[]'::jsonb,
	"is_public_link" boolean DEFAULT false,
	"is_base_request" boolean DEFAULT false,
	"base_request_id" varchar(100),
	"payer_email" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50),
	"details" text,
	"email" varchar(255),
	"wallet_address" varchar(56),
	"beneficiary_type" varchar(50),
	"bank_country" varchar(50),
	"bank_name" varchar(100),
	"account_type_option" varchar(50),
	"routing_number" varchar(50),
	"momo_country" varchar(50),
	"momo_network" varchar(50),
	"token" varchar(50),
	"network" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"muxed_id" varchar(50) NOT NULL,
	"muxed_address" varchar(100) NOT NULL,
	"balance" numeric(20, 7) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_accounts_muxed_id_unique" UNIQUE("muxed_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sub_account_id" uuid,
	"type" varchar(50) NOT NULL,
	"amount" numeric(20, 7) NOT NULL,
	"tx_hash" varchar(100),
	"status" varchar(50) DEFAULT 'completed',
	"description" varchar(255),
	"tracking_state" varchar(50),
	"reference" varchar(100),
	"network" varchar(50),
	"fiat_amount" numeric(20, 2),
	"fiat_currency" varchar(10),
	"exchange_rate" numeric(20, 6),
	"network_fee" numeric(20, 7),
	"processing_fee" numeric(20, 7),
	"note" text,
	"memo" text,
	"recipient_email" varchar(255),
	"recipients" jsonb DEFAULT '[]'::jsonb,
	"role" varchar(20),
	"amount_disbursed" numeric(20, 7),
	"completed_count" integer DEFAULT 0,
	"cancelled_count" integer DEFAULT 0,
	"total_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"account_type" varchar(50),
	"reset_otp" varchar(6),
	"otp_expiry" timestamp,
	"reset_token" varchar(64),
	"token_expiry" timestamp,
	"kyc_status" varchar(50) DEFAULT 'unverified',
	"business_name" varchar(255),
	"registration_number" varchar(100),
	"country" varchar(100),
	"timezone" varchar(50) DEFAULT 'UTC',
	"document_url" text,
	"bvn" varchar(20),
	"nin" varchar(20),
	"is_ready" boolean DEFAULT false NOT NULL,
	"wallet_address" varchar(56),
	"encrypted_wallet_key" text,
	"balance" numeric(20, 7) DEFAULT '0',
	"is_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_sub_account_id_sub_accounts_id_fk" FOREIGN KEY ("sub_account_id") REFERENCES "public"."sub_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_sub_account_id_sub_accounts_id_fk" FOREIGN KEY ("sub_account_id") REFERENCES "public"."sub_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_accounts" ADD CONSTRAINT "sub_accounts_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sub_account_id_sub_accounts_id_fk" FOREIGN KEY ("sub_account_id") REFERENCES "public"."sub_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escrow_creator_idx" ON "escrows" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "escrow_claim_idx" ON "escrows" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "escrow_recipient_idx" ON "escrows" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "escrow_status_idx" ON "escrows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "otp_email_idx" ON "otps" USING btree ("email");--> statement-breakpoint
CREATE INDEX "pr_creator_idx" ON "payment_requests" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "pr_reference_idx" ON "payment_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "recipients_user_idx" ON "recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subacc_parent_idx" ON "sub_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "subacc_muxed_idx" ON "sub_accounts" USING btree ("muxed_id");--> statement-breakpoint
CREATE INDEX "tx_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tx_reference_idx" ON "transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "tx_type_status_idx" ON "transactions" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_wallet_idx" ON "users" USING btree ("wallet_address");
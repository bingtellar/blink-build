CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"target_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"ip_address" varchar(45),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_tx_hash_unique";--> statement-breakpoint
DROP INDEX "otp_email_idx";--> statement-breakpoint
DROP INDEX "user_email_idx";--> statement-breakpoint
DROP INDEX "user_wallet_idx";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_admin_idx" ON "audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "escrow_idempotency_idx" ON "escrows" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "tx_sub_account_idx" ON "transactions" USING btree ("sub_account_id");--> statement-breakpoint
CREATE INDEX "tx_hash_idx" ON "transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "tx_idempotency_idx" ON "transactions" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reference_unique" UNIQUE("reference");
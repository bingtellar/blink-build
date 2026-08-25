DROP INDEX "escrow_claim_idx";--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_idempotency_key_unique" UNIQUE("idempotency_key");
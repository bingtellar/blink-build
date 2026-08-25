ALTER TABLE "transactions" ADD COLUMN "rail_fee" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;
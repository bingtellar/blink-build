ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "modules" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provision_token" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provision_expires" timestamp;
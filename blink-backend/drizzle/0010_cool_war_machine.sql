ALTER TABLE "escrows" ADD COLUMN "target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
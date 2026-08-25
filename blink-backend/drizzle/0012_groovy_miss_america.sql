CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"transaction_id" varchar(255),
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

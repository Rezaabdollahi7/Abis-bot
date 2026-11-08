CREATE TYPE "public"."ledger_entry_kind" AS ENUM('topup', 'purchase', 'refund', 'adjustment');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"phone" text,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_telegramId_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"amount_toman" bigint NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"ref_type" text,
	"ref_id" bigint,
	"reason" text,
	"created_by_admin_telegram_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
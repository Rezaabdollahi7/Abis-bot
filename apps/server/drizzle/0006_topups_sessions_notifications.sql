CREATE TYPE "public"."topup_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topups" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"claimed_amount_toman" bigint NOT NULL,
	"approved_amount_toman" bigint,
	"bank_card_id" integer NOT NULL,
	"receipt_file_id" text NOT NULL,
	"receipt_file_unique_id" text NOT NULL,
	"duplicate_of_topup_id" integer,
	"status" "topup_status" DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"handled_by_telegram_id" bigint,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_sessions" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topups" ADD CONSTRAINT "topups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topups" ADD CONSTRAINT "topups_bank_card_id_bank_cards_id_fk" FOREIGN KEY ("bank_card_id") REFERENCES "public"."bank_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notifications_entity_type_entity_id_index" ON "admin_notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "topups_receipt_file_unique_id_index" ON "topups" USING btree ("receipt_file_unique_id");--> statement-breakpoint
CREATE INDEX "topups_status_index" ON "topups" USING btree ("status");
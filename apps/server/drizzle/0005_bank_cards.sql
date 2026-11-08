CREATE TABLE "bank_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"holder_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_cards_one_active" ON "bank_cards" USING btree ("is_active") WHERE "bank_cards"."is_active";
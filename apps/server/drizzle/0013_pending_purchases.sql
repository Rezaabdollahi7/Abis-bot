CREATE TABLE "pending_purchases" (
	"customer_id" integer PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"input_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_purchases" ADD CONSTRAINT "pending_purchases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_purchases" ADD CONSTRAINT "pending_purchases_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
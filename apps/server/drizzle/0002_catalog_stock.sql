CREATE TYPE "public"."delivery_method" AS ENUM('link', 'ready_account', 'email_activation');--> statement-breakpoint
CREATE TYPE "public"."stock_item_status" AS ENUM('available', 'sold');--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"delivery_method" "delivery_method" NOT NULL,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warranty_days" integer DEFAULT 0 NOT NULL,
	"eta_minutes" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🤖' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"price_toman" bigint NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"payload_encrypted" text NOT NULL,
	"status" "stock_item_status" DEFAULT 'available' NOT NULL,
	"order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_items_variant_id_status_index" ON "stock_items" USING btree ("variant_id","status");
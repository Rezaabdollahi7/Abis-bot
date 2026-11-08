CREATE TYPE "public"."broadcast_status" AS ENUM('sending', 'done');--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"total" integer NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"status" "broadcast_status" DEFAULT 'sending' NOT NULL,
	"created_by_telegram_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);

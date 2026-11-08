CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_telegram_id" bigint NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

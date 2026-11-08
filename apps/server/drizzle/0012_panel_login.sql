CREATE TABLE "panel_login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_telegram_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "panel_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_telegram_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

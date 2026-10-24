CREATE TABLE "account_ledger" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone_hash" text DEFAULT '' NOT NULL,
	"last_plan" text DEFAULT '' NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"signed_up_at" timestamp,
	"deleted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" ("at");
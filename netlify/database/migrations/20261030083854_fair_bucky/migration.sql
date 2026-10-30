CREATE TABLE "account_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"browser" text DEFAULT '' NOT NULL,
	"device_hash" text DEFAULT '' NOT NULL,
	"ip_prefix" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "suspended_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "account_activity_owner_at_idx" ON "account_activity" ("owner_id","at");--> statement-breakpoint
CREATE INDEX "account_activity_at_idx" ON "account_activity" ("at");
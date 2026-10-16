CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan" text DEFAULT 'beta' NOT NULL;--> statement-breakpoint
CREATE INDEX "events_owner_idx" ON "events" ("owner_id");
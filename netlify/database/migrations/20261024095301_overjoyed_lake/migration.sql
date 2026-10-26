CREATE TABLE "trial_claims" (
	"key_hash" text PRIMARY KEY,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "trial_ends_at" timestamp;
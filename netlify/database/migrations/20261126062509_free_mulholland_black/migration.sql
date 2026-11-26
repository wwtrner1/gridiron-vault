-- The founding rate now goes to the first 50 Head Coach subscribers (founding_seats), not to former Beta coaches, so
-- the founding_coach mark from 20261126045945 goes. That migration stays as it is because previews already applied it.
CREATE TABLE "founding_seats" (
	"user_id" text PRIMARY KEY,
	"claimed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "founding_coach";
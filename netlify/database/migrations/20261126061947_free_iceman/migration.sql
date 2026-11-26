CREATE TABLE "founding_seats" (
	"user_id" text PRIMARY KEY,
	"claimed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "plan" SET DEFAULT 'free';--> statement-breakpoint
-- The Beta Coach plan ends (2026-11-26): the owner's audit log records how many coaches moved, and every one of them
-- is on Sideline from now on.
INSERT INTO "audit_log" ("actor_id", "actor_email", "action", "target_id", "detail")
  SELECT 'system', 'GridIronVault plan change', 'end_beta_plan', '', jsonb_build_object('movedToSideline', count(*)::int)
  FROM "profiles" WHERE "plan" = 'beta';--> statement-breakpoint
UPDATE "profiles" SET "plan" = 'free' WHERE "plan" = 'beta';

ALTER TABLE "profiles" ADD COLUMN "founding_coach" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "plan" SET DEFAULT 'free';--> statement-breakpoint
-- The Beta Coach plan ends (2026-11-26): its coaches keep the founding rate they were promised, the owner's audit log
-- records how many moved, and every one of them is on Sideline from now on.
UPDATE "profiles" SET "founding_coach" = true WHERE "plan" = 'beta';--> statement-breakpoint
INSERT INTO "audit_log" ("actor_id", "actor_email", "action", "target_id", "detail")
  SELECT 'system', 'GridIronVault plan change', 'end_beta_plan', '', jsonb_build_object('movedToSideline', count(*)::int)
  FROM "profiles" WHERE "plan" = 'beta';--> statement-breakpoint
UPDATE "profiles" SET "plan" = 'free' WHERE "plan" = 'beta';

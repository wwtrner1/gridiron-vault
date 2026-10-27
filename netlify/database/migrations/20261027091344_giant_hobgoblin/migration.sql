CREATE TABLE "hub_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"team_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"location" text DEFAULT '' NOT NULL,
	"opponent" text DEFAULT '' NOT NULL,
	"home_away" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sheet_id" text DEFAULT '' NOT NULL,
	"score_us" integer,
	"score_them" integer,
	"canceled" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "hub_events_org_idx" ON "hub_events" ("org_id","starts_at");--> statement-breakpoint
ALTER TABLE "hub_events" ADD CONSTRAINT "hub_events_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hub_events" ADD CONSTRAINT "hub_events_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
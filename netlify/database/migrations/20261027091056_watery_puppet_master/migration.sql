CREATE TABLE "depth_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"slots" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "depth_charts_team_unit_idx" ON "depth_charts" ("team_id","unit");--> statement-breakpoint
ALTER TABLE "depth_charts" ADD CONSTRAINT "depth_charts_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
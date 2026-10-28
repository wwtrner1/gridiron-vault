CREATE TABLE "text_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"player" text DEFAULT '' NOT NULL,
	"consent" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "join_token" text;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_join_token_key" UNIQUE("join_token");--> statement-breakpoint
CREATE UNIQUE INDEX "text_signups_team_phone_idx" ON "text_signups" ("team_id","phone");--> statement-breakpoint
ALTER TABLE "text_signups" ADD CONSTRAINT "text_signups_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
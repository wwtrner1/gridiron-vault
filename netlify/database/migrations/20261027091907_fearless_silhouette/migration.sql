CREATE TABLE "hub_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"team_id" uuid,
	"channel" text DEFAULT 'staff' NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"emailed" integer DEFAULT 0 NOT NULL,
	"texted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "hub_messages_org_idx" ON "hub_messages" ("org_id","created_at");--> statement-breakpoint
ALTER TABLE "hub_messages" ADD CONSTRAINT "hub_messages_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hub_messages" ADD CONSTRAINT "hub_messages_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
CREATE TABLE "live_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scene" jsonb NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"seen" jsonb DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "live_plays_org_idx" ON "live_plays" ("org_id");--> statement-breakpoint
ALTER TABLE "live_plays" ADD CONSTRAINT "live_plays_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
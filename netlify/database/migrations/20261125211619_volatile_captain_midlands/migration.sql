CREATE TABLE "my_team_links" (
	"token" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "my_team_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"team_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"player" text DEFAULT '' NOT NULL,
	"consent" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"team_id" text NOT NULL,
	"body" text NOT NULL,
	"recipients" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "my_team_links_team_idx" ON "my_team_links" ("owner_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "my_team_signups_phone_idx" ON "my_team_signups" ("owner_id","team_id","phone");--> statement-breakpoint
CREATE INDEX "team_texts_owner_idx" ON "team_texts" ("owner_id","created_at");
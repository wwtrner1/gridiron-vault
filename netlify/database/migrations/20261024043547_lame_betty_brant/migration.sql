CREATE TABLE "playbook_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"token" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"share_id" uuid NOT NULL,
	"player_name" text DEFAULT '' NOT NULL,
	"letter" text DEFAULT '' NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_shares_token_idx" ON "playbook_shares" ("token");--> statement-breakpoint
CREATE INDEX "playbook_shares_owner_idx" ON "playbook_shares" ("owner_id");--> statement-breakpoint
CREATE INDEX "quiz_results_share_idx" ON "quiz_results" ("share_id");--> statement-breakpoint
ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_share_id_playbook_shares_id_fkey" FOREIGN KEY ("share_id") REFERENCES "playbook_shares"("id") ON DELETE CASCADE;
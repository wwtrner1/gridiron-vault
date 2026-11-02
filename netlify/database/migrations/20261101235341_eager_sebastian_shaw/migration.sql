CREATE TABLE "player_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"org_id" uuid,
	"scope" text NOT NULL,
	"player_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"blob_key" text NOT NULL,
	"uploader_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "player_files_scope_idx" ON "player_files" ("scope","player_id");--> statement-breakpoint
CREATE INDEX "player_files_owner_idx" ON "player_files" ("owner_id");--> statement-breakpoint
CREATE INDEX "player_files_org_idx" ON "player_files" ("org_id");--> statement-breakpoint
ALTER TABLE "player_files" ADD CONSTRAINT "player_files_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
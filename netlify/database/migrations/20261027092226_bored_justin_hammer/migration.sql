CREATE TABLE "hub_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"blob_key" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploader_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hub_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "hub_files_folder_idx" ON "hub_files" ("folder_id");--> statement-breakpoint
CREATE INDEX "hub_files_org_idx" ON "hub_files" ("org_id");--> statement-breakpoint
CREATE INDEX "hub_folders_org_idx" ON "hub_folders" ("org_id");--> statement-breakpoint
ALTER TABLE "hub_files" ADD CONSTRAINT "hub_files_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hub_files" ADD CONSTRAINT "hub_files_folder_id_hub_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "hub_folders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hub_folders" ADD CONSTRAINT "hub_folders_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hub_folders" ADD CONSTRAINT "hub_folders_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
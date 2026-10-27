CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "org_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_email_idx" ON "org_members" ("org_id","email");--> statement-breakpoint
CREATE INDEX "org_members_email_idx" ON "org_members" ("email");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" ("user_id");--> statement-breakpoint
CREATE INDEX "org_shares_org_idx" ON "org_shares" ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_owner_idx" ON "organizations" ("owner_id");--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_shares" ADD CONSTRAINT "org_shares_org_id_organizations_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
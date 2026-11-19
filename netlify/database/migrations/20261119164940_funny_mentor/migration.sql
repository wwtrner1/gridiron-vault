ALTER TABLE "playbooks" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_owner_client_idx" ON "playbooks" ("owner_id","client_id");
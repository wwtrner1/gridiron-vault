ALTER TABLE "call_sheets" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "call_sheets_owner_client_idx" ON "call_sheets" ("owner_id","client_id");
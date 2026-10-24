CREATE TABLE "trash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"original_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted_at" timestamp DEFAULT now(),
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "trash_owner_idx" ON "trash" ("owner_id");
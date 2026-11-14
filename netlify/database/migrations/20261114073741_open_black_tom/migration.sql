CREATE TABLE "practice_vaults" (
	"owner_id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);

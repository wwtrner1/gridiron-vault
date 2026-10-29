CREATE TABLE "team_brands" (
	"owner_id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);

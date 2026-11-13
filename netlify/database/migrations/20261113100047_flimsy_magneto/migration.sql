CREATE TABLE "wristband_setups" (
	"owner_id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);

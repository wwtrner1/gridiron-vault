CREATE TABLE "lesson_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"blob_key" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "lesson_voices_owner_idx" ON "lesson_voices" ("owner_id");
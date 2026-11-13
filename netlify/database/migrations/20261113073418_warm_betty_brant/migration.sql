CREATE TABLE "play_archive" (
	"play_id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"owner_email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"play_type" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'created' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"scene" jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read_lesson_rules" (
	"kind" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"off" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"times" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "play_archive_owner_idx" ON "play_archive" ("owner_id");--> statement-breakpoint
CREATE INDEX "play_archive_updated_idx" ON "play_archive" ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "read_lesson_rules_idx" ON "read_lesson_rules" ("kind","from_value","to_value");--> statement-breakpoint
CREATE UNIQUE INDEX "read_lessons_owner_lesson_idx" ON "read_lessons" ("owner_id","kind","from_value","to_value");--> statement-breakpoint
CREATE INDEX "read_lessons_lesson_idx" ON "read_lessons" ("kind","from_value","to_value");
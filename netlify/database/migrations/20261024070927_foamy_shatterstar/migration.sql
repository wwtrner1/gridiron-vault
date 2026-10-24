CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sid" text NOT NULL,
	"day" text NOT NULL,
	"visitor" text NOT NULL,
	"signed_in" boolean DEFAULT false NOT NULL,
	"landing" text DEFAULT '/' NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"last_beat_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "visits_sid_idx" ON "visits" ("sid");--> statement-breakpoint
CREATE INDEX "visits_day_idx" ON "visits" ("day");
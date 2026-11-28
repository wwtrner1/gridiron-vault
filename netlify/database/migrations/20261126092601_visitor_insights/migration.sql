CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pv" text NOT NULL,
	"sid" text NOT NULL,
	"day" text NOT NULL,
	"path" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"at" timestamp DEFAULT now(),
	"last_beat_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "campaign" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "returning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_pv_idx" ON "page_views" ("pv");--> statement-breakpoint
CREATE INDEX "page_views_day_idx" ON "page_views" ("day");--> statement-breakpoint
CREATE INDEX "page_views_sid_idx" ON "page_views" ("sid","at");
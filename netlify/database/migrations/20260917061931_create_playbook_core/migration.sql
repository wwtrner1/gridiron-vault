CREATE TABLE "call_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"columns" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "play_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"play_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playbook_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"playbook_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#DB5A33' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"formation" text DEFAULT '' NOT NULL,
	"play_type" text DEFAULT 'pass' NOT NULL,
	"personnel" text DEFAULT '5v5' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"field_view" text DEFAULT 'full' NOT NULL,
	"scene" jsonb NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "call_sheets_owner_idx" ON "call_sheets" ("owner_id");--> statement-breakpoint
CREATE INDEX "play_saves_user_idx" ON "play_saves" ("user_id");--> statement-breakpoint
CREATE INDEX "playbook_plays_book_idx" ON "playbook_plays" ("playbook_id");--> statement-breakpoint
CREATE INDEX "plays_owner_idx" ON "plays" ("owner_id");--> statement-breakpoint
CREATE INDEX "plays_public_idx" ON "plays" ("is_public");--> statement-breakpoint
ALTER TABLE "play_saves" ADD CONSTRAINT "play_saves_play_id_plays_id_fkey" FOREIGN KEY ("play_id") REFERENCES "plays"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "playbook_plays" ADD CONSTRAINT "playbook_plays_playbook_id_playbooks_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "playbook_plays" ADD CONSTRAINT "playbook_plays_play_id_plays_id_fkey" FOREIGN KEY ("play_id") REFERENCES "plays"("id") ON DELETE CASCADE;
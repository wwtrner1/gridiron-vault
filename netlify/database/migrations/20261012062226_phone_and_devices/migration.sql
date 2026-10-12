CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"device_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_seen" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_phone_key" UNIQUE("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_owner_device_idx" ON "trusted_devices" ("owner_id","device_hash");
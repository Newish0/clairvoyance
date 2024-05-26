ALTER TABLE "vehicle_position" ALTER COLUMN "vehicle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_position" DROP COLUMN IF EXISTS "is_updated";
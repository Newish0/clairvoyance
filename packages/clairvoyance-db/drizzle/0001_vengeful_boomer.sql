ALTER TABLE "stop_time_updates" DROP COLUMN IF EXISTS "trip_start_time";--> statement-breakpoint
ALTER TABLE "stop_time_updates" DROP COLUMN IF EXISTS "direction_id";--> statement-breakpoint
ALTER TABLE "stop_time_updates" DROP COLUMN IF EXISTS "route_id";--> statement-breakpoint
ALTER TABLE "stop_time_updates" DROP COLUMN IF EXISTS "is_updated";--> statement-breakpoint
ALTER TABLE "trip_updates" DROP COLUMN IF EXISTS "vehicle_id";--> statement-breakpoint
ALTER TABLE "trip_updates" DROP COLUMN IF EXISTS "is_updated";
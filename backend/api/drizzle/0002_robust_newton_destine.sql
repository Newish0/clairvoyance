ALTER TABLE "vehicle_position" ALTER COLUMN "rtvp_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_updates" ALTER COLUMN "trip_start_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_updates" ALTER COLUMN "trip_start_timestamp" SET NOT NULL;
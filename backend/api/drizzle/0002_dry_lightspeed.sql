CREATE TABLE IF NOT EXISTS "trip_updates" (
	"update_id" varchar(255) PRIMARY KEY NOT NULL,
	"vehicle_id" varchar(255),
	"trip_id" varchar(255),
	"trip_start_time" varchar(255),
	"direction_id" integer,
	"route_id" varchar(255),
	"start_date" varchar(255),
	"timestamp" varchar(255),
	"schedule_relationship" varchar(255),
	"is_updated" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_updates" ADD CONSTRAINT "trip_updates_trip_id_trips_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_updates" ADD CONSTRAINT "trip_updates_route_id_routes_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("route_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

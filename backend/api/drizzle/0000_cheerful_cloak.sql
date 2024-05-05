CREATE TABLE IF NOT EXISTS "routes" (
	"route_id" varchar(255) PRIMARY KEY NOT NULL,
	"agency_id" varchar(255),
	"route_short_name" varchar(255),
	"route_long_name" varchar(255),
	"route_desc" varchar(255),
	"route_type" integer NOT NULL,
	"route_url" varchar(2047),
	"route_color" varchar(255),
	"route_text_color" varchar(255),
	"route_sort_order" integer,
	"continuous_pickup" integer,
	"continuous_drop_off" integer,
	"network_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_position" (
	"rtvp_id" serial PRIMARY KEY NOT NULL,
	"bearing" real,
	"latitude" real,
	"longitude" real,
	"speed" real,
	"trip_id" varchar(255),
	"vehicle_id" varchar(255) NOT NULL,
	"rtvp_timestamp" timestamp NOT NULL,
	"is_updated" integer NOT NULL,
	"p_traveled" real,
	"rel_timestamp" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shapes" (
	"shape_id" varchar(255) NOT NULL,
	"shape_pt_lat" real NOT NULL,
	"shape_pt_lon" real NOT NULL,
	"shape_pt_sequence" integer NOT NULL,
	"shape_dist_traveled" real,
	CONSTRAINT "shapes_shape_id_shape_pt_sequence_pk" PRIMARY KEY("shape_id","shape_pt_sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stops" (
	"stop_id" varchar(255) PRIMARY KEY NOT NULL,
	"stop_code" varchar(255),
	"stop_name" varchar(255),
	"tts_stop_name" varchar(255),
	"stop_desc" varchar(255),
	"stop_lat" real,
	"stop_lon" real,
	"zone_id" varchar(255),
	"stop_url" varchar(2047),
	"location_type" integer,
	"parent_station" varchar(255),
	"stop_timezone" varchar(255),
	"wheelchair_boarding" integer,
	"level_id" varchar(255),
	"platform_code" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stop_times" (
	"trip_id" varchar(255) NOT NULL,
	"arrival_time" time,
	"arrival_timestamp" integer,
	"departure_time" time,
	"departure_timestamp" integer,
	"stop_id" varchar(255) NOT NULL,
	"stop_sequence" integer NOT NULL,
	"stop_headsign" varchar(255),
	"pickup_type" integer,
	"drop_off_type" integer,
	"continuous_pickup" integer,
	"continuous_drop_off" integer,
	"shape_dist_traveled" real,
	"timepoint" integer,
	CONSTRAINT "stop_times_trip_id_stop_sequence_pk" PRIMARY KEY("trip_id","stop_sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"trip_id" varchar(255) PRIMARY KEY NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"service_id" varchar(255) NOT NULL,
	"trip_headsign" varchar(255),
	"trip_short_name" varchar(255),
	"direction_id" integer,
	"block_id" varchar(255),
	"shape_id" varchar(255),
	"wheelchair_accessible" integer,
	"bikes_allowed" integer
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicle_position" ADD CONSTRAINT "vehicle_position_trip_id_trips_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_trip_id_trips_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_stop_id_stops_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "stops"("stop_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("route_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

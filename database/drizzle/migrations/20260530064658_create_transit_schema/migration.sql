CREATE SCHEMA "transit";
--> statement-breakpoint
CREATE TYPE "transit"."alert_cause" AS ENUM('UNKNOWN_CAUSE', 'OTHER_CAUSE', 'TECHNICAL_PROBLEM', 'STRIKE', 'DEMONSTRATION', 'ACCIDENT', 'HOLIDAY', 'WEATHER', 'MAINTENANCE', 'CONSTRUCTION', 'POLICE_ACTIVITY', 'MEDICAL_EMERGENCY');--> statement-breakpoint
CREATE TYPE "transit"."alert_effect" AS ENUM('NO_SERVICE', 'REDUCED_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR', 'ADDITIONAL_SERVICE', 'MODIFIED_SERVICE', 'OTHER_EFFECT', 'UNKNOWN_EFFECT', 'STOP_MOVED', 'NO_EFFECT', 'ACCESSIBILITY_ISSUE');--> statement-breakpoint
CREATE TYPE "transit"."alert_severity" AS ENUM('UNKNOWN_SEVERITY', 'INFO', 'WARNING', 'SEVERE');--> statement-breakpoint
CREATE TYPE "transit"."calendar_exception_type" AS ENUM('ADDED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "transit"."congestion_level" AS ENUM('UNKNOWN_CONGESTION_LEVEL', 'RUNNING_SMOOTHLY', 'STOP_AND_GO', 'CONGESTION', 'SEVERE_CONGESTION');--> statement-breakpoint
CREATE TYPE "transit"."direction" AS ENUM('OUTBOUND', 'INBOUND');--> statement-breakpoint
CREATE TYPE "transit"."location_type" AS ENUM('STOP_OR_PLATFORM', 'STATION', 'ENTRANCE_EXIT', 'GENERIC_NODE', 'BOARDING_AREA');--> statement-breakpoint
CREATE TYPE "transit"."occupancy_status" AS ENUM('EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NO_DATA_AVAILABLE', 'NOT_BOARDABLE');--> statement-breakpoint
CREATE TYPE "transit"."pickup_drop_off" AS ENUM('REGULAR', 'NO_PICKUP_OR_DROP_OFF', 'PHONE_AGENCY', 'COORDINATE_WITH_DRIVER');--> statement-breakpoint
CREATE TYPE "transit"."route_type" AS ENUM('TRAM', 'SUBWAY', 'RAIL', 'BUS', 'FERRY', 'CABLE_TRAM', 'AERIAL_LIFT', 'FUNICULAR', 'TROLLEYBUS', 'MONORAIL');--> statement-breakpoint
CREATE TYPE "transit"."stop_time_update_schedule_relationship" AS ENUM('SCHEDULED', 'SKIPPED', 'NO_DATA', 'UNSCHEDULED');--> statement-breakpoint
CREATE TYPE "transit"."timepoint" AS ENUM('APPROXIMATE', 'EXACT');--> statement-breakpoint
CREATE TYPE "transit"."trip_instance_state" AS ENUM('PRISTINE', 'DIRTY', 'REMOVED');--> statement-breakpoint
CREATE TYPE "transit"."vehicle_stop_status" AS ENUM('INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO');--> statement-breakpoint
CREATE TYPE "transit"."wheelchair_boarding" AS ENUM('NO_INFO', 'ACCESSIBLE', 'NOT_ACCESSIBLE');--> statement-breakpoint
CREATE TABLE "transit"."agencies" (
	"id" text PRIMARY KEY,
	"agency_sid" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"timezone" text NOT NULL,
	"lang" varchar(10),
	"phone" text,
	"fare_url" text,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "transit"."alerts" (
	"id" serial PRIMARY KEY,
	"agency_id" text NOT NULL,
	"content_hash" text NOT NULL UNIQUE,
	"cause" "transit"."alert_cause" DEFAULT 'UNKNOWN_CAUSE'::"transit"."alert_cause",
	"effect" "transit"."alert_effect" DEFAULT 'UNKNOWN_EFFECT'::"transit"."alert_effect",
	"severity" "transit"."alert_severity" DEFAULT 'UNKNOWN_SEVERITY'::"transit"."alert_severity",
	"header_text" jsonb NOT NULL,
	"description_text" jsonb NOT NULL,
	"url" jsonb,
	"active_periods" jsonb,
	"informed_entities" jsonb,
	"last_seen" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transit"."calendar_dates" (
	"agency_id" text,
	"service_sid" text,
	"date" varchar(8),
	"exception_type" "transit"."calendar_exception_type" NOT NULL,
	CONSTRAINT "calendar_dates_pkey" PRIMARY KEY("agency_id","service_sid","date")
);
--> statement-breakpoint
CREATE TABLE "transit"."feed_info" (
	"hash" text PRIMARY KEY CONSTRAINT "uq_feed_info_feed_hash" UNIQUE,
	"agency_id" text NOT NULL,
	"publisher_name" text,
	"publisher_url" text,
	"lang" varchar(10),
	"version" text,
	"start_date" varchar(8),
	"end_date" varchar(8)
);
--> statement-breakpoint
CREATE TABLE "transit"."routes" (
	"id" serial PRIMARY KEY,
	"agency_id" text NOT NULL,
	"route_sid" text NOT NULL,
	"short_name" text,
	"long_name" text,
	"type" "transit"."route_type" NOT NULL,
	"color" varchar(6),
	"text_color" varchar(6),
	CONSTRAINT "uq_routes_agency_route_sid" UNIQUE("agency_id","route_sid")
);
--> statement-breakpoint
CREATE TABLE "transit"."shapes" (
	"id" serial PRIMARY KEY,
	"agency_id" text NOT NULL,
	"shape_sid" text NOT NULL,
	"path" geometry(point,4326) NOT NULL,
	"distances_traveled" jsonb,
	CONSTRAINT "uq_shapes_agency_shape_sid" UNIQUE("agency_id","shape_sid")
);
--> statement-breakpoint
CREATE TABLE "transit"."stop_time_realtime_instances" (
	"id" serial PRIMARY KEY,
	"trip_instance_id" integer NOT NULL,
	"stop_time_id" integer NOT NULL,
	"stop_sequence" integer NOT NULL,
	"stop_id" integer,
	"scheduled_arrival_time" timestamp with time zone,
	"scheduled_departure_time" timestamp with time zone,
	"predicted_arrival_time" timestamp with time zone,
	"predicted_departure_time" timestamp with time zone,
	"predicted_arrival_uncertainty" integer,
	"predicted_departure_uncertainty" integer,
	"schedule_relationship" "transit"."stop_time_update_schedule_relationship" DEFAULT 'SCHEDULED'::"transit"."stop_time_update_schedule_relationship",
	"stop_headsign" text,
	"pickup_type" "transit"."pickup_drop_off",
	"drop_off_type" "transit"."pickup_drop_off",
	"last_updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_stop_time_instances__trip_instance_stop_sequence" UNIQUE("trip_instance_id","stop_sequence")
);
--> statement-breakpoint
CREATE TABLE "transit"."stop_times" (
	"id" serial PRIMARY KEY,
	"agency_id" text,
	"trip_id" integer,
	"stop_id" integer,
	"trip_sid" text NOT NULL,
	"stop_sid" text NOT NULL,
	"stop_sequence" integer NOT NULL,
	"arrival_time" char(8),
	"departure_time" char(8),
	"stop_headsign" text,
	"pickup_type" "transit"."pickup_drop_off",
	"drop_off_type" "transit"."pickup_drop_off",
	"timepoint" "transit"."timepoint" DEFAULT 'EXACT'::"transit"."timepoint",
	"shape_dist_traveled" double precision,
	CONSTRAINT "uq_stop_times_agency_trip_sequence" UNIQUE("agency_id","trip_sid","stop_sequence")
);
--> statement-breakpoint
CREATE TABLE "transit"."stops" (
	"id" serial PRIMARY KEY,
	"agency_id" text,
	"stop_sid" text NOT NULL,
	"code" text,
	"name" text,
	"description" text,
	"location" geometry(point,4326),
	"zone_id" text,
	"url" text,
	"location_type" "transit"."location_type",
	"parent_station_id" integer,
	"timezone" text,
	"wheelchair_boarding" "transit"."wheelchair_boarding",
	CONSTRAINT "uq_stops_agency_stop_sid" UNIQUE("agency_id","stop_sid")
);
--> statement-breakpoint
CREATE TABLE "transit"."trip_instances" (
	"id" serial PRIMARY KEY,
	"agency_id" text NOT NULL,
	"trip_id" integer NOT NULL,
	"route_id" integer NOT NULL,
	"shape_id" integer,
	"vehicle_id" integer,
	"start_date" varchar(8) NOT NULL,
	"start_time" varchar(8) NOT NULL,
	"start_datetime" timestamp with time zone NOT NULL,
	"state" "transit"."trip_instance_state" DEFAULT 'PRISTINE'::"transit"."trip_instance_state" NOT NULL,
	"last_trip_update_at" timestamp with time zone,
	CONSTRAINT "uq_trip_instances_trip_start_date_start_time" UNIQUE("trip_id","start_date","start_time")
);
--> statement-breakpoint
CREATE TABLE "transit"."trips" (
	"id" serial PRIMARY KEY,
	"agency_id" text,
	"route_id" integer,
	"shape_id" integer,
	"trip_sid" text NOT NULL,
	"service_sid" text NOT NULL,
	"headsign" text,
	"short_name" text,
	"direction" "transit"."direction",
	"block_id" text,
	CONSTRAINT "uq_trips_agency_trip_sid" UNIQUE("agency_id","trip_sid")
);
--> statement-breakpoint
CREATE TABLE "transit"."vehicle_positions" (
	"id" serial PRIMARY KEY,
	"vehicle_id" integer NOT NULL,
	"trip_instance_id" integer,
	"timestamp" timestamp with time zone NOT NULL,
	"location" geometry(point,4326) NOT NULL,
	"stop_id" integer,
	"current_stop_sequence" integer,
	"current_status" "transit"."vehicle_stop_status",
	"congestion_level" "transit"."congestion_level",
	"occupancy_status" "transit"."occupancy_status",
	"occupancy_percentage" integer,
	"bearing" double precision,
	"odometer" double precision,
	"speed" double precision,
	"ingested_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_vehicle_positions_vehicle_timestamp" UNIQUE("vehicle_id","timestamp")
);
--> statement-breakpoint
CREATE TABLE "transit"."vehicles" (
	"id" serial PRIMARY KEY,
	"agency_id" text NOT NULL,
	"vehicle_sid" text NOT NULL,
	"label" text,
	"license_plate" text,
	"wheelchair_accessible" "transit"."wheelchair_boarding",
	CONSTRAINT "uq_vehicles_agency_vehicle_sid" UNIQUE("agency_id","vehicle_sid")
);
--> statement-breakpoint
CREATE INDEX "idx_alerts_informed_entities_gin" ON "transit"."alerts" USING gin ("informed_entities");--> statement-breakpoint
CREATE INDEX "idx_alerts_active_periods_gin" ON "transit"."alerts" USING gin ("active_periods");--> statement-breakpoint
CREATE INDEX "idx_calendar_dates_agency_date" ON "transit"."calendar_dates" ("agency_id","date");--> statement-breakpoint
CREATE INDEX "idx_feed_info_agency_id" ON "transit"."feed_info" ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_shapes_path_gist" ON "transit"."shapes" USING gist ("path");--> statement-breakpoint
CREATE INDEX "idx_shapes_shape_sid" ON "transit"."shapes" ("shape_sid");--> statement-breakpoint
CREATE INDEX "idx_stop_time_instances_trip_instance_id" ON "transit"."stop_time_realtime_instances" ("trip_instance_id");--> statement-breakpoint
CREATE INDEX "idx_stop_times_trip_id_sequence" ON "transit"."stop_times" ("trip_id","stop_sequence");--> statement-breakpoint
CREATE INDEX "idx_stops_location_gist" ON "transit"."stops" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_trip_instances_trip_date_time_state" ON "transit"."trip_instances" ("trip_id","start_date","start_time","state");--> statement-breakpoint
CREATE INDEX "idx_trips_agency_service" ON "transit"."trips" ("agency_id","service_sid");--> statement-breakpoint
CREATE INDEX "idx_vehicle_positions_location_gist" ON "transit"."vehicle_positions" USING gist ("location");--> statement-breakpoint
ALTER TABLE "transit"."alerts" ADD CONSTRAINT "alerts_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."calendar_dates" ADD CONSTRAINT "calendar_dates_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."feed_info" ADD CONSTRAINT "feed_info_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."routes" ADD CONSTRAINT "routes_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."shapes" ADD CONSTRAINT "shapes_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ADD CONSTRAINT "stop_time_realtime_instances_wte0gAYLURTc_fkey" FOREIGN KEY ("trip_instance_id") REFERENCES "transit"."trip_instances"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ADD CONSTRAINT "stop_time_realtime_instances_stop_time_id_stop_times_id_fkey" FOREIGN KEY ("stop_time_id") REFERENCES "transit"."stop_times"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ADD CONSTRAINT "stop_time_realtime_instances_stop_id_stops_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit"."stops"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ADD CONSTRAINT "stop_times_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ADD CONSTRAINT "stop_times_trip_id_trips_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transit"."trips"("id");--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ADD CONSTRAINT "stop_times_stop_id_stops_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit"."stops"("id");--> statement-breakpoint
ALTER TABLE "transit"."stops" ADD CONSTRAINT "stops_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."stops" ADD CONSTRAINT "stops_parent_station_id_stops_id_fkey" FOREIGN KEY ("parent_station_id") REFERENCES "transit"."stops"("id");--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "trip_instances_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "trip_instances_trip_id_trips_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transit"."trips"("id");--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "trip_instances_route_id_routes_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transit"."routes"("id");--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "trip_instances_shape_id_shapes_id_fkey" FOREIGN KEY ("shape_id") REFERENCES "transit"."shapes"("id");--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "trip_instances_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transit"."vehicles"("id");--> statement-breakpoint
ALTER TABLE "transit"."trips" ADD CONSTRAINT "trips_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."trips" ADD CONSTRAINT "trips_route_id_routes_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transit"."routes"("id");--> statement-breakpoint
ALTER TABLE "transit"."trips" ADD CONSTRAINT "trips_shape_id_shapes_id_fkey" FOREIGN KEY ("shape_id") REFERENCES "transit"."shapes"("id");--> statement-breakpoint
ALTER TABLE "transit"."vehicle_positions" ADD CONSTRAINT "vehicle_positions_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transit"."vehicles"("id");--> statement-breakpoint
ALTER TABLE "transit"."vehicle_positions" ADD CONSTRAINT "vehicle_positions_trip_instance_id_trip_instances_id_fkey" FOREIGN KEY ("trip_instance_id") REFERENCES "transit"."trip_instances"("id");--> statement-breakpoint
ALTER TABLE "transit"."vehicle_positions" ADD CONSTRAINT "vehicle_positions_stop_id_stops_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit"."stops"("id");--> statement-breakpoint
ALTER TABLE "transit"."vehicles" ADD CONSTRAINT "vehicles_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint

-- MANUAL EDIT: Move `VIEW "transit"."stop_time_instances"` to AFTER `CREATE MATERIALIZED VIEW "transit"."stop_time_static_instances"`
CREATE MATERIALIZED VIEW "transit"."stop_time_static_instances" AS (select "transit"."trip_instances"."id" as "trip_instance_id", "transit"."stop_times"."id" as "stop_time_id", "transit"."stop_times"."stop_sequence", "transit"."stop_times"."stop_id", "transit"."stop_times"."timepoint", ("transit"."trip_instances"."start_datetime" + (
                    "transit"."stop_times"."arrival_time"::interval - (
                        SELECT "transit"."stop_times"."arrival_time"::interval
                        FROM "transit"."stop_times"
                        WHERE "transit"."stop_times"."trip_id" = "transit"."trip_instances"."trip_id"
                        AND "transit"."stop_times"."stop_sequence" = 1
                    )
                ))::timestamptz as "scheduled_arrival_time", ("transit"."trip_instances"."start_datetime" + (
                    "transit"."stop_times"."departure_time"::interval - (
                        SELECT "transit"."stop_times"."arrival_time"::interval
                        FROM "transit"."stop_times"
                        WHERE "transit"."stop_times"."trip_id" = "transit"."trip_instances"."trip_id"
                        AND "transit"."stop_times"."stop_sequence" = 1
                    )
                ))::timestamptz as "scheduled_departure_time", "transit"."stop_times"."stop_headsign", "transit"."stop_times"."pickup_type", "transit"."stop_times"."drop_off_type" from "transit"."trip_instances" inner join "transit"."stop_times" on "transit"."trip_instances"."trip_id" = "transit"."stop_times"."trip_id");

CREATE VIEW "transit"."stop_time_instances" AS (select rt.id as "id", COALESCE(rt.trip_instance_id, st.trip_instance_id) as "trip_instance_id", COALESCE(rt.stop_time_id, st.stop_time_id) as "stop_time_id", COALESCE(rt.stop_sequence, st.stop_sequence) as "stop_sequence", COALESCE(rt.stop_id, st.stop_id) as "stop_id", st.timepoint as "timepoint", COALESCE(rt.scheduled_arrival_time, st.scheduled_arrival_time) as "scheduled_arrival_time", COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time) as "scheduled_departure_time", rt.predicted_arrival_time as "predicted_arrival_time", rt.predicted_departure_time as "predicted_departure_time", rt.predicted_arrival_uncertainty as "predicted_arrival_uncertainty", rt.predicted_departure_uncertainty as "predicted_departure_uncertainty", rt.schedule_relationship as "schedule_relationship", COALESCE(rt.stop_headsign, st.stop_headsign) as "stop_headsign", COALESCE(rt.pickup_type, st.pickup_type) as "pickup_type", COALESCE(rt.drop_off_type, st.drop_off_type) as "drop_off_type", rt.last_updated_at as "last_updated_at" from transit.stop_time_realtime_instances rt full join transit.stop_time_static_instances st on rt.trip_instance_id = st.trip_instance_id AND rt.stop_sequence = st.stop_sequence);--> statement-breakpoint
CREATE TABLE "transit"."stop_time_realtime_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_instance_id" integer NOT NULL,
	"stop_time_id" integer NOT NULL,
	"timepoint" timepoint DEFAULT 'EXACT',
	"stop_sequence" integer NOT NULL,
	"scheduled_arrival_time" timestamp with time zone,
	"scheduled_departure_time" timestamp with time zone,
	"predicted_arrival_time" timestamp with time zone,
	"predicted_departure_time" timestamp with time zone,
	"predicted_arrival_uncertainty" integer,
	"predicted_departure_uncertainty" integer,
	"schedule_relationship" "transit"."stop_time_update_schedule_relationship" DEFAULT 'SCHEDULED',
	"stop_headsign" text,
	"pickup_type" "transit"."pickup_drop_off",
	"drop_off_type" "transit"."pickup_drop_off",
	"last_updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_stop_time_instances__trip_instance_stop_sequence" UNIQUE("trip_instance_id","stop_sequence")
);
--> statement-breakpoint
DROP TABLE IF EXISTS "transit"."stop_time_instances" CASCADE;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ADD CONSTRAINT "stop_time_realtime_instances_trip_instance_id_trip_instances_id_fk" FOREIGN KEY ("trip_instance_id") REFERENCES "transit"."trip_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ADD CONSTRAINT "stop_time_realtime_instances_stop_time_id_stop_times_id_fk" FOREIGN KEY ("stop_time_id") REFERENCES "transit"."stop_times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stop_time_instances_trip_instance_id" ON "transit"."stop_time_realtime_instances" USING btree ("trip_instance_id");--> statement-breakpoint
CREATE VIEW "transit"."stop_time_instances" AS (select rt.id as "id", COALESCE(rt.trip_instance_id, st.trip_instance_id) as "trip_instance_id", COALESCE(rt.stop_time_id, st.stop_time_id) as "stop_time_id", COALESCE(rt.stop_sequence, st.stop_sequence) as "stop_sequence", COALESCE(rt.timepoint, st.timepoint) as "timepoint", COALESCE(rt.scheduled_arrival_time, st.scheduled_arrival_time) as "scheduled_arrival_time", COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time) as "scheduled_departure_time", rt.predicted_arrival_time as "predicted_arrival_time", rt.predicted_departure_time as "predicted_departure_time", rt.predicted_arrival_uncertainty as "predicted_arrival_uncertainty", rt.predicted_departure_uncertainty as "predicted_departure_uncertainty", rt.schedule_relationship as "schedule_relationship", COALESCE(rt.stop_headsign, st.stop_headsign) as "stop_headsign", COALESCE(rt.pickup_type, st.pickup_type) as "pickup_type", COALESCE(rt.drop_off_type, st.drop_off_type) as "drop_off_type", rt.last_updated_at as "last_updated_at" from transit.stop_time_realtime_instances rt full join transit.stop_times_static_instances st on rt.trip_instance_id = st.trip_instance_id AND rt.stop_sequence = st.stop_sequence);
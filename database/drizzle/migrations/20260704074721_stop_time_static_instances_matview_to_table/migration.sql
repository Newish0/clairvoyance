DROP VIEW "transit"."stop_time_instances";
--> statement-breakpoint
DROP MATERIALIZED VIEW "transit"."stop_time_static_instances";
--> statement-breakpoint
CREATE TABLE "transit"."stop_time_static_instances" (
	"trip_instance_id" integer NOT NULL,
	"stop_time_id" integer NOT NULL,
	"stop_sequence" integer NOT NULL,
	"stop_id" integer NOT NULL,
	"timepoint" "transit"."timepoint",
	"scheduled_arrival_time" timestamp with time zone,
	"scheduled_departure_time" timestamp with time zone,
	"stop_headsign" text,
	"pickup_type" "transit"."pickup_drop_off",
	"drop_off_type" "transit"."pickup_drop_off",
	"shape_dist_traveled" double precision,
	CONSTRAINT "uq_stop_time_static_instances_trip_instance_stop_time" UNIQUE("trip_instance_id","stop_time_id")
);
--> statement-breakpoint
CREATE INDEX "idx_stop_time_static_instances_trip_instance_stop" ON "transit"."stop_time_static_instances" ("trip_instance_id","stop_id");
--> statement-breakpoint
CREATE INDEX "idx_stop_time_static_instances_stop_id" ON "transit"."stop_time_static_instances" ("stop_id");
--> statement-breakpoint
CREATE VIEW "transit"."stop_time_instances" AS (
    SELECT
        rt.id,
        st.trip_instance_id,
        st.stop_time_id,
        st.stop_sequence,
        st.stop_id,
        st.timepoint,
        st.shape_dist_traveled,
        COALESCE(rt.scheduled_arrival_time,   st.scheduled_arrival_time)   AS scheduled_arrival_time,
        COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time) AS scheduled_departure_time,
        rt.predicted_arrival_time,
        rt.predicted_departure_time,
        rt.predicted_arrival_uncertainty,
        rt.predicted_departure_uncertainty,
        rt.schedule_relationship,
        COALESCE(rt.stop_headsign, st.stop_headsign) AS stop_headsign,
        COALESCE(rt.pickup_type,   st.pickup_type)   AS pickup_type,
        COALESCE(rt.drop_off_type, st.drop_off_type) AS drop_off_type,
        rt.last_updated_at,
        COALESCE(
            rt.predicted_departure_time,
            COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time),
            rt.predicted_arrival_time,
            COALESCE(rt.scheduled_arrival_time, st.scheduled_arrival_time)
        ) AS effective_time
    FROM transit.stop_time_static_instances st
    LEFT JOIN transit.stop_time_realtime_instances rt
        ON  rt.trip_instance_id = st.trip_instance_id
        AND rt.stop_id          = st.stop_id
);
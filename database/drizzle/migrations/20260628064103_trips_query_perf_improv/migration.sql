DROP VIEW "transit"."stop_time_instances";--> statement-breakpoint
ALTER TABLE "transit"."stop_time_realtime_instances" ALTER COLUMN "stop_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ALTER COLUMN "trip_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ALTER COLUMN "stop_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_trip_instances_start_datetime" ON "transit"."trip_instances" ("start_datetime");--> statement-breakpoint
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

--- MANUAL EDITS ---

CREATE INDEX idx_stop_time_static_instances_trip_instance_stop
    ON transit.stop_time_static_instances USING btree (trip_instance_id, stop_id);

CREATE INDEX idx_stop_time_static_instances_stop_id
    ON transit.stop_time_static_instances USING btree (stop_id);


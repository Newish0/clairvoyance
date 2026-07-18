DROP VIEW "transit"."stop_time_instances";
DROP TABLE "transit"."stop_time_static_instances";--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ADD COLUMN "relative_arrival_offset" interval;--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ADD COLUMN "relative_departure_offset" interval;--> statement-breakpoint
CREATE VIEW "transit"."stop_time_instances_active" AS (
    SELECT
        rt.id,
        static.trip_instance_id,
        static.stop_time_id,
        static.stop_sequence,
        static.stop_id,
        static.timepoint,
        static.shape_dist_traveled,
        COALESCE(rt.scheduled_arrival_time,   static.scheduled_arrival_time)   AS scheduled_arrival_time,
        COALESCE(rt.scheduled_departure_time, static.scheduled_departure_time) AS scheduled_departure_time,
        rt.predicted_arrival_time,
        rt.predicted_departure_time,
        rt.predicted_arrival_uncertainty,
        rt.predicted_departure_uncertainty,
        rt.schedule_relationship,
        COALESCE(rt.stop_headsign, static.stop_headsign) AS stop_headsign,
        COALESCE(rt.pickup_type,   static.pickup_type)   AS pickup_type,
        COALESCE(rt.drop_off_type, static.drop_off_type) AS drop_off_type,
        rt.last_updated_at,
        COALESCE(
            rt.predicted_departure_time,
            COALESCE(rt.scheduled_departure_time, static.scheduled_departure_time),
            rt.predicted_arrival_time,
            COALESCE(rt.scheduled_arrival_time, static.scheduled_arrival_time)
        ) AS effective_time
    FROM (
        SELECT
            ti.id AS trip_instance_id,
            st.id AS stop_time_id,
            st.stop_sequence,
            st.stop_id,
            st.timepoint,
            (ti.start_datetime + st.relative_arrival_offset)::timestamptz AS scheduled_arrival_time,
            (ti.start_datetime + st.relative_departure_offset)::timestamptz AS scheduled_departure_time,
            st.stop_headsign,
            st.pickup_type,
            st.drop_off_type,
            st.shape_dist_traveled
        FROM transit.trip_instances ti
        INNER JOIN transit.stop_times st ON st.trip_id = ti.trip_id
        WHERE ti.start_datetime >= now() - interval '4 days'
          AND ti.start_datetime < now() + interval '4 days'
    ) static
    LEFT JOIN transit.stop_time_realtime_instances rt
        ON  rt.trip_instance_id = static.trip_instance_id
        AND rt.stop_id          = static.stop_id
);--> statement-breakpoint
CREATE VIEW "transit"."stop_time_static_instances" AS (
    SELECT
        ti.id AS trip_instance_id,
        st.id AS stop_time_id,
        st.stop_sequence,
        st.stop_id,
        st.timepoint,
        (ti.start_datetime + st.relative_arrival_offset)::timestamptz AS scheduled_arrival_time,
        (ti.start_datetime + st.relative_departure_offset)::timestamptz AS scheduled_departure_time,
        st.stop_headsign,
        st.pickup_type,
        st.drop_off_type,
        st.shape_dist_traveled
    FROM transit.trip_instances ti
    INNER JOIN transit.stop_times st ON st.trip_id = ti.trip_id
);--> statement-breakpoint
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
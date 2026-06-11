DROP VIEW "transit"."stop_time_instances";--> statement-breakpoint
DROP MATERIALIZED VIEW "transit"."stop_time_static_instances";--> statement-breakpoint

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
                ))::timestamptz as "scheduled_departure_time", "transit"."stop_times"."stop_headsign", "transit"."stop_times"."pickup_type", "transit"."stop_times"."drop_off_type", "transit"."stop_times"."shape_dist_traveled" from "transit"."trip_instances" inner join "transit"."stop_times" on "transit"."trip_instances"."trip_id" = "transit"."stop_times"."trip_id");

CREATE UNIQUE INDEX ON transit.stop_time_static_instances (trip_instance_id, stop_sequence);

CREATE VIEW "transit"."stop_time_instances" AS (
        -- Branch 1: rt.stop_id IS NOT NULL → join on (trip_instance_id, stop_id)
        -- Covers: rt+st matched rows, rt-only ADDED/unmatched rows, and st-only rows
        SELECT
            rt.id,
            COALESCE(rt.trip_instance_id, st.trip_instance_id) AS trip_instance_id,
            COALESCE(rt.stop_time_id,     st.stop_time_id)     AS stop_time_id,
            COALESCE(rt.stop_sequence,    st.stop_sequence)    AS stop_sequence,
            COALESCE(rt.stop_id,          st.stop_id)          AS stop_id,
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
            rt.last_updated_at
        FROM transit.stop_time_realtime_instances rt
        FULL JOIN transit.stop_time_static_instances st
            ON  rt.trip_instance_id = st.trip_instance_id
            AND rt.stop_id          = st.stop_id           
        WHERE rt.stop_id IS NOT NULL                        -- rt rows matched by stop_id
           OR rt.trip_instance_id IS NULL                   -- st-only rows (no rt counterpart)
 
        UNION ALL
 
        -- Branch 2: rt.stop_id IS NULL → join on (trip_instance_id, stop_sequence)
        -- Covers: rt+st matched rows and rt-only rows where stop_id was omitted
        SELECT
            rt.id,
            COALESCE(rt.trip_instance_id, st.trip_instance_id) AS trip_instance_id,
            COALESCE(rt.stop_time_id,     st.stop_time_id)     AS stop_time_id,
            COALESCE(rt.stop_sequence,    st.stop_sequence)    AS stop_sequence,
            COALESCE(rt.stop_id,          st.stop_id)          AS stop_id,
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
            rt.last_updated_at
        FROM transit.stop_time_realtime_instances rt
        FULL JOIN transit.stop_time_static_instances st
            ON  rt.trip_instance_id = st.trip_instance_id
            AND rt.stop_sequence    = st.stop_sequence      
        WHERE rt.stop_id IS NULL                            -- only rt rows without a stop_id
            AND rt.id IS NOT NULL  -- exclude st-only rows (handled by Branch 1)
    );--> statement-breakpoint 
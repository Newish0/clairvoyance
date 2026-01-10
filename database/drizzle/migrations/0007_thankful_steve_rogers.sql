CREATE INDEX "idx_trip_instances_trip_date_time_state" ON "transit"."trip_instances" USING btree ("trip_id","start_date","start_time","state");--> statement-breakpoint
CREATE VIEW "transit"."stop_times_static_instances" AS (select "transit"."trip_instances"."id" as "trip_instance_id", "transit"."stop_times"."id" as "stop_time_id", "transit"."stop_times"."stop_sequence", "transit"."stop_times"."timepoint", ("transit"."trip_instances"."start_datetime" + (
                "transit"."stop_times"."arrival_time"::interval - (
                    SELECT "transit"."stop_times"."arrival_time"::interval
                    FROM "transit"."stop_times"
                    WHERE "transit"."stop_times"."trip_id" = "transit"."trip_instances"."trip_id"
                    AND "transit"."stop_times"."stop_sequence" = 0
                )
            ))::timestamptz as "scheduled_arrival_time", ("transit"."trip_instances"."start_datetime" + (
                "transit"."stop_times"."departure_time"::interval - (
                    SELECT "transit"."stop_times"."arrival_time"::interval
                    FROM "transit"."stop_times"
                    WHERE "transit"."stop_times"."trip_id" = "transit"."trip_instances"."trip_id"
                    AND "transit"."stop_times"."stop_sequence" = 0
                )
            ))::timestamptz as "scheduled_departure_time", "transit"."stop_times"."stop_headsign", "transit"."stop_times"."pickup_type", "transit"."stop_times"."drop_off_type" from "transit"."trip_instances" inner join "transit"."stop_times" on "transit"."trip_instances"."trip_id" = "transit"."stop_times"."trip_id");
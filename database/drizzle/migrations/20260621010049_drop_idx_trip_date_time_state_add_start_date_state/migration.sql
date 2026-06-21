DROP INDEX "transit"."idx_trip_instances_trip_date_time_state";--> statement-breakpoint
CREATE INDEX "idx_trip_instances_start_date_state" ON "transit"."trip_instances" ("start_date","state");
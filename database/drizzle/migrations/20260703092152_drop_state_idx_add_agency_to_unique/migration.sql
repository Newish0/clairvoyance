ALTER TABLE "transit"."trip_instances" DROP CONSTRAINT "uq_trip_instances_trip_start_date_start_time";--> statement-breakpoint
DROP INDEX "transit"."idx_trip_instances_start_date_state";--> statement-breakpoint
ALTER TABLE "transit"."trip_instances" ADD CONSTRAINT "uq_trip_instances_agency_trip_start_date_start_time" UNIQUE("agency_id","trip_id","start_date","start_time");--> statement-breakpoint
CREATE INDEX "idx_trip_instances_start_date" ON "transit"."trip_instances" ("start_date");
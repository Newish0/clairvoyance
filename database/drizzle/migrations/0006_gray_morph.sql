CREATE INDEX "idx_calendar_dates_agency_date" ON "transit"."calendar_dates" USING btree ("agency_id","date");--> statement-breakpoint
CREATE INDEX "idx_stop_times_trip_id_sequence" ON "transit"."stop_times" USING btree ("trip_id","stop_sequence");--> statement-breakpoint
CREATE INDEX "idx_trips_agency_service" ON "transit"."trips" USING btree ("agency_id","service_sid");
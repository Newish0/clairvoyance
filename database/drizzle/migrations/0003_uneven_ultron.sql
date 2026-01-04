DROP INDEX "transit"."idx_stops_agency_stop_sid";--> statement-breakpoint
ALTER TABLE "transit"."stops" ADD CONSTRAINT "uq_stops_agency_stop_sid" UNIQUE("agency_id","stop_sid");
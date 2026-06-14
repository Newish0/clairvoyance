CREATE TABLE "transit"."alert_entities" (
	"id" serial PRIMARY KEY,
	"alert_id" integer NOT NULL,
	"agency_id" text,
	"route_id" integer,
	"route_type" "transit"."route_type",
	"direction" "transit"."direction",
	"trip_instance_id" integer,
	"stop_id" integer
);
--> statement-breakpoint
CREATE INDEX "idx_alert_entities_alert_id" ON "transit"."alert_entities" ("alert_id");--> statement-breakpoint
CREATE INDEX "idx_alert_entities_route_id" ON "transit"."alert_entities" ("route_id");--> statement-breakpoint
CREATE INDEX "idx_alert_entities_trip_instance_id" ON "transit"."alert_entities" ("trip_instance_id");--> statement-breakpoint
CREATE INDEX "idx_alert_entities_stop_id" ON "transit"."alert_entities" ("stop_id");--> statement-breakpoint
CREATE INDEX "idx_alert_entities_agency_id" ON "transit"."alert_entities" ("agency_id");--> statement-breakpoint
ALTER TABLE "transit"."alert_entities" ADD CONSTRAINT "alert_entities_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "transit"."alerts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transit"."alert_entities" ADD CONSTRAINT "alert_entities_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");--> statement-breakpoint
ALTER TABLE "transit"."alert_entities" ADD CONSTRAINT "alert_entities_route_id_routes_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transit"."routes"("id");--> statement-breakpoint
ALTER TABLE "transit"."alert_entities" ADD CONSTRAINT "alert_entities_trip_instance_id_trip_instances_id_fkey" FOREIGN KEY ("trip_instance_id") REFERENCES "transit"."trip_instances"("id");--> statement-breakpoint
ALTER TABLE "transit"."alert_entities" ADD CONSTRAINT "alert_entities_stop_id_stops_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit"."stops"("id");
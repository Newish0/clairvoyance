ALTER TABLE "vehicle_position" ADD COLUMN "stop_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicle_position" ADD CONSTRAINT "vehicle_position_stop_id_stops_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("stop_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

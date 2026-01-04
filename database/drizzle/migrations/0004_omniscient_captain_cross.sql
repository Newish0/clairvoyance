ALTER TABLE "transit"."stop_times" ALTER COLUMN "arrival_time" SET DATA TYPE char(8);--> statement-breakpoint
ALTER TABLE "transit"."stop_times" ALTER COLUMN "departure_time" SET DATA TYPE char(8);--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "timepoint" timepoint DEFAULT 'EXACT';--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "stop_sequence" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "scheduled_arrival_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "scheduled_departure_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "stop_headsign" text;--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "pickup_type" "transit"."pickup_drop_off";--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "drop_off_type" "transit"."pickup_drop_off";--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD COLUMN "last_updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "transit"."stop_time_instances" ADD CONSTRAINT "uq_stop_time_instances__trip_instance_stop_sequence" UNIQUE("trip_instance_id","stop_sequence");
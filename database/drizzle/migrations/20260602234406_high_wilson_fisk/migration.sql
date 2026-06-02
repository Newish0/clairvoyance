ALTER TABLE "transit"."stop_times" ALTER COLUMN "agency_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transit"."stops" ALTER COLUMN "agency_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transit"."trips" ALTER COLUMN "agency_id" SET NOT NULL;
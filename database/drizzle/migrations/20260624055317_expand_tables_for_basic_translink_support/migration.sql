ALTER TYPE "transit"."wheelchair_boarding" RENAME TO "accessability";--> statement-breakpoint
CREATE TABLE "transit"."calendars" (
	"agency_id" text,
	"service_sid" text,
	"monday" boolean DEFAULT false NOT NULL,
	"tuesday" boolean DEFAULT false NOT NULL,
	"wednesday" boolean DEFAULT false NOT NULL,
	"thursday" boolean DEFAULT false NOT NULL,
	"friday" boolean DEFAULT false NOT NULL,
	"saturday" boolean DEFAULT false NOT NULL,
	"sunday" boolean DEFAULT false NOT NULL,
	"start_date" varchar(8) NOT NULL,
	"end_date" varchar(8) NOT NULL,
	CONSTRAINT "calendars_pkey" PRIMARY KEY("agency_id","service_sid")
);
--> statement-breakpoint
ALTER TABLE "transit"."trips" RENAME COLUMN "block_id" TO "block_sid";--> statement-breakpoint
ALTER TABLE "transit"."stops" ADD COLUMN "parent_station_sid" text;--> statement-breakpoint
ALTER TABLE "transit"."trips" ADD COLUMN "wheelchair_accessible" "transit"."accessability";--> statement-breakpoint
ALTER TABLE "transit"."trips" ADD COLUMN "bikes_allowed" "transit"."accessability";--> statement-breakpoint
CREATE INDEX "idx_calendars_agency_date_range" ON "transit"."calendars" ("agency_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "transit"."calendars" ADD CONSTRAINT "calendars_agency_id_agencies_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id");
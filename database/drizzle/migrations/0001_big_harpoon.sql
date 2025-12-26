CREATE TABLE "transit"."feed_info" (
	"hash" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"publisher_name" text,
	"publisher_url" text,
	"lang" varchar(10),
	"version" text,
	"start_date" varchar(8),
	"end_date" varchar(8),
	CONSTRAINT "uq_feed_info_feed_hash" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "transit"."feed_info" ADD CONSTRAINT "feed_info_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "transit"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feed_info_agency_id" ON "transit"."feed_info" USING btree ("agency_id");
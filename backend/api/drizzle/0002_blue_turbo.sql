CREATE TABLE IF NOT EXISTS "stop_time_updates" (
	"trip_id" varchar(255),
	"trip_start_time" varchar(255),
	"direction_id" integer,
	"route_id" varchar(255),
	"stop_id" varchar(255),
	"stop_sequence" integer,
	"arrival_delay" integer,
	"departure_delay" integer,
	"departure_timestamp" varchar(255),
	"arrival_timestamp" varchar(255),
	"schedule_relationship" varchar(255),
	"is_updated" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stop_time_updates_trip_id_stop_sequence_pk" PRIMARY KEY("trip_id","stop_sequence")
);

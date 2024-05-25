ALTER TABLE "stop_time_updates" ADD COLUMN "tmp_departure_timestamp" integer;
UPDATE "stop_time_updates" SET "tmp_departure_timestamp" = ("departure_timestamp"::integer+0)::integer;
ALTER TABLE "stop_time_updates" DROP COLUMN "departure_timestamp";
ALTER TABLE "stop_time_updates" RENAME COLUMN "tmp_departure_timestamp" TO "departure_timestamp";

ALTER TABLE "trip_updates" ADD COLUMN "tmp_timestamp" integer;
UPDATE "trip_updates" SET "tmp_timestamp" = ("timestamp"::integer+0)::integer;
ALTER TABLE "trip_updates" DROP COLUMN "timestamp";
ALTER TABLE "trip_updates" RENAME COLUMN "tmp_timestamp" TO "timestamp";

ALTER TABLE "trip_updates" ADD COLUMN "tmp_schedule_relationship" integer;
UPDATE "trip_updates" SET "tmp_schedule_relationship" = ("schedule_relationship"::integer+0)::integer;
ALTER TABLE "trip_updates" DROP COLUMN "schedule_relationship";
ALTER TABLE "trip_updates" RENAME COLUMN "tmp_schedule_relationship" TO "schedule_relationship";


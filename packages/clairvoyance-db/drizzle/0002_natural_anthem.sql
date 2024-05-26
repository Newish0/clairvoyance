ALTER TABLE "stop_time_updates" ADD COLUMN "tmp_departure_timestamp" integer;
UPDATE "stop_time_updates" SET "tmp_departure_timestamp" = ("departure_timestamp"::integer+0)::integer;
ALTER TABLE "stop_time_updates" DROP COLUMN "departure_timestamp";
ALTER TABLE "stop_time_updates" RENAME COLUMN "tmp_departure_timestamp" TO "departure_timestamp";

ALTER TABLE "stop_time_updates" ADD COLUMN "tmp_arrival_timestamp" integer;
UPDATE "stop_time_updates" SET "tmp_arrival_timestamp" = ("arrival_timestamp"::integer+0)::integer;
ALTER TABLE "stop_time_updates" DROP COLUMN "arrival_timestamp";
ALTER TABLE "stop_time_updates" RENAME COLUMN "tmp_arrival_timestamp" TO "arrival_timestamp";

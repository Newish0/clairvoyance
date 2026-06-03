-- Custom SQL migration file, put your code below! --

-- To ensure we can refresh materialized view concurrently, we need to create a unique index
CREATE UNIQUE INDEX ON transit.stop_time_static_instances (trip_instance_id, stop_sequence);
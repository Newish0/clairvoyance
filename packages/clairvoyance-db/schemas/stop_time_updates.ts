// -- Table: stop_time_updates
// CREATE TABLE IF NOT EXISTS stop_time_updates (
//     trip_id varchar(255),
//     trip_start_time varchar(255),
//     direction_id integer,
//     route_id varchar(255),
//     stop_id varchar(255),
//     stop_sequence integer,
//     arrival_delay integer,
//     departure_delay integer,
//     departure_timestamp varchar(255),
//     arrival_timestamp varchar(255),
//     schedule_relationship varchar(255),
//     is_updated integer CHECK(
//         is_updated >= 0
//         AND is_updated <= 1
//     ) NOT NULL DEFAULT 1
// );

import { relations } from "drizzle-orm";
import { integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";
import { stop_times } from "./stop_times";

export const stop_time_updates = pgTable(
    "stop_time_updates",
    {
        trip_id: varchar("trip_id", { length: 255 }),
        stop_id: varchar("stop_id", { length: 255 }),
        stop_sequence: integer("stop_sequence"),
        arrival_delay: integer("arrival_delay"),
        departure_delay: integer("departure_delay"),
        departure_timestamp: varchar("departure_timestamp", { length: 255 }),
        arrival_timestamp: varchar("arrival_timestamp", { length: 255 }),
        schedule_relationship: varchar("schedule_relationship", { length: 255 }),
    },
    (stop_time_updates) => ({
        primaryKey: primaryKey({
            columns: [stop_time_updates.trip_id, stop_time_updates.stop_sequence],
        }),
    })
);

export const stopTimeUpdatesRelation = relations(stop_time_updates, ({ one }) => ({
    stop_time: one(stop_times, {
        fields: [stop_time_updates.trip_id, stop_time_updates.stop_sequence],
        references: [stop_times.trip_id, stop_times.stop_sequence],
    }),
}));

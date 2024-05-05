import { pgTable, varchar, integer, real, primaryKey, timestamp, time } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { relations } from "drizzle-orm";
import { stops } from "./stops";

export const stop_times = pgTable(
    "stop_times",
    {
        trip_id: varchar("trip_id", { length: 255 })
            .notNull()
            .references(() => trips.trip_id),

        arrival_time: varchar("arrival_time", { length: 255 }),
        arrival_timestamp: integer("arrival_timestamp"),
        departure_time: varchar("departure_time", { length: 255 }),
        departure_timestamp: integer("departure_timestamp"),

        stop_id: varchar("stop_id", { length: 255 })
            .notNull()
            .references(() => stops.stop_id),

        stop_sequence: integer("stop_sequence").notNull(),
        stop_headsign: varchar("stop_headsign", { length: 255 }),
        pickup_type: integer("pickup_type"),
        // .check((val) => val >= 0 && val <= 3),

        drop_off_type: integer("drop_off_type"),
        // .check((val) => val >= 0 && val <= 3),

        continuous_pickup: integer("continuous_pickup"),
        // .check((val) => val >= 0 && val <= 3),

        continuous_drop_off: integer("continuous_drop_off"),
        // .check((val) => val >= 0 && val <= 3),

        shape_dist_traveled: real("shape_dist_traveled"),

        timepoint: integer("timepoint"),
        // .check((val) => val >= 0 && val <= 1),
    },
    (stop_times) => ({
        primaryKey: primaryKey({ columns: [stop_times.trip_id, stop_times.stop_sequence] }),
    })
);

export const stopTimesRelations = relations(stop_times, ({ one }) => ({
    trip: one(trips, {
        fields: [stop_times.trip_id],
        references: [trips.trip_id],
    }),
    stop: one(stops, {
        fields: [stop_times.stop_id],
        references: [stops.stop_id],
    }),
}));

// -- Table: stop_times
// CREATE TABLE IF NOT EXISTS stop_times (
//     trip_id varchar(255) NOT NULL,
//     arrival_time varchar(255),
//     arrival_timestamp integer,
//     departure_time varchar(255),
//     departure_timestamp integer,
//     stop_id varchar(255) NOT NULL,
//     stop_sequence integer NOT NULL,
//     stop_headsign varchar(255) COLLATE NOCASE,
//     pickup_type integer CHECK(
//         pickup_type >= 0
//         AND pickup_type <= 3
//     ),
//     drop_off_type integer CHECK(
//         drop_off_type >= 0
//         AND drop_off_type <= 3
//     ),
//     continuous_pickup integer CHECK(
//         continuous_pickup >= 0
//         AND continuous_pickup <= 3
//     ),
//     continuous_drop_off integer CHECK(
//         continuous_drop_off >= 0
//         AND continuous_drop_off <= 3
//     ),
//     shape_dist_traveled real,
//     timepoint integer CHECK(
//         timepoint >= 0
//         AND timepoint <= 1
//     ),
//     PRIMARY KEY (trip_id, stop_sequence)
// );

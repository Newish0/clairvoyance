import { integer, pgTable, primaryKey, serial, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { routes } from "./routes";
import { realtime_vehicle_position as rtvpTable } from "./rtvp";
import { relations } from "drizzle-orm/relations";

export const tripUpdates = pgTable(
    "trip_updates",
    {
        trip_update_id: serial("trip_update_id").primaryKey().notNull(),
        trip_id: varchar("trip_id", { length: 255 }).references(() => trips.trip_id),
        trip_start_time: varchar("trip_start_time", { length: 255 }),
        direction_id: integer("direction_id"),
        route_id: varchar("route_id", { length: 255 }).references(() => routes.route_id),
        start_date: varchar("start_date", { length: 255 }),
        timestamp: varchar("timestamp", { length: 255 }),
        schedule_relationship: varchar("schedule_relationship", { length: 255 }),
        trip_start_timestamp: timestamp("trip_start_timestamp", { mode: "date", withTimezone: true }),
    },
    (tripUpdates) => ({
        unq: unique()
            .on(tripUpdates.trip_id, tripUpdates.start_date, tripUpdates.trip_start_time)
            .nullsNotDistinct(),
    })
);

export const tripUpdatesRelation = relations(tripUpdates, ({ one, many }) => ({
    trip: one(trips, {
        fields: [tripUpdates.trip_id],
        references: [trips.trip_id],
    }),
    route: one(routes, {
        fields: [tripUpdates.route_id],
        references: [routes.route_id],
    }),
    rtvps: many(rtvpTable),
}));

// CREATE TABLE IF NOT EXISTS trip_updates (
//     update_id varchar(255) NOT NULL,
//     vehicle_id varchar(255),
//     trip_id varchar(255),
//     trip_start_time varchar(255),
//     direction_id integer,
//     route_id varchar(255),
//     start_date varchar(255),
//     timestamp varchar(255),
//     schedule_relationship varchar(255),
//     is_updated integer CHECK(
//         is_updated >= 0
//         AND is_updated <= 1
//     ) NOT NULL DEFAULT 1,
//     PRIMARY KEY (update_id)
// );

import {
    integer,
    pgEnum,
    pgTable,
    serial,
    uniqueIndex,
    varchar,
    real,
    timestamp,
} from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { relations } from "drizzle-orm";
import { trip_updates } from "./trip_updates";

export const realtime_vehicle_position = pgTable(
    "vehicle_position",
    {
        rtvp_id: serial("rtvp_id").primaryKey().notNull(),

        bearing: real("bearing"),
        latitude: real("latitude"),
        longitude: real("longitude"),
        speed: real("speed"),

        trip_id: varchar("trip_id", { length: 255 }).references(() => trips.trip_id),
        vehicle_id: varchar("vehicle_id", { length: 255 }),
        timestamp: timestamp("rtvp_timestamp", { mode: "date", withTimezone: true }).notNull(),

        p_traveled: real("p_traveled"),

        trip_update_id: integer("trip_update_id")
            .references(() => trip_updates.trip_update_id)
            .notNull(),
    },
    (rtvp) => ({})
);

export const rtvpRelations = relations(realtime_vehicle_position, ({ one }) => ({
    trip: one(trips, {
        fields: [realtime_vehicle_position.trip_id],
        references: [trips.trip_id],
    }),
    tripUpdate: one(trip_updates, {
        fields: [realtime_vehicle_position.trip_update_id],
        references: [trip_updates.trip_update_id],
    }),
}));
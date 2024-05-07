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
import { tripUpdates } from "./trip_updates";

export const realtime_vehicle_position = pgTable(
    "vehicle_position",
    {
        rtvp_id: serial("rtvp_id").primaryKey().notNull(),

        bearing: real("bearing"),
        latitude: real("latitude"),
        longitude: real("longitude"),
        speed: real("speed"),

        trip_id: varchar("trip_id", { length: 255 }).references(() => trips.trip_id),
        vehicle_id: varchar("vehicle_id", { length: 255 }).notNull(),
        timestamp: timestamp("rtvp_timestamp", { mode: "date" }).notNull(),
        is_updated: integer("is_updated").notNull(),

        p_traveled: real("p_traveled"),

        trip_update_id: integer("trip_update_id")
            .references(() => tripUpdates.trip_update_id)
            .notNull(),
    },
    (rtvp) => ({})
);

export const rtvpRelations = relations(realtime_vehicle_position, ({ one }) => ({
    route: one(trips, {
        fields: [realtime_vehicle_position.trip_id],
        references: [trips.trip_id],
    }),
    tripUpdate: one(tripUpdates, {
        fields: [realtime_vehicle_position.trip_update_id],
        references: [tripUpdates.trip_update_id],
    }),
}));

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
        rel_timestamp: integer("rel_timestamp"), // Assumes a trip won't run longer than 32 bits int
    },
    (rtvp) => ({})
);
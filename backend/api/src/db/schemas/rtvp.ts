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

export const realtime_vehical_position = pgTable(
    "vehical_position",
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

        percentage: real("percentage"),
        rel_timestamp: integer("rel_timestamp"),
    },
    (rtvp) => ({})
);

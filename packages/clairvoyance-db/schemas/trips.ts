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
import { shapes } from "./shapes";
import { routes } from "./routes";
import { relations } from "drizzle-orm";
import { realtime_vehicle_position } from "./rtvp";

export const trips = pgTable("trips", {
    trip_id: varchar("trip_id", { length: 255 }).primaryKey(),

    route_id: varchar("route_id", { length: 255 })
        .notNull()
        .references(() => routes.route_id),

    service_id: varchar("service_id", { length: 255 }).notNull(), // TODO: add ref to calendar (NOT calendar_dates)

    trip_headsign: varchar("trip_headsign", { length: 255 }),
    trip_short_name: varchar("trip_short_name", { length: 255 }),

    direction_id: integer("direction_id"),
    // .check((value) => value >= 0 && value <= 1)

    block_id: varchar("block_id", { length: 255 }),
    shape_id: varchar("shape_id", { length: 255 }),

    wheelchair_accessible: integer("wheelchair_accessible"),
    // .check((value) => value >= 0 && value <= 2)

    bikes_allowed: integer("bikes_allowed"),
    // .check((value) => value >= 0 && value <= 2)
});

export const tripRelations = relations(trips, ({ one, many }) => ({
    route: one(routes, {
        fields: [trips.route_id],
        references: [routes.route_id],
    }),
    rtvps: many(realtime_vehicle_position),
}));
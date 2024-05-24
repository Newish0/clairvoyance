import { integer, pgEnum, pgTable, serial, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const routes = pgTable(
    "routes",
    {
        route_id: varchar("route_id", { length: 255 }).primaryKey().notNull(),

        agency_id: varchar("agency_id", { length: 255 }), // TODO: add ref to agency foreign key

        route_short_name: varchar("route_short_name", { length: 255 }),
        route_long_name: varchar("route_long_name", { length: 255 }),
        route_desc: varchar("route_desc", { length: 255 }),
        route_type: integer("route_type").notNull(),
        route_url: varchar("route_url", { length: 2047 }),
        route_color: varchar("route_color", { length: 255 }),
        route_text_color: varchar("route_text_color", { length: 255 }),
        route_sort_order: integer("route_sort_order"),
        continuous_pickup: integer("continuous_pickup"),
        continuous_drop_off: integer("continuous_drop_off"),
        network_id: varchar("network_id", { length: 255 }),
    },
    (routes) => {
        return {};
    }
);

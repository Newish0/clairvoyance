import { pgEnum, pgTable, serial, varchar, real, integer } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { relations } from "drizzle-orm";

export const stops = pgTable("stops", {
    stop_id: varchar("stop_id", { length: 255 }).primaryKey().notNull(),
    stop_code: varchar("stop_code", { length: 255 }),
    stop_name: varchar("stop_name", { length: 255 }),
    tts_stop_name: varchar("tts_stop_name", { length: 255 }),
    stop_desc: varchar("stop_desc", { length: 255 }),
    stop_lat: real("stop_lat"),
    stop_lon: real("stop_lon"),
    zone_id: varchar("zone_id", { length: 255 }),
    stop_url: varchar("stop_url", { length: 2047 }),
    location_type: integer("location_type"),
    parent_station: varchar("parent_station", { length: 255 }),
    stop_timezone: varchar("stop_timezone", { length: 255 }),
    wheelchair_boarding: integer("wheelchair_boarding"),
    level_id: varchar("level_id", { length: 255 }),
    platform_code: varchar("platform_code", { length: 255 }),
});

export const stopsRelations = relations(stops, ({ many }) => ({
    trips: many(trips),
}));

// CREATE TABLE IF NOT EXISTS stops (
//     stop_id varchar(255) NOT NULL,
//     stop_code varchar(255),
//     stop_name varchar(255) COLLATE NOCASE,
//     tts_stop_name varchar(255) COLLATE NOCASE,
//     stop_desc varchar(255) COLLATE NOCASE,
//     stop_lat real CHECK(
//         stop_lat >= -90
//         AND stop_lat <= 90
//     ),
//     stop_lon real CHECK(
//         stop_lon >= -180
//         AND stop_lon <= 180
//     ),
//     zone_id varchar(255),
//     stop_url varchar(2047),
//     location_type integer CHECK(
//         location_type >= 0
//         AND location_type <= 4
//     ),
//     parent_station varchar(255),
//     stop_timezone varchar(255),
//     wheelchair_boarding integer CHECK(
//         wheelchair_boarding >= 0
//         AND wheelchair_boarding <= 2
//     ),
//     level_id varchar(255),
//     platform_code varchar(255),
//     PRIMARY KEY (stop_id)
// );

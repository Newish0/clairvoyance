import {
    integer,
    pgEnum,
    pgTable,
    serial,
    uniqueIndex,
    varchar,
    real,
    primaryKey,
} from "drizzle-orm/pg-core";

export const shapes = pgTable(
    "shapes",
    {
        shape_id: varchar("shape_id", { length: 255 }).notNull(),

        shape_pt_lat: real("shape_pt_lat").notNull(),
        //.check((val) => val >= -90 && val <= 90)

        shape_pt_lon: real("shape_pt_lon").notNull(),
        // .check((val) => val >= -180 && val <= 180)

        shape_pt_sequence: integer("shape_pt_sequence").notNull(),
        shape_dist_traveled: real("shape_dist_traveled"),
    },
    (shapes) => ({
        primaryKey: primaryKey({ columns: [shapes.shape_id, shapes.shape_pt_sequence] }),
    })
);

import {
    integer,
    pgTable,
    varchar,
    smallint,
    numeric,
    primaryKey,
    doublePrecision,
} from "drizzle-orm/pg-core";
import { routes } from "./routes";

export const rtvp_polyregr = pgTable(
    "rtvp_polyregr",
    {
        route_id: varchar("route_id", { length: 255 })
            .references(() => routes.route_id)
            .notNull(),
        direction_id: integer("direction_id").notNull(),
        ci: doublePrecision("coefficient").notNull(),
        i: smallint("coefficient_index").notNull(),
    },
    (rtvp_polyregr) => ({
        pk: primaryKey({ columns: [rtvp_polyregr.route_id, rtvp_polyregr.direction_id, rtvp_polyregr.i] }),
    })
);

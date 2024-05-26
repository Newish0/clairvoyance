import { sql } from "drizzle-orm";
import { pgView, integer, text, real } from "drizzle-orm/pg-core";

// Define the stop_times_p_traveled view
export const stopTimesPTraveled = pgView("stop_times_p_traveled", {
    trip_id: text("trip_id").notNull(),
    stop_id: text("stop_id").notNull(),
    stop_sequence: integer("stop_sequence").notNull(),
    shape_dist_traveled: real("shape_dist_traveled").notNull(),
    p_traveled: real("p_traveled").notNull(),
}).as(sql`
        SELECT 
            st1.trip_id,
            st1.stop_id,
            st1.stop_sequence,
            st1.shape_dist_traveled,
            st1.shape_dist_traveled / (
                SELECT st2.shape_dist_traveled
                FROM stop_times st2
                WHERE st2.trip_id = st1.trip_id
                ORDER BY st2.stop_sequence DESC
                LIMIT 1
            ) AS p_traveled
        FROM 
            stop_times st1
    `);

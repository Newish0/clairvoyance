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
            st1.shape_dist_traveled / last_stop.last_shape_dist_traveled AS p_traveled
        FROM 
            stop_times st1
        JOIN 
            (SELECT 
                trip_id, 
                MAX(stop_sequence) AS last_stop_sequence,
                MAX(shape_dist_traveled) AS last_shape_dist_traveled
            FROM 
                stop_times
            GROUP BY 
                trip_id
            ) AS last_stop
        ON 
            st1.trip_id = last_stop.trip_id;
    `);

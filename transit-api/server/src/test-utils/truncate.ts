import { sql } from "drizzle-orm";

const ALL_TABLES = [
    "agencies",
    "routes",
    "stops",
    "trips",
    "stop_times",
    "trip_instances",
    "stop_time_realtime_instances",
    "vehicles",
    "vehicle_positions",
    "alerts",
    "shapes",
    "feed_info",
    "calendar_dates",
    "stop_time_static_instances",
];

export async function truncateAll(db: any) {
    for (const table of ALL_TABLES) {
        await db.execute(sql.raw(`TRUNCATE TABLE transit.${table} CASCADE`));
    }
}

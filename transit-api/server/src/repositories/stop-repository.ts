import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { eq, getColumns, inArray, sql } from "drizzle-orm";
import { DataRepository } from "./data-repository";

export class StopRepository extends DataRepository {
    public async findStopById(stopId: typeof tables.stops.$inferSelect.id) {
        return this.db.select().from(tables.stops).where(eq(tables.stops.id, stopId));
    }

    /** Look up stops by internal numeric IDs */
    public async findAllStopsByIds(stopIds: (typeof tables.stops.$inferSelect.id)[]) {
        return this.db.select().from(tables.stops).where(inArray(tables.stops.id, stopIds));
    }

    public async findNearbyStops({
        lat,
        lng,
        radiusMeters,
    }: {
        lat: number;
        lng: number;
        radiusMeters: number;
    }) {
        return this.db
            .select({
                ...getColumns(tables.stops),
                distanceMeters: sql<number>`ST_Distance(
                    ${tables.stops.location}::geography,
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                )`.as("distance_meters"),
                // null for stops with no trips (parent stations, placeholders etc.)
                routes: views.stopRoutes.routes,
            })
            .from(tables.stops)
            .leftJoin(views.stopRoutes, eq(views.stopRoutes.stopId, tables.stops.id))
            .where(
                sql`ST_DWithin(
                    ${tables.stops.location}::geography,
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                    ${radiusMeters}
                )`,
            )
            .orderBy((t) => t.distanceMeters);
    }
}

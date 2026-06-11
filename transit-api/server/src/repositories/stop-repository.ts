import { DataRepository } from "./data-repository";
import * as tables from "database/models/tables";
import { and, eq, getColumns, inArray, sql, isNotNull } from "drizzle-orm";
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
        // Aggregate distinct route short names per stop.
        const stopRoutes = this.db.$with("stop_routes").as(
            this.db
                .select({
                    stopId: tables.stopTimes.stopId,
                    routeShortNames: sql<
                        string[]
                    >`array_agg(DISTINCT ${tables.routes.shortName})`.as("route_short_names"),
                })
                .from(tables.stopTimes)
                .innerJoin(tables.trips, eq(tables.stopTimes.tripId, tables.trips.id))
                .innerJoin(tables.routes, eq(tables.trips.routeId, tables.routes.id))
                .where(isNotNull(tables.routes.shortName))
                .groupBy(tables.stopTimes.stopId),
        );

        return this.db
            .with(stopRoutes)
            .select({
                ...getColumns(tables.stops),
                distanceMeters: sql<number>`ST_Distance(
                    ${tables.stops.location}::geography,
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                )`.as("distance_meters"),
                // null for stops with no trips (parent stations, placeholders etc.)
                routeShortNames: stopRoutes.routeShortNames,
            })
            .from(tables.stops)
            .leftJoin(stopRoutes, eq(stopRoutes.stopId, tables.stops.id))
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

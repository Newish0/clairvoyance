import { DataRepository } from "./data-repository";
import { routes, stops, stopTimes, trips } from "database";
import { eq, and, inArray, sql } from "drizzle-orm";

export class RoutesByStopRepository extends DataRepository {
    public async findNearbyRoutesByStop(
        query:
            | { stopObjectId: string }
            | { agencyId: string; stopId: string },
        radiusMeters = 100,
    ) {
        // Find the stop
        let stop: typeof stops.$inferSelect | undefined;
        if ("stopObjectId" in query) {
            const [s] = await this.db
                .select()
                .from(stops)
                .where(eq(stops.id, Number(query.stopObjectId)));
            stop = s;
        } else {
            const [s] = await this.db
                .select()
                .from(stops)
                .where(and(eq(stops.agencyId, query.agencyId), eq(stops.stopSid, query.stopId)));
            stop = s;
        }

        if (!stop?.location) {
            return [];
        }

        // Find nearby stops using PostGIS
        const nearbyStops = await this.db
            .select({ id: stops.id })
            .from(stops)
            .where(
                sql`ST_DWithin(
                    ${stops.location}::geography,
                    (SELECT ${stops.location}::geography FROM ${stops} WHERE ${stops.id} = ${stop.id}),
                    ${radiusMeters}
                )`,
            );

        if (nearbyStops.length === 0) {
            return [];
        }

        const nearbyStopIds = nearbyStops.map((s) => s.id);

        // Find routes serving these stops through stop_times -> trips
        const servingRoutes = await this.db
            .selectDistinct()
            .from(routes)
            .innerJoin(trips, eq(trips.routeId, routes.id))
            .innerJoin(stopTimes, eq(stopTimes.tripId, trips.id))
            .where(inArray(stopTimes.stopId, nearbyStopIds));

        return servingRoutes.map((r) => r.routes);
    }
}

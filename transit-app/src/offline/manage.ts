import type { OfflineArea } from "@/hooks/use-offline-areas";

import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { inArray, notInArray, sql } from "drizzle-orm";
import type { PGliteDb } from "./db";
import { upsertMany } from "./upsert";

/**
 * Delete every row in the local pglite cache that isn't reachable from at
 * least one of `keepAreas`. Uses locally-cached stop_times + trip_instances
 * instead of the old materialized stop_time_static_instances table.
 *
 * Pass the full, up-to-date list of areas you want to KEEP (i.e. already
 * excluding anything the user just removed).
 */
export async function pruneOfflineData(db: PGliteDb, keepAreas: OfflineArea[]): Promise<void> {
    const keepStopIds = new Set<number>();
    const keepTripInstanceIds = new Set<number>();
    const keepTripIds = new Set<number>();
    const keepRouteIds = new Set<number>();
    const keepShapeIds = new Set<number>();

    // --- Union the reachable id sets across every kept area ---
    for (const area of keepAreas) {
        const [[west, south], [east, north]] = area.bbox;
        const [startEpochMs, endEpochMs] = area.dateRange;

        const stopsInBbox = await db
            .select({ id: tables.stops.id })
            .from(tables.stops)
            .where(
                sql`${tables.stops.location}::geometry && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`,
            );

        if (stopsInBbox.length === 0) continue;

        const stopIdsInBbox = stopsInBbox.map((s) => s.id);

        // Find trip_ids that serve stops in this bbox
        const tripRows = await db
            .select({ tripId: tables.stopTimes.tripId })
            .from(tables.stopTimes)
            .where(inArray(tables.stopTimes.stopId, stopIdsInBbox));
        const tripIdsForBbox = [...new Set(tripRows.map((r) => r.tripId))];
        if (tripIdsForBbox.length === 0) continue;

        // Find trip instances for those trips within the date range
        const tripInstances = await db.query.tripInstances.findMany({
            columns: { id: true, tripId: true, routeId: true },
            where: {
                tripId: { in: tripIdsForBbox },
                startDatetime: {
                    gte: new Date(startEpochMs),
                    lte: new Date(endEpochMs),
                },
            },
        });

        for (const ti of tripInstances) {
            keepTripInstanceIds.add(ti.id);
            keepTripIds.add(ti.tripId);
            keepRouteIds.add(ti.routeId);
        }
    }

    if (keepTripIds.size > 0) {
        const trips = await db.query.trips.findMany({
            columns: { shapeId: true },
            where: { id: { in: [...keepTripIds] }, shapeId: { isNotNull: true } },
        });
        trips.map((t) => t.shapeId!).forEach((id) => keepShapeIds.add(id));

        // Full set of stops visited by kept trips - re-derive from stop_times
        // rather than relying on the initial bbox hit.
        const allStopRows = await db.query.stopTimes.findMany({
            columns: { stopId: true },
            where: { tripId: { in: [...keepTripIds] } },
        });
        allStopRows.forEach((r) => keepStopIds.add(r.stopId));
    }

    // --- Delete leaf -> root. No FK constraints locally, so order only
    // matters for tidiness, not correctness. ---
    await db.transaction(async (tx) => {
        await tx
            .delete(tables.tripInstances)
            .where(
                keepTripInstanceIds.size > 0
                    ? notInArray(tables.tripInstances.id, [...keepTripInstanceIds])
                    : sql`true`,
            );

        await tx
            .delete(tables.stopTimes)
            .where(
                keepTripIds.size > 0
                    ? notInArray(tables.stopTimes.tripId, [...keepTripIds])
                    : sql`true`,
            );

        await tx
            .delete(tables.trips)
            .where(
                keepTripIds.size > 0 ? notInArray(tables.trips.id, [...keepTripIds]) : sql`true`,
            );

        await tx
            .delete(tables.routes)
            .where(
                keepRouteIds.size > 0 ? notInArray(tables.routes.id, [...keepRouteIds]) : sql`true`,
            );

        await tx
            .delete(tables.shapes)
            .where(
                keepShapeIds.size > 0 ? notInArray(tables.shapes.id, [...keepShapeIds]) : sql`true`,
            );

        await tx
            .delete(tables.stops)
            .where(
                keepStopIds.size > 0 ? notInArray(tables.stops.id, [...keepStopIds]) : sql`true`,
            );
    });

    await db.$client.syncToFs();
}

export type SyncPayload = {
    tripInstances: (typeof tables.tripInstances.$inferSelect)[];
    routes: (typeof tables.routes.$inferSelect)[];
    trips: (typeof tables.trips.$inferSelect)[];
    stopTimes: (typeof tables.stopTimes.$inferSelect)[];
    shapes: (typeof tables.shapes.$inferSelect)[];
    stops: (typeof tables.stops.$inferSelect)[];
};

export async function saveOfflineData(
    db: PGliteDb,
    data: SyncPayload,
) {
    await db.transaction(async (tx) => {
        await Promise.all([
            upsertMany(tx, tables.tripInstances, data.tripInstances, tables.tripInstances.id),
            upsertMany(tx, tables.stops, data.stops, tables.stops.id),
            upsertMany(tx, tables.routes, data.routes, tables.routes.id),
            upsertMany(tx, tables.trips, data.trips, tables.trips.id),
            upsertMany(tx, tables.shapes, data.shapes, tables.shapes.id),
            upsertMany(tx, tables.stopTimes, data.stopTimes, [
                tables.stopTimes.agencyId,
                tables.stopTimes.tripSid,
                tables.stopTimes.stopSequence,
            ]),
        ]);
        await tx.refreshMaterializedView(views.stopRoutes);
    });

    await db.$client.syncToFs();
}

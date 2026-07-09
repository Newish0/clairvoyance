import type { OfflineArea } from "@/hooks/use-offline-areas";
import type { inferProcedureOutput } from "@trpc/server";
import type { Db } from "database";
import * as tables from "database/models/tables";
import { notInArray, sql } from "drizzle-orm";
import type { AppRouter } from "transit-api-core/types";
import { upsertMany } from "./upsert";

/**
 * Delete every row in the local pglite cache that isn't reachable from at
 * least one of `keepAreas`. Mirrors the join chain in the backend's
 * `offlineSyncRouter.getArea` (bbox -> stops -> stopTimeStaticInstances ->
 * tripInstances -> trips/routes/shapes), but runs it against the local db
 * instead of storing per-area id lists (which would bloat the
 * localStorage-backed `offline-areas` key).
 *
 * Pass the full, up-to-date list of areas you want to KEEP (i.e. already
 * excluding anything the user just removed).
 */
export async function pruneOfflineData(db: Db, keepAreas: OfflineArea[]): Promise<void> {
    const keepStopIds = new Set<number>();
    const keepTripInstanceIds = new Set<number>();
    const keepTripIds = new Set<number>();
    const keepRouteIds = new Set<number>();
    const keepShapeIds = new Set<number>();

    // --- Union the reachable id sets across every kept area ---
    for (const area of keepAreas) {
        const [[west, south], [east, north]] = area.bbox;
        const [start, end] = area.dateRange;

        const stopsInBbox = await db
            .select({ id: tables.stops.id })
            .from(tables.stops)
            .where(
                sql`${tables.stops.location}::geometry && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`,
            );

        if (stopsInBbox.length === 0) continue;

        const stopIdsInBbox = stopsInBbox.map((s) => s.id);

        const stopTimes = await db.query.stopTimeStaticInstances.findMany({
            columns: { tripInstanceId: true },
            where: {
                stopId: { in: stopIdsInBbox },
                OR: [
                    { scheduledArrivalTime: { gte: new Date(start), lte: new Date(end) } },
                    { scheduledDepartureTime: { gte: new Date(start), lte: new Date(end) } },
                ],
            },
        });

        for (const st of stopTimes) keepTripInstanceIds.add(st.tripInstanceId);
    }

    if (keepTripInstanceIds.size > 0) {
        const tripInstanceIds = [...keepTripInstanceIds];

        const tripInstances = await db.query.tripInstances.findMany({
            where: { id: { in: tripInstanceIds } },
        });
        for (const ti of tripInstances) {
            keepRouteIds.add(ti.routeId);
            keepTripIds.add(ti.tripId);
        }

        if (keepTripIds.size > 0) {
            const trips = await db.query.trips.findMany({
                where: { id: { in: [...keepTripIds] } },
            });
            for (const t of trips) {
                if (t.shapeId !== null) keepShapeIds.add(t.shapeId);
            }
        }

        // Full set of stops actually visited by kept trip instances -- a trip
        // passes through stops outside the bbox that queried it in, and those
        // still need to stay in the local cache (e.g. to render the full stop
        // sequence), so re-derive from tripInstanceId membership rather than
        // relying only on the initial bbox hit.
        const allStopTimes = await db.query.stopTimeStaticInstances.findMany({
            columns: { stopId: true },
            where: { tripInstanceId: { in: tripInstanceIds } },
        });
        for (const st of allStopTimes) keepStopIds.add(st.stopId);
    }

    // --- Delete leaf -> root. No FK constraints locally, so order only
    // matters for tidiness, not correctness. ---
    await db.transaction(async (tx) => {
        await tx
            .delete(tables.stopTimeStaticInstances)
            .where(
                keepTripInstanceIds.size > 0
                    ? notInArray(tables.stopTimeStaticInstances.tripInstanceId, [
                          ...keepTripInstanceIds,
                      ])
                    : sql`true`,
            );

        await tx
            .delete(tables.tripInstances)
            .where(
                keepTripInstanceIds.size > 0
                    ? notInArray(tables.tripInstances.id, [...keepTripInstanceIds])
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
}

export async function saveOfflineData(
    db: Db,
    data: inferProcedureOutput<AppRouter["offlineSync"]["getArea"]>,
) {
    await db.transaction(async (tx) => {
        await Promise.all([
            upsertMany(tx, tables.tripInstances, data.tripInstances, tables.tripInstances.id),
            upsertMany(tx, tables.stopTimeStaticInstances, data.stopTimeStaticInstances, [
                tables.stopTimeStaticInstances.tripInstanceId,
                tables.stopTimeStaticInstances.stopTimeId,
            ]),
            upsertMany(tx, tables.stops, data.stops, tables.stops.id),
            upsertMany(tx, tables.routes, data.routes, tables.routes.id),
            upsertMany(tx, tables.trips, data.trips, tables.trips.id),
            upsertMany(tx, tables.shapes, data.shapes, tables.shapes.id),
        ]);
    });
}

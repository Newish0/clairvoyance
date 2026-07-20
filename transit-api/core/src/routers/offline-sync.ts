import * as v from "valibot";
import { publicProcedure, router } from "../trpc";
import { StopRepository } from "../repositories/stop-repository";

const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const MAX_BBOX_METERS = 30_000; // 30km
const METERS_PER_DEGREE_LAT = 111_320;

export type SyncTableName = "tripInstances" | "routes" | "trips" | "stopTimes" | "shapes" | "stops";

export type SyncProgressChunk = {
    type: "progress";
    stage: "fetching";
    table: SyncTableName;
    tableIndex: number;
    totalTables: number;
    rowCount: number;
};

export type SyncTableChunk<T = unknown> = {
    type: "table";
    name: SyncTableName;
    rows: T[];
};

export type SyncCompleteChunk = { type: "complete" };

export type SyncChunk = SyncProgressChunk | SyncTableChunk | SyncCompleteChunk;

const dateRangeSchema = v.pipe(
    v.tuple([v.date(), v.date()]),
    v.check(
        ([start, end]) => start.getTime() <= end.getTime(),
        "Start date must be before or equal to end date",
    ),
    v.check(
        ([start, end]) => end.getTime() - start.getTime() <= MAX_RANGE_MS,
        "Date range cannot exceed 7 days",
    ),
);

const boundsSchema = v.pipe(
    // [[west, south], [east, north]]
    v.tuple([v.tuple([v.number(), v.number()]), v.tuple([v.number(), v.number()])]),
    v.check(
        ([[west, south], [east, north]]) => west <= east && south <= north,
        "Invalid bounds: west/south must be <= east/north",
    ),
    v.check(([[west, south], [east, north]]) => {
        const midLatRad = ((south + north) / 2) * (Math.PI / 180);
        const heightMeters = (north - south) * METERS_PER_DEGREE_LAT;
        const widthMeters = (east - west) * METERS_PER_DEGREE_LAT * Math.cos(midLatRad);
        return heightMeters <= MAX_BBOX_METERS && widthMeters <= MAX_BBOX_METERS;
    }, `Bounding box cannot exceed ${MAX_BBOX_METERS}m in either dimension`),
);

export const offlineSyncRouter = router({
    getArea: publicProcedure
        .input(
            v.object({
                bounds: boundsSchema,
                dateRange: dateRangeSchema,
            }),
        )
        .query(async function* ({ input, ctx }) {
            const [[west, south], [east, north]] = input.bounds;
            const [start, end] = input.dateRange;

            const stopRepo = new StopRepository(ctx.db);

            const stopsInBbox = await stopRepo.findStopsInBbox({
                west,
                south,
                east,
                north,
            });

            const tripInstanceIds = [
                ...new Set(
                    (
                        await ctx.db.query.stopTimeStaticInstances.findMany({
                            columns: {
                                tripInstanceId: true,
                            },
                            where: {
                                stopId: {
                                    in: stopsInBbox.map((stop) => stop.id),
                                },
                                OR: [
                                    { scheduledArrivalTime: { gte: start, lte: end } },
                                    { scheduledDepartureTime: { gte: start, lte: end } },
                                ],
                            },
                        })
                    ).map((stopTime) => stopTime.tripInstanceId),
                ),
            ];

            const tripInstances = await ctx.db.query.tripInstances.findMany({
                where: {
                    id: {
                        in: tripInstanceIds,
                    },
                },
            });

            function* emitTable<T>(name: SyncTableName, index: number, rows: T[]) {
                yield {
                    type: "progress",
                    stage: "fetching",
                    table: name,
                    tableIndex: index,
                    totalTables: 6,
                    rowCount: rows.length,
                };
                yield { type: "table", name, rows };
            }

            yield* emitTable("tripInstances", 0, tripInstances);

            const routes = await ctx.db.query.routes.findMany({
                where: {
                    id: {
                        in: [...new Set(tripInstances.map((trip) => trip.routeId))],
                    },
                },
            });

            yield* emitTable("routes", 1, routes);

            const trips = await ctx.db.query.trips.findMany({
                where: {
                    id: {
                        in: [...new Set(tripInstances.map((trip) => trip.tripId))],
                    },
                },
            });

            yield* emitTable("trips", 2, trips);

            const tripIds = [...new Set(tripInstances.map((trip) => trip.tripId))];

            const stopTimes = await ctx.db.query.stopTimes.findMany({
                where: {
                    tripId: {
                        in: tripIds,
                    },
                },
                orderBy: (stops, { asc }) => [asc(stops.tripId), asc(stops.stopSequence)],
            });

            yield* emitTable("stopTimes", 3, stopTimes);

            const shapes = await ctx.db.query.shapes.findMany({
                where: {
                    id: {
                        in: [
                            ...new Set(
                                trips.map((trip) => trip.shapeId).filter((id) => id !== null),
                            ),
                        ],
                    },
                },
            });

            yield* emitTable("shapes", 4, shapes);

            const stopIds = [
                ...new Set(stopTimes.map((st) => st.stopId).filter((id) => id !== null)),
            ];

            const stops = await ctx.db.query.stops.findMany({
                where: {
                    id: {
                        in: stopIds,
                    },
                },
            });

            yield* emitTable("stops", 5, stops);

            yield { type: "complete" };
        }),
});

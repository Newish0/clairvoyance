import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import * as tables from "database/models/tables";
import type { InferSelectModel } from "drizzle-orm";
import { type ItemResult, itemOk, fatalItem } from "../core/error";
import { addDays, format, parse } from "date-fns";

type Agency = InferSelectModel<typeof tables.agencies>;
type CalendarDate = InferSelectModel<typeof tables.calendarDates>;
type Trip = InferSelectModel<typeof tables.trips>;
type StopTime = InferSelectModel<typeof tables.stopTimes>;
type Route = InferSelectModel<typeof tables.routes>;
type Shape = InferSelectModel<typeof tables.shapes>;

export type TripInstanceRow = {
    agency: Agency;
    calendarDate: CalendarDate;
    trip: Trip;
    stopTime: StopTime;
    route: Route | null;
    shape: Shape | null;
};

/**
 * Cross-joins (in app code) calendar_dates x trips, yields enriched TripInstanceRow.
 *
 * Performance design:
 *   - Routes + shapes preloaded once into Maps (bounded by GTFS feed size ~1k-50k).
 *   - Date range chunked into windows (dateChunkDays, default 7) to bound RAM.
 *   - Per chunk: ~5 queries total regardless of trip count.
 *       1. calendarDates for chunk
 *       2. trips for all serviceSids in chunk
 *       3. first stopTime per trip (DISTINCT ON trip_id)
 *       4. dirty tripInstance check (composite VALUES lookup)
 *   - RAM knobs:
 *       dateChunkDays -> controls how much read data is in memory at once
 *       UpsertSink.batchSize -> controls write pressure
 */
export class TripInstanceSource implements Source<TripInstanceRow> {
    private static readonly YYYYMMDD_MIN = "00000101";
    private static readonly YYYYMMDD_MAX = "99991231";

    /**
     * @param agencyId      - Agency to process.
     * @param minDate       - Start of date range (YYYYMMDD, inclusive). Default: all time.
     * @param maxDate       - End of date range (YYYYMMDD, inclusive). Default: all time.
     * @param dateChunkDays - Days per chunk. Primary RAM control knob. Default: 7.
     *                        Lower = less RAM held per chunk, more DB round-trips per run.
     */
    constructor(
        public agencyId: string,
        public minDate: string = TripInstanceSource.YYYYMMDD_MIN,
        public maxDate: string = TripInstanceSource.YYYYMMDD_MAX,
        public dateChunkDays: number = 7,
    ) {
        if (this.minDate.length !== 8) throw new Error(`Invalid minDate: ${this.minDate}`);
        if (this.maxDate.length !== 8) throw new Error(`Invalid maxDate: ${this.maxDate}`);
        if (this.dateChunkDays < 1) throw new Error(`dateChunkDays must be >= 1`);
    }

    async *run(ctx: Context): AsyncIterable<ItemResult<TripInstanceRow>> {
        // -- 1. Agency --------------------------------------------------------
        const agency = await ctx.db.query.agencies.findFirst({
            where: { id: this.agencyId },
        });
        if (!agency) {
            yield fatalItem("AGENCY_NOT_FOUND", `Agency not found: ${this.agencyId}`);
            return;
        }

        // -- 2. Routes -> Map<routeId, Route> (expected bound: ~10-1000 per agency) -
        const allRoutes = await ctx.db.query.routes.findMany({
            where: { agencyId: this.agencyId },
        });
        const routeMap = new Map<number, Route>(allRoutes.map((r) => [r.id, r]));
        ctx.logger.debug({ count: routeMap.size }, "Routes preloaded");

        // -- 3. Shapes -> Map<shapeId, Shape> (expected bound: ~1k-50k per agency) ---
        const allShapes = await ctx.db.query.shapes.findMany({
            where: { agencyId: this.agencyId },
        });
        const shapeMap = new Map<number, Shape>(allShapes.map((s) => [s.id, s]));
        ctx.logger.debug({ count: shapeMap.size }, "Shapes preloaded");

        // -- 4. Actual min/max calendar dates -----------------------------------------------
        const minSvcDate = await ctx.db.query.calendarDates.findFirst({
            where: { agencyId: this.agencyId, date: { gte: this.minDate } },
            orderBy: { date: "asc" },
            columns: { date: true },
        });
        const maxSvcDate = await ctx.db.query.calendarDates.findFirst({
            where: { agencyId: this.agencyId, date: { lte: this.maxDate } },
            orderBy: { date: "desc" },
            columns: { date: true },
        });
        if (!minSvcDate || !maxSvcDate) {
            ctx.logger.warn({ minSvcDate, maxSvcDate }, "No calendar dates found");
            return; // early exit
        }

        // -- 5. Iterate date chunks -------------------------------------------
        let chunkStart = minSvcDate.date;
        while (chunkStart <= maxSvcDate.date) {
            const chunkEnd = TripInstanceSource.addDaysToDateStr(
                chunkStart,
                this.dateChunkDays - 1,
            );
            // Clamp to maxSvcDate.date to avoid processing beyond the requested range.
            const effectiveEnd = chunkEnd <= maxSvcDate.date ? chunkEnd : maxSvcDate.date;

            ctx.logger.debug({ chunkStart, chunkEnd: effectiveEnd }, "Processing date chunk");

            yield* this.processChunk(ctx, agency, routeMap, shapeMap, chunkStart, effectiveEnd);

            chunkStart = TripInstanceSource.addDaysToDateStr(effectiveEnd, 1);

            Bun.gc(); // call gc (async) to avoid OOM
        }
    }

    private async *processChunk(
        ctx: Context,
        agency: Agency,
        routeMap: Map<number, Route>,
        shapeMap: Map<number, Shape>,
        chunkStart: string,
        chunkEnd: string,
    ): AsyncIterable<ItemResult<TripInstanceRow>> {
        // -- A. Calendar dates for chunk --------------------------------------
        const calendarDates = await ctx.db.query.calendarDates.findMany({
            where: {
                agencyId: this.agencyId,
                date: { gte: chunkStart, lte: chunkEnd },
            },
        });
        if (calendarDates.length === 0) return;

        const uniqueServiceSids = [...new Set(calendarDates.map((cd) => cd.serviceSid))];

        // -- B. Trips for all services in chunk -------------------------------
        const trips = await ctx.db.query.trips.findMany({
            where: {
                agencyId: this.agencyId,
                serviceSid: { in: uniqueServiceSids },
            },
        });
        if (trips.length === 0) return;

        const tripsByService = new Map<string, Trip[]>();
        for (const trip of trips) {
            const list = tripsByService.get(trip.serviceSid) ?? [];
            list.push(trip);
            tripsByService.set(trip.serviceSid, list);
        }

        const uniqueTripIds = trips.map((t) => t.id);

        // -- C. First stop time per trip via DISTINCT ON ----------------------
        // GTFS: stop_sequence increases along trip but need not be consecutive.
        // selectDistinctOn([tripId]) + orderBy(tripId asc, stopSequence asc) -> first stop per trip.
        const firstStopTimes = await ctx.db
            .selectDistinctOn([tables.stopTimes.tripId])
            .from(tables.stopTimes)
            .where(inArray(tables.stopTimes.tripId, uniqueTripIds))
            .orderBy(asc(tables.stopTimes.tripId), asc(tables.stopTimes.stopSequence));

        const stopTimeMap = new Map<number, StopTime>(firstStopTimes.map((st) => [st.tripId!, st]));

        // -- D. Build candidates: need startTime before non-pristine check ----
        type Candidate = {
            calendarDate: CalendarDate;
            trip: Trip;
            stopTime: StopTime;
            startTime: string;
        };

        const candidates: Candidate[] = [];

        for (const calendarDate of calendarDates) {
            const tripsForService = tripsByService.get(calendarDate.serviceSid) ?? [];

            for (const trip of tripsForService) {
                const stopTime = stopTimeMap.get(trip.id);
                if (!stopTime) {
                    ctx.logger.info(
                        { tripId: trip.id, date: calendarDate.date },
                        "Skip: no stop times",
                    );
                    ctx.telemetry.incr("trip_instance_source.no_stop_times_skip");
                    continue;
                }

                const startTime = stopTime.arrivalTime ?? stopTime.departureTime;
                if (!startTime) {
                    ctx.logger.info({ tripId: trip.id, date: calendarDate.date }, "Skip: no time");
                    ctx.telemetry.incr("trip_instance_source.no_time_skip");
                    continue;
                }

                candidates.push({ calendarDate, trip, stopTime, startTime });
            }
        }

        if (candidates.length === 0) return;

        // -- E. Bulk dirty check via composite VALUES ------------------
        // Look up candidates directly by the unique key (trip_id, start_date, start_time),
        //
        // Chunked at 10k candidates to stay under Postgres's 65535 param limit (3 params each).
        const dirtyKeys = new Set<string>();
        const PARAM_CHUNK = 10_000;

        for (let i = 0; i < candidates.length; i += PARAM_CHUNK) {
            const slice = candidates.slice(i, i + PARAM_CHUNK);

            const valuesClause = sql.join(
                slice.map(
                    (c) =>
                        sql`(${c.trip.id}::integer, ${c.calendarDate.date}::varchar, ${c.startTime}::varchar)`,
                ),
                sql.raw(", "),
            );

            const rows = await ctx.db
                .select({
                    tripId: tables.tripInstances.tripId,
                    startDate: tables.tripInstances.startDate,
                    startTime: tables.tripInstances.startTime,
                })
                .from(tables.tripInstances)
                .where(
                    and(
                        eq(tables.tripInstances.state, "DIRTY"),
                        gte(tables.tripInstances.startDate, chunkStart),
                        lte(tables.tripInstances.startDate, chunkEnd),
                        sql`(${tables.tripInstances.tripId}, ${tables.tripInstances.startDate}, ${tables.tripInstances.startTime}) IN (VALUES ${valuesClause})`,
                    ),
                );

            for (const row of rows) {
                dirtyKeys.add(`${row.tripId}:${row.startDate}:${row.startTime}`);
            }
        }

        ctx.telemetry.incr("trip_instance_source.dirty", dirtyKeys.size);

        // -- F. Yield survivors -----------------------------------------------
        for (const { calendarDate, trip, stopTime, startTime } of candidates) {
            const key = `${trip.id}:${calendarDate.date}:${startTime}`;

            if (dirtyKeys.has(key)) {
                ctx.logger.debug(
                    { tripId: trip.id, date: calendarDate.date, startTime },
                    "Skip: dirty",
                );
                continue;
            }

            const route = trip.routeId != null ? (routeMap.get(trip.routeId) ?? null) : null;
            const shape = trip.shapeId != null ? (shapeMap.get(trip.shapeId) ?? null) : null;

            yield itemOk({ agency, calendarDate, trip, stopTime, route, shape });
        }
    }

    /** Adds `days` days to a YYYYMMDD string. Clamps to YYYYMMDD_MAX on overflow. */
    private static addDaysToDateStr(yyyymmdd: string, days: number): string {
        try {
            return format(addDays(parse(yyyymmdd, "yyyyMMdd", new Date()), days), "yyyyMMdd");
        } catch {
            return TripInstanceSource.YYYYMMDD_MAX;
        }
    }
}

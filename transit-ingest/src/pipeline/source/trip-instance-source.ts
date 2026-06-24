import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import * as tables from "database/models/tables";
import type { InferSelectModel } from "drizzle-orm";
import { type ItemResult, itemOk, fatalItem } from "../core/error";
import { addDays, eachDayOfInterval, format, getDay, parse } from "date-fns";
import type { TripInstanceState } from "database/models/enums";

type Agency = InferSelectModel<typeof tables.agencies>;
type Calendar = InferSelectModel<typeof tables.calendars>;
type CalendarDate = InferSelectModel<typeof tables.calendarDates>;
type Trip = InferSelectModel<typeof tables.trips>;
type StopTime = InferSelectModel<typeof tables.stopTimes>;
type Route = InferSelectModel<typeof tables.routes>;
type Shape = InferSelectModel<typeof tables.shapes>;

export type TripInstanceRow = {
    agency: Agency;
    date: string; // YYYYMMDD
    trip: Trip;
    state: TripInstanceState;
    stopTime: StopTime;
    route: Route | null;
    shape: Shape | null;
};

// TODO: Needs heavy optimization

/**
 * Cross-joins active dates x trips and yields enriched TripInstanceRow.
 *
 * Performance characteristics
 * - Routes + shapes: preloaded once, O(1) per trip.
 * - Calendars:       preloaded once into Map<serviceSid, Calendar>.
 * - Calendar dates:  loaded per chunk (same as before).
 * - Trips:           loaded per chunk, grouped by serviceSid.
 * - Stop times:      DISTINCT ON per chunk (same as before).
 * - Dirty check:     bulk composite VALUES lookup (same as before).
 *
 * RAM knobs: dateChunkDays (read), UpsertSink.batchSize (write).
 */
export class TripInstanceSource implements Source<TripInstanceRow> {
    private static readonly YYYYMMDD_MIN = "00000101";
    private static readonly YYYYMMDD_MAX = "99991231";

    /**
     * Day-of-week index (date-fns getDay) -> Calendar boolean column name.
     * date-fns: 0=Sun, 1=Mon, ..., 6=Sat
     */
    private static readonly DOW_KEYS: (keyof Calendar)[] = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ] as const;

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

        // -- 4. Calendars (expected bound: ~10-100 rows per agency) ---
        const allCalendars = await ctx.db.query.calendars.findMany({
            where: {
                agencyId: this.agencyId,
                startDate: { lte: this.maxDate },
                endDate: { gte: this.minDate },
            },
        });
        ctx.logger.debug({ count: allCalendars.length }, "Calendars preloaded");
        const expandedCalendarEntries = allCalendars.flatMap((c) =>
            TripInstanceSource.resolveDatesFromCalendar(c, this.minDate, this.maxDate).map(
                (d) => [d, c] as const,
            ),
        );
        const expandedCalendarMap = expandedCalendarEntries.reduce((m, [d, c]) => {
            if (!m.has(d)) m.set(d, []);
            m.get(d)!.push(c);
            return m;
        }, new Map<string, Calendar[]>());

        const allCalendarDates = await ctx.db.query.calendarDates.findMany({
            where: {
                agencyId: this.agencyId,
                date: { gte: this.minDate, lte: this.maxDate },
            },
            orderBy: { date: "asc" },
        });
        const calendarDateMap = allCalendarDates
            .map((cd) => [cd.date, cd] as const)
            .reduce((m, [d, cd]) => {
                if (!m.has(d)) m.set(d, []);
                m.get(d)!.push(cd);
                return m;
            }, new Map<string, CalendarDate[]>());
        ctx.logger.debug({ count: allCalendarDates.length }, "Calendar dates preloaded");

        // -- 5. Determine overall date window ---------------------------------
        // Use the union of calendar_dates range AND calendar bitmask ranges,
        // both clamped to [minDate, maxDate].
        const minCdDate = allCalendarDates.at(0)?.date;
        const maxCdDate = allCalendarDates.at(-1)?.date;

        // The dates in expandedAllCalendars are sorted in ascending order
        const minCalDate =
            expandedCalendarMap
                .keys()
                .toArray()
                .filter((d) => d && d >= this.minDate)
                .toSorted()
                .at(0) ?? null;
        const maxCalDate =
            expandedCalendarMap
                .keys()
                .toArray()
                .filter((d) => d && d <= this.maxDate)
                .toSorted()
                .at(-1) ?? null;

        // Overall window is the union of both ranges
        const winStartCandidates = [minCdDate, minCalDate].filter(Boolean) as string[];
        const windowStart = winStartCandidates.toSorted().at(0);
        const winEndCandidates = [maxCdDate, maxCalDate].filter(Boolean) as string[];
        const windowEnd = winEndCandidates.toSorted().at(-1);

        if (!windowStart || !windowEnd) {
            ctx.logger.warn(
                "No service date range found in calendarDates or calendars - nothing to realize",
            );
            return;
        }

        ctx.logger.info({ windowStart, windowEnd }, "Realizing trip instances");

        // -- 6. Iterate date chunks -------------------------------------------
        let chunkStart = windowStart;
        while (chunkStart <= windowEnd) {
            const chunkEnd = TripInstanceSource.addDaysToDateStr(
                chunkStart,
                this.dateChunkDays - 1,
            );
            const effectiveEnd = chunkEnd <= windowEnd ? chunkEnd : windowEnd;

            ctx.logger.debug({ chunkStart, chunkEnd: effectiveEnd }, "Processing date chunk");

            yield* this.processChunk(
                ctx,
                agency,
                routeMap,
                shapeMap,
                expandedCalendarMap,
                calendarDateMap,
                chunkStart,
                effectiveEnd,
            );

            chunkStart = TripInstanceSource.addDaysToDateStr(effectiveEnd, 1);

            Bun.gc();
        }
    }

    private async *processChunk(
        ctx: Context,
        agency: Agency,
        routeMap: Map<number, Route>,
        shapeMap: Map<number, Shape>,
        expandedCalendarMap: Map<string, Calendar[]>,
        calendarDatesMap: Map<string, CalendarDate[]>,
        chunkStart: string,
        chunkEnd: string,
    ): AsyncIterable<ItemResult<TripInstanceRow>> {
        // -- A. Calendar dates for chunk --------------------------------------

        const allDates = [...new Set([...calendarDatesMap.keys(), ...expandedCalendarMap.keys()])]
            .filter((d) => d >= chunkStart && d <= chunkEnd)
            .toSorted();

        const uniqueServiceSids = [
            ...new Set(
                allDates.flatMap((d) => [
                    ...(expandedCalendarMap.get(d)?.map((c) => c.serviceSid) ?? []),
                    ...(calendarDatesMap.get(d)?.map((cd) => cd.serviceSid) ?? []),
                ]),
            ),
        ];

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
            date: string;
            state: TripInstanceState;
            trip: Trip;
            stopTime: StopTime;
            startTime: string;
        };

        const candidates: Candidate[] = [];

        for (const date of allDates) {
            const calendarServiceSids =
                expandedCalendarMap.get(date)?.map((c) => c.serviceSid) ?? [];
            const dateCds = calendarDatesMap.get(date);
            const removedServiceSids = new Set(
                dateCds?.filter((cd) => cd.exceptionType === "REMOVED").map((cd) => cd.serviceSid),
            );
            const calendarDatesServiceSids = dateCds?.map((cd) => cd.serviceSid) ?? [];
            const serviceSids = [...new Set([...calendarServiceSids, ...calendarDatesServiceSids])];
            const tripsForService = serviceSids
                .flatMap((s) => tripsByService.get(s))
                .filter((t) => t !== undefined);

            for (const trip of tripsForService) {
                const stopTime = stopTimeMap.get(trip.id);
                if (!stopTime) {
                    ctx.logger.info({ tripId: trip.id, date: date }, "Skip: no stop times");
                    ctx.telemetry.incr("trip_instance_source.no_stop_times_skip");
                    continue;
                }

                const startTime = stopTime.arrivalTime ?? stopTime.departureTime;
                if (!startTime) {
                    ctx.logger.info({ tripId: trip.id, date: date }, "Skip: no time");
                    ctx.telemetry.incr("trip_instance_source.no_time_skip");
                    continue;
                }
                const isRemoved = removedServiceSids.has(trip.serviceSid);
                const state: TripInstanceState = isRemoved ? "REMOVED" : "PRISTINE";
                candidates.push({ date, state, trip, stopTime, startTime });
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
                        sql`(${c.trip.id}::integer, ${c.date}::varchar, ${c.startTime}::varchar)`,
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
                        eq(tables.tripInstances.agencyId, this.agencyId),
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
        for (const { date, state, trip, stopTime, startTime } of candidates) {
            const key = `${trip.id}:${date}:${startTime}`;

            if (dirtyKeys.has(key)) {
                ctx.telemetry.incr("trip_instance_source.dirty_skip");
                continue;
            }

            const route = trip.routeId != null ? (routeMap.get(trip.routeId) ?? null) : null;
            const shape = trip.shapeId != null ? (shapeMap.get(trip.shapeId) ?? null) : null;

            yield itemOk({ agency, date, state, trip, stopTime, route, shape });
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

    /**
     * @returns list of calendar dates in YYYYMMDD format sorted in ascending order
     */
    private static resolveDatesFromCalendar(
        cal: Calendar | null,
        windowStart: string,
        windowEnd: string,
    ) {
        const dates = new Set<string>();

        if (cal) {
            const hasRecurrence = TripInstanceSource.DOW_KEYS.some((k) => cal[k] === true);
            if (hasRecurrence) {
                // Clamp calendar range to the processing window
                const start = cal.startDate > windowStart ? cal.startDate : windowStart;
                const end = cal.endDate < windowEnd ? cal.endDate : windowEnd;

                if (start <= end) {
                    const startDt = parse(start, "yyyyMMdd", new Date());
                    const endDt = parse(end, "yyyyMMdd", new Date());

                    for (const d of eachDayOfInterval({ start: startDt, end: endDt })) {
                        const ds = format(d, "yyyyMMdd");
                        const dowKey = TripInstanceSource.DOW_KEYS[getDay(d)];
                        if (dowKey && cal[dowKey]) {
                            dates.add(ds);
                        }
                    }
                }
            }
        }

        return Array.from(dates);
    }
}

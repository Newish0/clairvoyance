import { and, eq, ne } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import * as tables from "database/models/tables";
import type { InferSelectModel } from "drizzle-orm";
import { type ItemResult, itemOk, fatalItem } from "../core/error";

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

/** Cross-joins calendar_dates × trips, yields enriched tuples for the pipeline. */
export class TripInstanceSource implements Source<TripInstanceRow> {
    private routeCache = new LRUCache<number, Route>({ max: 3000 });
    private shapeCache = new LRUCache<number, Shape>({ max: 6000 });
    private stopTimeCache = new LRUCache<number, StopTime>({ max: 10000 });

    constructor(
        public agencyId: string,
        public minDate: string,
        public maxDate: string,
    ) {
        if (this.minDate.length !== 8) throw new Error(`Invalid minDate: ${this.minDate}`);
        if (this.maxDate.length !== 8) throw new Error(`Invalid maxDate: ${this.maxDate}`);
    }

    async *run(ctx: Context): AsyncIterable<ItemResult<TripInstanceRow>> {
        const agency = await ctx.db.query.agencies.findFirst({
            where: { id: this.agencyId },
        });
        if (!agency) {
            yield fatalItem("AGENCY_NOT_FOUND", `Agency not found: ${this.agencyId}`);
            return;
        }

        const calendarDates = await ctx.db.query.calendarDates.findMany({
            where: {
                agencyId: this.agencyId,
                date: { gte: this.minDate, lte: this.maxDate },
            },
        });

        for (const calendarDate of calendarDates) {
            const trips = await ctx.db.query.trips.findMany({
                where: {
                    agencyId: this.agencyId,
                    serviceSid: calendarDate.serviceSid,
                },
            });

            for (const trip of trips) {
                const stopTime = await this.lookupStopTime(ctx, trip.id);
                if (!stopTime) {
                    ctx.logger.info(
                        { tripId: trip.id, date: calendarDate.date },
                        "Skip: no stop times",
                    );
                    ctx.telemetry.incr("trip_instance_source.no_stop_times_skip");
                    continue;
                }

                const route =
                    trip.routeId != null ? await this.lookupRoute(ctx, trip.routeId) : null;
                const shape =
                    trip.shapeId != null ? await this.lookupShape(ctx, trip.shapeId) : null;

                const startTime = stopTime.arrivalTime ?? stopTime.departureTime;
                if (!startTime) {
                    ctx.logger.info({ tripId: trip.id, date: calendarDate.date }, "Skip: no time");
                    ctx.telemetry.incr("trip_instance_source.no_time_skip");
                    continue;
                }

                // Skip existing non-pristine instances (preserve realtime modifications)
                const existNotPristine = await ctx.db
                    .select({ id: tables.tripInstances.id })
                    .from(tables.tripInstances)
                    .where(
                        and(
                            eq(tables.tripInstances.tripId, trip.id),
                            eq(tables.tripInstances.startDate, calendarDate.date),
                            eq(tables.tripInstances.startTime, startTime),
                            ne(tables.tripInstances.state, "PRISTINE"),
                        ),
                    )
                    .limit(1);

                // We expect a fair number of non-pristine instances, so this is debug level logging
                if (existNotPristine.length > 0) {
                    ctx.logger.debug(
                        { tripId: trip.id, date: calendarDate.date, startTime },
                        "Skip: non-pristine",
                    );
                    ctx.telemetry.incr("trip_instance_source.not_pristine_skip");
                    continue;
                }

                yield itemOk({ agency, calendarDate, trip, stopTime, route, shape });
            }
        }
    }

    private async lookupStopTime(ctx: Context, tripId: number): Promise<StopTime | null> {
        const cached = this.stopTimeCache.get(tripId);
        if (cached) return cached;

        // GTFS spec: stop_sequence values must increase along the trip but do not need to be consecutive.
        const stopTime = await ctx.db.query.stopTimes.findFirst({
            where: { tripId },
            orderBy: { stopSequence: "asc" },
        });
        if (stopTime) this.stopTimeCache.set(tripId, stopTime);
        return stopTime ?? null;
    }

    private async lookupRoute(ctx: Context, routeId: number): Promise<Route | null> {
        const cached = this.routeCache.get(routeId);
        if (cached) return cached;
        const route = await ctx.db.query.routes.findFirst({ where: { id: routeId } });
        if (route) this.routeCache.set(routeId, route);
        return route ?? null;
    }

    private async lookupShape(ctx: Context, shapeId: number): Promise<Shape | null> {
        const cached = this.shapeCache.get(shapeId);
        if (cached) return cached;
        const shape = await ctx.db.query.shapes.findFirst({ where: { id: shapeId } });
        if (shape) this.shapeCache.set(shapeId, shape);
        return shape ?? null;
    }
}

import { and, eq, ne } from "drizzle-orm";
import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import * as tables from "database/models/tables";
import type { InferSelectModel } from "drizzle-orm";

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
    private routeCache = new Map<number, Route | null>();
    private shapeCache = new Map<number, Shape | null>();

    constructor(
        public agencyId: string,
        public minDate: string,
        public maxDate: string,
    ) {
        if (this.minDate.length !== 8) throw new Error(`Invalid minDate: ${this.minDate}`);
        if (this.maxDate.length !== 8) throw new Error(`Invalid maxDate: ${this.maxDate}`);
    }

    async *run(ctx: Context): AsyncIterable<TripInstanceRow> {
        const agency = await ctx.db.query.agencies.findFirst({
            where: { id: this.agencyId },
        });
        if (!agency) throw new Error(`Agency not found: ${this.agencyId}`);

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

                if (existNotPristine.length > 0) {
                    ctx.logger.info(
                        { tripId: trip.id, date: calendarDate.date, startTime },
                        "Skip: non-pristine",
                    );
                    ctx.telemetry.incr("trip_instance_source.not_pristine_skip");
                    continue;
                }

                yield { agency, calendarDate, trip, stopTime, route, shape };
            }
        }
    }

    private async lookupStopTime(ctx: Context, tripId: number): Promise<StopTime | null> {
        // GTFS spec: stop_sequence values must increase along the trip but do not need to be consecutive.
        const stopTime = await ctx.db.query.stopTimes.findFirst({
            where: { tripId },
            orderBy: { stopSequence: "asc" },
        });
        return stopTime ?? null;
    }

    private async lookupRoute(ctx: Context, routeId: number): Promise<Route | null> {
        if (this.routeCache.has(routeId)) return this.routeCache.get(routeId)!;
        const route = await ctx.db.query.routes.findFirst({ where: { id: routeId } });
        this.routeCache.set(routeId, route ?? null);
        return route ?? null;
    }

    private async lookupShape(ctx: Context, shapeId: number): Promise<Shape | null> {
        if (this.shapeCache.has(shapeId)) return this.shapeCache.get(shapeId)!;
        const shape = await ctx.db.query.shapes.findFirst({ where: { id: shapeId } });
        this.shapeCache.set(shapeId, shape ?? null);
        return shape ?? null;
    }
}

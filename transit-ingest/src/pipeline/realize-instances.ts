import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { TripInstanceSource } from "./source/trip-instance-source";
import { TripInstanceTransformer } from "./transformer/trip-instance-transformer";

export type PipelineSummary = {
    errors: IngestError[];
    skipped: number;
};

/** Cross-joins calendar_dates × trips to realize trip instances for a date range. */
export async function runRealizeInstances(
    ctx: Context,
    minDate = "00000101",
    maxDate = "99991231",
): Promise<Result<PipelineSummary, IngestError>> {
    try {
        const pipeline = pipe(
            new TripInstanceSource(ctx.config.agencyId, minDate, maxDate),
            new TripInstanceTransformer(),
            new UpsertSink(
                tables.tripInstances,
                [
                    tables.tripInstances.agencyId,
                    tables.tripInstances.tripId,
                    tables.tripInstances.startDate,
                    tables.tripInstances.startTime,
                ],
                ["id", "lastTripUpdateAt"],
            ),
        );
        ctx.logger.debug({ minDate, maxDate }, "Realize trip instances pipeline started");
        await pipeline(ctx);
        ctx.logger.debug({ minDate, maxDate }, "Realize trip instances pipeline finished");

        ctx.logger.debug("Refreshing stop_routes materialized view");
        await ctx.db.refreshMaterializedView(views.stopRoutes).concurrently();
        ctx.logger.debug("stop_routes refreshed");

        await syncStopTimeStaticInstances(ctx, minDate, maxDate);

        return ok({ errors: ctx.errors, skipped: ctx.skipped });
    } catch (e) {
        const error = fatalError("PIPELINE_ERROR", "Realize instances pipeline failed", e);
        ctx.errors.push(error);
        return err(error);
    }
}

/** ponytail: real table maintained incrementally per agency+date range, committed in configurable day chunks */
async function syncStopTimeStaticInstances(
    ctx: Context,
    minDate: string,
    maxDate: string,
    chunkDays = 7,
): Promise<void> {
    ctx.logger.debug("Syncing stop_time_static_instances");

    const dates = await ctx.db
        .selectDistinct({ startDate: tables.tripInstances.startDate })
        .from(tables.tripInstances)
        .where(
            and(
                eq(tables.tripInstances.agencyId, ctx.config.agencyId),
                gte(tables.tripInstances.startDate, minDate),
                lte(tables.tripInstances.startDate, maxDate),
            ),
        )
        .orderBy(asc(tables.tripInstances.startDate));

    const allDates = dates.map((d) => d.startDate);

    for (let i = 0; i < allDates.length; i += chunkDays) {
        const chunk = allDates.slice(i, i + chunkDays);
        const chunkMin = chunk[0]!;
        const chunkMax = chunk[chunk.length - 1]!;

        ctx.logger.debug({ chunkMin, chunkMax }, "Syncing stop_time_static_instances chunk");

        await ctx.db.transaction(async (tx) => {
            // 1. Delete stale rows for this chunk's date range
            await tx.delete(tables.stopTimeStaticInstances).where(
                inArray(
                    tables.stopTimeStaticInstances.tripInstanceId,
                    tx
                        .select({ id: tables.tripInstances.id })
                        .from(tables.tripInstances)
                        .where(
                            and(
                                eq(tables.tripInstances.agencyId, ctx.config.agencyId),
                                gte(tables.tripInstances.startDate, chunkMin),
                                lte(tables.tripInstances.startDate, chunkMax),
                            ),
                        ),
                ),
            );

            // 2. Insert fresh rows for this chunk's date range (within 6-week window)
            const insertQuery = tx
                .select({
                    tripInstanceId: tables.tripInstances.id,
                    stopTimeId: tables.stopTimes.id,
                    stopSequence: tables.stopTimes.stopSequence,
                    stopId: tables.stopTimes.stopId,
                    timepoint: tables.stopTimes.timepoint,
                    scheduledArrivalTime: sql<Date>`(${tables.tripInstances.startDatetime} + (
                        ${tables.stopTimes.arrivalTime}::interval - (
                            SELECT ${tables.stopTimes.arrivalTime}::interval
                            FROM ${tables.stopTimes}
                            WHERE ${tables.stopTimes.tripId} = ${tables.tripInstances.tripId}
                            AND ${tables.stopTimes.stopSequence} = 1
                        )
                    ))::timestamptz`.as("scheduled_arrival_time"),
                    scheduledDepartureTime: sql<Date>`(${tables.tripInstances.startDatetime} + (
                        ${tables.stopTimes.departureTime}::interval - (
                            SELECT ${tables.stopTimes.arrivalTime}::interval
                            FROM ${tables.stopTimes}
                            WHERE ${tables.stopTimes.tripId} = ${tables.tripInstances.tripId}
                            AND ${tables.stopTimes.stopSequence} = 1
                        )
                    ))::timestamptz`.as("scheduled_departure_time"),
                    stopHeadsign: tables.stopTimes.stopHeadsign,
                    pickupType: tables.stopTimes.pickupType,
                    dropOffType: tables.stopTimes.dropOffType,
                    shapeDistTraveled: tables.stopTimes.shapeDistTraveled,
                })
                .from(tables.tripInstances)
                .innerJoin(
                    tables.stopTimes,
                    eq(tables.tripInstances.tripId, tables.stopTimes.tripId),
                )
                .where(
                    and(
                        eq(tables.tripInstances.agencyId, ctx.config.agencyId),
                        gte(tables.tripInstances.startDate, chunkMin),
                        lte(tables.tripInstances.startDate, chunkMax),
                        gte(tables.tripInstances.startDatetime, sql`now() - interval '14 days'`),
                        lt(tables.tripInstances.startDatetime, sql`now() + interval '1 month'`),
                    ),
                );

            await tx.insert(tables.stopTimeStaticInstances).select(insertQuery);
        });
    }

    // Cleanup orphans outside 6-week window - single tx after all chunks
    await ctx.db.transaction(async (tx) => {
        await tx.delete(tables.stopTimeStaticInstances).where(
            sql`NOT EXISTS (
                SELECT 1 FROM ${tables.tripInstances}
                WHERE ${tables.tripInstances.id} = ${tables.stopTimeStaticInstances.tripInstanceId}
                AND ${tables.tripInstances.startDatetime} >= now() - interval '14 days'
                AND ${tables.tripInstances.startDatetime} < now() + interval '1 month'
            )`,
        );
    });

    ctx.logger.debug("stop_time_static_instances sync complete");
}

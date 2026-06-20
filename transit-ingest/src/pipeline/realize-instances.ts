import { tripInstances } from "database/models/tables";
import { err, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { TripInstanceSource } from "./source/trip-instance-source";
import { TripInstanceTransformer } from "./transformer/trip-instance-transformer";
import * as views from "database/models/views";

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
            new UpsertSink(tripInstances, [
                tripInstances.tripId,
                tripInstances.startDate,
                tripInstances.startTime,
            ]),
        );
        ctx.logger.debug({ minDate, maxDate }, "Realize trip instances pipeline started");
        await pipeline(ctx);
        ctx.logger.debug({ minDate, maxDate }, "Realize trip instances pipeline finished");

        ctx.logger.debug("Refreshing materialized views");
        await ctx.db.refreshMaterializedView(views.stopTimeStaticInstances).concurrently();
        await ctx.db.refreshMaterializedView(views.stopRoutes).concurrently();
        ctx.logger.debug("Materialized views has been refreshed");

        return ok({ errors: ctx.errors, skipped: ctx.skipped });
    } catch (e) {
        const error = fatalError("PIPELINE_ERROR", "Realize instances pipeline failed", e);
        ctx.errors.push(error);
        return err(error);
    }
}

import { tripInstances } from "database/models/tables";
import { err, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { TripInstanceSource } from "./source/tripInstanceSource";
import { TripInstanceTransformer } from "./transformer/tripInstanceTransformer";
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

        await pipeline(ctx);
        // await ctx.db.refreshMaterializedView(views.stopTimeStaticInstances).concurrently();

        return ok({ errors: ctx.errors, skipped: ctx.skipped });
    } catch (e) {
        const error = fatalError("PIPELINE_ERROR", "Realize instances pipeline failed", e);
        ctx.errors.push(error);
        return err(error);
    }
}

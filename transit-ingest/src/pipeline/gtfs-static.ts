import * as tables from "database/models/tables";
import { err, ok, type Result } from "neverthrow";
import fs from "node:fs";
import path from "node:path";
import { deleteAll } from "../db/delete";
import { downloadAndExtract } from "../source/gtfs-archive";
import { checkFeedExist } from "../utils/feed-dup";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { CsvFileSource } from "./source/csv-file-source";
import { AgencyTransformer } from "./transformer/agency-transformer";
import { CalendarDateTransformer } from "./transformer/calendar-date-transformer";
import { FeedInfoTransformer } from "./transformer/feed-info-transformer";
import { RouteTransformer } from "./transformer/route-transformer";
import { ShapeTransformer } from "./transformer/shape-transformer";
import { StopTimeTransformer } from "./transformer/stop-time-transformer";
import { StopTransformer } from "./transformer/stop-transformer";
import { TripTransformer } from "./transformer/trip-transformer";
import { runRealizeInstances } from "./realize-instances";

export type PipelineSummary = {
    errors: IngestError[];
    skipped: number;
};

export async function runStatic(
    ctx: Context,
    gtfsUrl: string,
    deleteRows = false,
    ignoreFeedDup = false,
    realizeInstances = false,
): Promise<Result<PipelineSummary, IngestError>> {
    if (deleteRows) {
        ctx.logger.info("Dropping existing rows");
        const result = await deleteAll(ctx.db);
        if (result.isErr()) {
            return err(result.error);
        }
        ctx.logger.info("Existing rows dropped");
    }

    ctx.logger.info({ url: gtfsUrl }, "Downloading GTFS archive");

    const sourceResult = await downloadAndExtract(ctx.logger, gtfsUrl);
    if (sourceResult.isErr()) return err(sourceResult.error);

    const source = sourceResult.value;
    ctx.logger.info({ dir: source.dir, hash: source.hash }, "Archive extracted");

    const feedExist = await checkFeedExist(ctx.db, source.hash);
    if (feedExist && !ignoreFeedDup) {
        ctx.logger.info(
            { hash: source.hash },
            "Feed already processed. There has been no change. Skipping.",
        );
        return ok({ errors: [], skipped: 0 });
    }

    const agencyPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "agency.txt")),
        new AgencyTransformer(ctx.config.agencyId),
        new UpsertSink(tables.agencies, [tables.agencies.id]),
    );

    const feedInfoPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "feed_info.txt")),
        new FeedInfoTransformer(ctx.config.agencyId, source.hash),
        new UpsertSink(tables.feedInfo, [tables.feedInfo.hash]),
    );

    const calendarDatesPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "calendar_dates.txt")),
        new CalendarDateTransformer(ctx.config.agencyId),
        new UpsertSink(tables.calendarDates, [
            tables.calendarDates.agencyId,
            tables.calendarDates.serviceSid,
            tables.calendarDates.date,
        ]),
    );

    const routesPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "routes.txt")),
        new RouteTransformer(ctx.config.agencyId),
        new UpsertSink(tables.routes, [tables.routes.agencyId, tables.routes.routeSid], ["id"]),
    );

    const stopsPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "stops.txt")),
        new StopTransformer(ctx.config.agencyId),
        new UpsertSink(tables.stops, [tables.stops.agencyId, tables.stops.stopSid], ["id"]),
    );

    const shapesPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "shapes.txt")),
        new ShapeTransformer(ctx.config.agencyId),
        new UpsertSink(tables.shapes, [tables.shapes.agencyId, tables.shapes.shapeSid], ["id"]),
    );

    const tripsPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "trips.txt")),
        new TripTransformer(ctx.config.agencyId),
        new UpsertSink(tables.trips, [tables.trips.agencyId, tables.trips.tripSid], ["id"]),
    );

    const stopTimesPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "stop_times.txt")),
        new StopTimeTransformer(ctx.config.agencyId),
        new UpsertSink(
            tables.stopTimes,
            [tables.stopTimes.agencyId, tables.stopTimes.tripSid, tables.stopTimes.stopSequence],
            ["id"],
        ),
    );

    const allPipelinesResult = await (async () => {
        try {
            await agencyPipeline(ctx);
            await feedInfoPipeline(ctx);
            await calendarDatesPipeline(ctx);
            await routesPipeline(ctx);
            await stopsPipeline(ctx);
            await shapesPipeline(ctx);
            await tripsPipeline(ctx);
            await stopTimesPipeline(ctx);
        } catch (e) {
            const error = fatalError("PIPELINE_ERROR", "Pipeline execution failed", e);
            ctx.errors.push(error);
            return err(error);
        }
    })();

    fs.rmSync(source.dir, { recursive: true, force: true });

    // Realize trip instances if requested
    if (realizeInstances && (!allPipelinesResult || allPipelinesResult.isOk())) {
        ctx.logger.info("Realizing trip instances");
        const realizeResult = await runRealizeInstances(ctx);
        if (realizeResult.isErr()) {
            return err(realizeResult.error);
        }
        ctx.errors.push(...realizeResult.value.errors);
        ctx.skipped += realizeResult.value.skipped;
    }

    return allPipelinesResult ?? ok({ errors: ctx.errors, skipped: ctx.skipped });
}

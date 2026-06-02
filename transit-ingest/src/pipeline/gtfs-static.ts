import * as tables from "database/models/tables";
import { err, ok, type Result } from "neverthrow";
import fs from "node:fs";
import path from "node:path";
import { deleteAll } from "../db/delete";
import { downloadAndExtract } from "../source/gtfs-archive";
import { checkFeedExist } from "../utils/feed_dup";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { CsvFileSource } from "./source/csvFileSource";
import { AgencyTransformer } from "./transformer/agencyTransformer";
import { CalendarDateTransformer } from "./transformer/calendarDateTransformer";
import { FeedInfoTransformer } from "./transformer/feedInfoTransformer";

export type PipelineSummary = {
    errors: IngestError[];
    skipped: number;
};

export async function runStatic(
    ctx: Context,
    gtfsUrl: string,
    deleteRows = false,
    ignoreFeedDup = false,
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

    const sourceResult = await downloadAndExtract(gtfsUrl);
    if (sourceResult.isErr()) return err(sourceResult.error);

    const source = sourceResult.value;
    ctx.logger.info({ dir: source.dir, hash: source.hash }, "Archive extracted");

    const feedExist = await checkFeedExist(ctx.db, source.hash);
    if (feedExist && !ignoreFeedDup) {
        ctx.logger.info({ hash: source.hash }, "Feed already processed. There has been no change. Skipping.");
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

    const allPipelinesResult = await (async () => {
        try {
            await agencyPipeline(ctx);
            await feedInfoPipeline(ctx);
            await calendarDatesPipeline(ctx);
        } catch (e) {
            const error = fatalError("PIPELINE_ERROR", "Pipeline execution failed", e);
            ctx.errors.push(error);
            return err(error);
        }
    })();

    fs.rmSync(source.dir, { recursive: true, force: true });

    return allPipelinesResult ?? ok({ errors: ctx.errors, skipped: ctx.skipped });
}

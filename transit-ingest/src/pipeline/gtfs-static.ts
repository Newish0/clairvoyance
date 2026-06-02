import { err } from "neverthrow";
import path from "node:path";
import { downloadAndExtract } from "../source/gtfs-archive";
import type { Context } from "./core/context";
import { pipe } from "./core/pipe";
import { UpsertSink } from "./sink/upsert";
import { CsvFileSource } from "./source/csvFileSource";
import { AgencyTransformer } from "./transformer/agencyTransformer";

import * as tables from "database/models/tables";
import fs from "node:fs";
import { deleteAll } from "../db/delete";

const BATCH_SIZE = 1000;

// export type PipelineSummary = {
//     sources: SourceInfo;
//     tables: UpsertSummary[];
//     skipped: number;
//     errors: IngestError[];
// };

// async function processCsv<T extends Record<string, unknown>>(
//     ctx: Context,
//     filePath: string,
//     label: string,
//     mapFn: (row: Record<string, string>) => Result<T, IngestError>,
//     table: any,
//     conflictColumns: AnyPgColumn[],
//     summary: PipelineSummary,
// ): Promise<void> {
//     if (!existsSync(filePath)) {
//         ctx.logger.warn({ file: filePath }, "CSV file not found");
//         summary.tables.push({ table: label, inserted: 0 });
//         return;
//     }

//     const batch: T[] = [];

//     for await (const rowResult of readCsv(filePath)) {
//         if (rowResult.isErr()) {
//             summary.errors.push(rowResult.error);
//             summary.skipped++;
//             continue;
//         }

//         const mapped = mapFn(rowResult.value);
//         if (mapped.isErr()) {
//             summary.errors.push(mapped.error);
//             summary.skipped++;
//             continue;
//         }

//         batch.push(mapped.value);

//         if (batch.length >= BATCH_SIZE) {
//             const r = await batchUpsert(table, batch, conflictColumns);
//             if (r.isErr()) {
//                 summary.errors.push(r.error);
//                 return;
//             }
//             batch.length = 0;
//         }
//     }

//     if (batch.length > 0) {
//         const r = await batchUpsert(table, batch, conflictColumns);
//         if (r.isErr()) {
//             summary.errors.push(r.error);
//             return;
//         }
//     }

//     ctx.logger.info({ table: label }, "Complete");
// }

// export async function runStatic(
//     ctx: Context,
//     gtfsUrl: string,
// ): Promise<Result<PipelineSummary, IngestError>> {
//     ctx.logger.info({ url: gtfsUrl }, "Downloading GTFS archive");

//     const sourceResult = await downloadAndExtract(gtfsUrl);
//     if (sourceResult.isErr()) return err(sourceResult.error);

//     const source = sourceResult.value;
//     ctx.logger.info({ dir: source.dir, hash: source.hash }, "Archive extracted");

//     const summary: PipelineSummary = {
//         sources: source,
//         tables: [],
//         skipped: 0,
//         errors: [],
//     };

//     const clearResult = await ctx.db.transaction(async (tx) => deleteAll(tx));
//     if (clearResult.isErr()) return err(clearResult.error);

//     const baseDir = source.dir;

//     await processCsv(
//         ctx,
//         path.join(baseDir, "agency.txt"),
//         "agencies",
//         (r) => mapAgencyRow(r, ctx.config.agencyId),
//         agencies,
//         [agencies.id],
//         summary,
//     );

//     await processCsv(
//         ctx,
//         path.join(baseDir, "feed_info.txt"),
//         "feed_info",
//         (r) => mapFeedInfoRow(r, ctx.config.agencyId, source.hash),
//         feedInfo,
//         [feedInfo.hash],
//         summary,
//     );

//     await processCsv(
//         ctx,
//         path.join(baseDir, "calendar_dates.txt"),
//         "calendar_dates",
//         (r) => mapCalendarDateRow(r, ctx.config.agencyId),
//         calendarDates,
//         [calendarDates.agencyId, calendarDates.serviceSid, calendarDates.date],
//         summary,
//     );

//     ctx.logger.info(
//         { tables: summary.tables, skipped: summary.skipped, errors: summary.errors.length },
//         "Static pipeline complete",
//     );

//     return ok(summary);
// }

export async function runStatic(ctx: Context, gtfsUrl: string, deleteRows = false) {
    if (deleteRows) {
        ctx.logger.info("Dropping existing rows");
        const result = await deleteAll(ctx.db);
        if (result.isErr()) {
            ctx.logger.error(result.error);
            process.exit(1);
        }
        ctx.logger.info("Existing rows dropped");
    }

    ctx.logger.info({ url: gtfsUrl }, "Downloading GTFS archive");

    const sourceResult = await downloadAndExtract(gtfsUrl);
    if (sourceResult.isErr()) return err(sourceResult.error);

    const source = sourceResult.value;
    ctx.logger.info({ dir: source.dir, hash: source.hash }, "Archive extracted");

    const agencyPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "agency.txt")),
        new AgencyTransformer(ctx.config.agencyId),
        new UpsertSink(tables.agencies, [tables.agencies.id]),
    );

    await agencyPipeline(ctx);

    // cleanup
    fs.rmSync(source.dir, { recursive: true, force: true });
}

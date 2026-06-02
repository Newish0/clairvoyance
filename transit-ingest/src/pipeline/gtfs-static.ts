import { err, ok, type Result } from "neverthrow";
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
import { type IngestError, fatalError } from "./core/error";

export type PipelineSummary = {
    errors: IngestError[];
    skipped: number;
};

export async function runStatic(
    ctx: Context,
    gtfsUrl: string,
    deleteRows = false,
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

    const agencyPipeline = pipe(
        new CsvFileSource(path.join(source.dir, "agency.txt")),
        new AgencyTransformer(ctx.config.agencyId),
        new UpsertSink(tables.agencies, [tables.agencies.id]),
    );

    try {
        await agencyPipeline(ctx);
    } catch (e) {
        const error = fatalError("PIPELINE_ERROR", "Pipeline execution failed", e);
        ctx.errors.push(error);
        return err(error);
    }

    fs.rmSync(source.dir, { recursive: true, force: true });

    return ok({ errors: ctx.errors, skipped: ctx.skipped });
}

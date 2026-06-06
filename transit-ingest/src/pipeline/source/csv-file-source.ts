import { parse } from "csv-parse";
import { createReadStream, existsSync } from "node:fs";
import type { Context } from "../core/context";
import { type ItemResult, fatalItem, itemOk } from "../core/error";
import type { Source } from "../core/pipe";

export type CsvRow = Record<string, string>;
export class CsvFileSource implements Source<CsvRow> {
    constructor(public filePath: string) {}

    async *run(ctx: Context): AsyncIterable<ItemResult<CsvRow>> {
        if (!existsSync(this.filePath)) {
            // Fatal: file missing, nothing to do
            yield fatalItem("CSV_FILE_NOT_FOUND", `CSV file not found: ${this.filePath}`);
            return;
        }

        const parser = createReadStream(this.filePath, { encoding: "utf-8" }).pipe(
            parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
                relax_column_count: true,
                // Let csv-parse handle per-row errors without breaking the stream
                skip_records_with_error: true,
                on_skip: (err) => {
                    ctx.logger.warn({ err, filePath: this.filePath }, "Skipped malformed CSV row");
                },
            }),
        );

        // Stream-level errors (e.g. disk read failure mid-stream) propagate
        // out of the for-await and are fatal — let them throw so pipe()'s
        // orchestrator records them as REALTIME_PIPELINE_ERROR.
        for await (const row of parser) {
            yield itemOk(row as CsvRow);
        }
    }
}

import type { Source } from "../core/pipe";
import type { IngestError } from "../../error";
import type { Context } from "../core/context";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";

export type CsvRow = Record<string, string>;
export class CsvFileSource implements Source<CsvRow> {
    constructor(public filePath: string) {
        this.filePath = filePath;
    }
    async *run(ctx: Context): AsyncIterable<CsvRow> {
        const parser = createReadStream(this.filePath, { encoding: "utf-8" }).pipe(
            parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
                relax_column_count: true,
            }),
        );

        for await (const row of parser) {
            yield row as CsvRow;
        }
    }
}

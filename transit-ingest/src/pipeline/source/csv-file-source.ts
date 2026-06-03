import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import { createReadStream, existsSync } from "node:fs";
import { parse } from "csv-parse";
import { recoverableError } from "../core/error";

export type CsvRow = Record<string, string>;
export class CsvFileSource implements Source<CsvRow> {
    constructor(public filePath: string) {
        this.filePath = filePath;
    }
    async *run(ctx: Context): AsyncIterable<CsvRow> {
        if (!existsSync(this.filePath)) {
            throw new Error(`CSV file not found: ${this.filePath}`);
        }

        const parser = createReadStream(this.filePath, { encoding: "utf-8" }).pipe(
            parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
                relax_column_count: true,
            }),
        );

        try {
            for await (const row of parser) {
                yield row as CsvRow;
            }
        } catch (e) {
            ctx.errors.push(
                recoverableError("CSV_PARSE_ERROR", `Failed to parse CSV: ${this.filePath}`, e),
            );
        }
    }
}

import type { Transform } from "../core/pipe";
import { calendarDates } from "database/models/tables";
import type { CsvRow } from "../source/csvFileSource";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { recoverableError } from "../core/error";

const EXCEPTION_MAPPING: Record<string, "ADDED" | "REMOVED"> = {
    "1": "ADDED",
    "2": "REMOVED",
};

export class CalendarDateTransformer implements Transform<CsvRow, typeof calendarDates.$inferInsert> {
    private calendarDateInsertSchema = createInsertSchema(calendarDates);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof calendarDates.$inferInsert> {
        for await (const row of input) {
            const rawExceptionType = row["exception_type"];
            const exceptionType = rawExceptionType ? EXCEPTION_MAPPING[rawExceptionType] : undefined;

            if (!exceptionType) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Invalid exception_type: ${row["exception_type"]}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            const calendarDate = this.calendarDateInsertSchema({
                agencyId: this.agencyId,
                serviceSid: row["service_id"],
                date: row["date"],
                exceptionType,
            });

            if (calendarDate instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Calendar date row validation failed: ${calendarDate.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield calendarDate;
            }
        }
    }
}

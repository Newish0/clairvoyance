import type { Transform } from "../core/pipe";
import { calendarDates } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import { type calendarExceptionTypeEnum } from "database/models/enums";

const EXCEPTION_MAPPING: Record<string, (typeof calendarExceptionTypeEnum.enumValues)[number]> = {
    "1": "ADDED",
    "2": "REMOVED",
};

export class CalendarDateTransformer implements Transform<CsvRow, typeof calendarDates.$inferInsert> {
    private calendarDateInsertSchema = createInsertSchema(calendarDates);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof calendarDates.$inferInsert>> {
        for await (const row of input) {
            const rawExceptionType = row["exception_type"];
            const exceptionType = rawExceptionType ? EXCEPTION_MAPPING[rawExceptionType] : null;

            if (!exceptionType) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Invalid exception_type: ${row["exception_type"]}`,
                );
                continue;
            }

            const calendarDate = this.calendarDateInsertSchema({
                agencyId: this.agencyId,
                serviceSid: row["service_id"],
                date: row["date"],
                exceptionType,
            });

            if (calendarDate instanceof akType.errors) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Calendar date row validation failed: ${calendarDate.summary}`,
                );
            } else {
                yield itemOk(calendarDate);
            }
        }
    }
}

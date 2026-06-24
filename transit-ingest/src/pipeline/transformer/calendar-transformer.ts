import type { Transform } from "../core/pipe";
import { calendars } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";

export class CalendarTransformer implements Transform<CsvRow, typeof calendars.$inferInsert> {
    private calendarInsertSchema = createInsertSchema(calendars);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof calendars.$inferInsert>> {
        for await (const row of input) {
            const calendar = this.calendarInsertSchema({
                agencyId: this.agencyId,
                serviceSid: row["service_id"],
                monday: row["monday"] === "1",
                tuesday: row["tuesday"] === "1",
                wednesday: row["wednesday"] === "1",
                thursday: row["thursday"] === "1",
                friday: row["friday"] === "1",
                saturday: row["saturday"] === "1",
                sunday: row["sunday"] === "1",
                startDate: row["start_date"],
                endDate: row["end_date"],
            });

            if (calendar instanceof akType.errors) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Calendar row validation failed: ${calendar.summary}`,
                );
            } else {
                yield itemOk(calendar);
            }
        }
    }
}

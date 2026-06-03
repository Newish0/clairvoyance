import type { Transform } from "../core/pipe";
import { agencies } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { recoverableError } from "../core/error";

export class AgencyTransformer implements Transform<CsvRow, typeof agencies.$inferInsert> {
    private agencyInsertSchema = createInsertSchema(agencies);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof agencies.$inferInsert> {
        for await (const row of input) {
            const agency = this.agencyInsertSchema({
                id: this.agencyId,
                agencySid: row["agency_id"],
                name: row["agency_name"],
                url: row["agency_url"],
                timezone: row["agency_timezone"],
                lang: row["agency_lang"],
                phone: row["agency_phone"],
                fareUrl: row["agency_fare_url"],
                email: row["agency_email"],
            });
            if (agency instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Agency row validation failed: ${agency.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield agency;
            }
        }
    }
}

import type { Transform } from "../core/pipe";
import { agencies } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";

export class AgencyTransformer implements Transform<CsvRow, typeof agencies.$inferInsert> {
    private agencyInsertSchema = createInsertSchema(agencies);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof agencies.$inferInsert>> {
        for await (const row of input) {
            const agency = this.agencyInsertSchema({
                id: this.agencyId,
                agencySid: row["agency_id"],
                name: row["agency_name"],
                url: row["agency_url"],
                timezone: row["agency_timezone"],
                lang: row["agency_lang"] || null,
                phone: row["agency_phone"] || null,
                fareUrl: row["agency_fare_url"] || null,
                email: row["agency_email"] || null,
            });
            if (agency instanceof akType.errors) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Agency row validation failed: ${agency.summary}`,
                );
            } else {
                yield itemOk(agency);
            }
        }
    }
}

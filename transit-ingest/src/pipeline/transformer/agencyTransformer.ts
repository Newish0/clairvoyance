import type { Transform } from "../core/pipe";
import { agencies } from "database/models/tables";
import type { CsvRow } from "../source/csvFileSource";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";

export class AgencyTransformer implements Transform<CsvRow, typeof agencies.$inferInsert> {
    private agencyInsertSchema = createInsertSchema(agencies);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof agencies.$inferInsert> {
        for await (const row of input) {
            const agency = this.agencyInsertSchema({
                ...row,
                id: this.agencyId,
            });
            if (agency instanceof akType.errors) {
                ctx.logger.error(
                    "Failed to map agency row; insertion schema validation failed: " +
                        agency.summary,
                );
            } else {
                yield agency;
            }
        }
    }
}

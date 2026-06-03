import type { Transform } from "../core/pipe";
import { feedInfo } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { recoverableError } from "../core/error";

export class FeedInfoTransformer implements Transform<CsvRow, typeof feedInfo.$inferInsert> {
    private feedInsertSchema = createInsertSchema(feedInfo);

    constructor(
        public agencyId: string,
        public feedHash: string,
    ) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof feedInfo.$inferInsert> {
        for await (const row of input) {
            const info = this.feedInsertSchema({
                hash: this.feedHash,
                agencyId: this.agencyId,
                publisherName: row["feed_publisher_name"],
                publisherUrl: row["feed_publisher_url"],
                lang: row["feed_lang"],
                version: row["feed_version"],
                startDate: row["feed_start_date"],
                endDate: row["feed_end_date"],
            });
            if (info instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `FeedInfo row validation failed: ${info.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield info;
            }
        }
    }
}

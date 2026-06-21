import { type InferInsertModel, getTableName } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { upsertMany } from "../../db/upsert";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Sink } from "../core/pipe";

export class UpsertSink<T extends PgTable, Q extends InferInsertModel<T>> implements Sink<Q> {
    constructor(
        public table: T,
        public conflictColumns: PgColumn[],
        public ignoreColumns: (keyof T["_"]["columns"])[] = [],
        public batchSize: number = 1000,
        private batch: Array<Q> = [],
    ) {}
    async run(ctx: Context, input: AsyncIterable<Q>): Promise<void> {
        for await (const item of input) {
            this.batch.push(item);
            if (this.batch.length === this.batchSize) {
                await this.flush(ctx);
            }
        }
        if (this.batch.length > 0) {
            await this.flush(ctx);
        }
    }

    private async flush(ctx: Context): Promise<void> {
        try {
            const startTime = performance.now();
            await upsertMany(
                ctx.db,
                this.table,
                this.batch,
                this.conflictColumns,
                this.ignoreColumns,
            );
            const ms = performance.now() - startTime;
            ctx.logger.debug(
                { tableName: getTableName(this.table), items: this.batch.length, ms },
                "Upsert complete",
            );
        } catch (e) {
            ctx.errors.push(
                recoverableError(
                    "DB_UPSERT_ERROR",
                    `Failed to upsert batch into ${getTableName(this.table)}`,
                    e,
                ),
            );
            ctx.skipped += this.batch.length;
        } finally {
            this.batch = [];
        }
    }
}

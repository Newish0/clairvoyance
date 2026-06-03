import type { InferInsertModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Sink } from "../core/pipe";
import { upsertMany } from "../../db/upsert";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";

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
                try {
                    await upsertMany(
                        ctx.db,
                        this.table,
                        this.batch,
                        this.conflictColumns,
                        this.ignoreColumns,
                    );
                } catch (e) {
                    ctx.errors.push(
                        recoverableError(
                            "DB_UPSERT_ERROR",
                            `Failed to upsert batch into ${this.table._.name}`,
                            e,
                        ),
                    );
                    ctx.skipped += this.batch.length;
                }
                this.batch = [];
            }
        }

        if (this.batch.length > 0) {
            try {
                await upsertMany(
                    ctx.db,
                    this.table,
                    this.batch,
                    this.conflictColumns,
                    this.ignoreColumns,
                );
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "DB_UPSERT_ERROR",
                        `Failed to upsert batch into ${this.table._.name}`,
                        e,
                    ),
                );
                ctx.skipped += this.batch.length;
            }
        }
    }
}

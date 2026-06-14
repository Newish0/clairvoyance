import { getColumns, SQL, sql, type InferInsertModel } from "drizzle-orm";
import { PgColumn, PgTable, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Db } from "./client";

/**
 * Upsert an array of rows into a Postgres table.
 *
 * @param db      - Drizzle NodePgDatabase instance
 * @param table   - Target Drizzle PgTable
 * @param values  - Rows to insert/update (must be non-empty)
 * @param target  - Conflict target: single column or array of columns
 * @param ignore  - Column keys to leave untouched on conflict (e.g. 'createdAt')
 *
 * @example
 * // Simple - conflict on id, update everything else
 * await upsertMany(db, users, rows, users.id);
 *
 * @example
 * // Composite conflict target
 * await upsertMany(db, inventory, rows, [inventory.warehouseId, inventory.productId]);
 *
 * @example
 * // Ignore createdAt on update (preserve original row value)
 * await upsertMany(db, users, rows, users.email, ['createdAt']);
 */
export async function upsertMany<T extends PgTable>(
    db: Db,
    table: T,
    values: InferInsertModel<T>[],
    target: PgColumn | PgColumn[],
    ignore: (keyof T["_"]["columns"])[] = [],
): Promise<void> {
    if (values.length === 0) return;

    const columns = getColumns(table);

    // Collect column names used as conflict targets so we skip them in SET
    const targetNames = new Set((Array.isArray(target) ? target : [target]).map((c) => c.name));

    // Collect column names the caller wants to preserve on conflict
    const ignoredNames = new Set(ignore.map((key) => columns[key as string]!.name));

    // Build SET clause: every column that is not a conflict target and not ignored
    const set = Object.entries(columns).reduce<PgUpdateSetSource<T>>((acc, [key, col]) => {
        if (!targetNames.has(col.name) && !ignoredNames.has(col.name)) {
            (acc as Record<string, SQL>)[key] = sql.raw(`excluded.${col.name}`);
        }
        return acc;
    }, {} as PgUpdateSetSource<T>);

    await db
        .insert(table)
        .values(values as any)
        .onConflictDoUpdate({ target, set });
}

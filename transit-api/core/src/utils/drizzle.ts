import { getTableColumns, Table } from "drizzle-orm";

/**
 * Source: https://github.com/drizzle-team/drizzle-orm/issues/3034#issuecomment-2678747108
 * @param table
 * @param columns
 * @returns
 */
export function pickTableColumns<
    T extends Table,
    Columns extends Partial<Record<keyof T["_"]["columns"], string | true>>,
>(table: T, columns: Columns) {
    const allColumns = getTableColumns(table);

    return Object.fromEntries(
        Object.entries(columns).map(([key, value]) => [
            typeof value === "string" ? value : key,
            allColumns[key],
        ]),
    ) as {
        [Column in keyof Columns as Columns[Column] extends string
            ? Columns[Column]
            : Columns[Column] extends true
              ? Column
              : never]: Column extends keyof T["_"]["columns"] ? T["_"]["columns"][Column] : never;
    };
}

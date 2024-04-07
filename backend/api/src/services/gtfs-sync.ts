import { type PostgresJsDatabase } from "drizzle-orm/postgres-js/driver";
import type BetterSqlite3 from "better-sqlite3";
import { getRoutes, getTrips, getShapes } from "gtfs";
import { routes } from "@/db/schemas/routes";
import { trips } from "@/db/schemas/trips";
import { shapes } from "@/db/schemas/shapes";
import { sql } from "drizzle-orm";
import { type PgTableWithColumns } from "drizzle-orm/pg-core";

export async function syncGtfsStaticWithPG(
    psDB: PostgresJsDatabase,
    gtfsDB: BetterSqlite3.Database
) {
    const inRoutes = getRoutes({}, [], [], { db: gtfsDB });
    await psDB.execute(sql`TRUNCATE routes CASCADE;`);
    await bulkInsert(psDB, routes, inRoutes);

    const inTrips = getTrips({}, [], [], { db: gtfsDB });
    await psDB.execute(sql`TRUNCATE trips CASCADE;`);
    await bulkInsert(psDB, trips, inTrips);

    const inShapes = getShapes({}, [], [], { db: gtfsDB });
    await psDB.execute(sql`TRUNCATE shapes CASCADE;`);
    await bulkInsert(psDB, shapes, inShapes);
}

/**
 * Inserts an array of records into a database table in batches to avoid reaching
 * the maximum number of promises.
 * @param db The PostgresJsDatabase instance
 * @param table The PgTableWithColumns instance to insert records into
 * @param records The array of records to insert
 * @param bulkSize The size of each insert batch (default 1000)
 * @returns A Promise that resolves when all records have been inserted
 */
async function bulkInsert<T>(
    db: PostgresJsDatabase,
    table: PgTableWithColumns<any>,
    records: T[],
    bulkSize = 1000
) {
    const insertChunks = Math.ceil(records.length / bulkSize);
    for (let i = 0; i < insertChunks; i++) {
        const start = i * bulkSize;
        const end = Math.min((i + 1) * bulkSize, records.length);

        const chunk = records.slice(start, end);

        await db.insert(table).values(chunk as unknown as (typeof table.$inferInsert)[]);
    }
}

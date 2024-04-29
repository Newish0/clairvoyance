import { type PostgresJsDatabase } from "drizzle-orm/postgres-js/driver";
import type BetterSqlite3 from "better-sqlite3";
import { getRoutes, getTrips, getShapes } from "gtfs";
import { routes } from "@/db/schemas/routes";
import { trips } from "@/db/schemas/trips";
import { shapes } from "@/db/schemas/shapes";
import type defaultDB from "@/db";
import { sql, eq, and } from "drizzle-orm";
import {
    IndexColumn,
    PgInsertBase,
    PgInsertOnConflictDoUpdateConfig,
    type PgTableWithColumns,
} from "drizzle-orm/pg-core";
import { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { equalRecords } from "@/utils/compare";

export async function syncGtfsStaticWithPG(psDB: typeof defaultDB, gtfsDB: BetterSqlite3.Database) {
    await psDB.transaction(async (tx) => {
        const inRoutes = getRoutes({}, [], [], { db: gtfsDB });

        for (const newRoute of inRoutes) {
            const existingRoute = (
                await tx
                    .select()
                    .from(routes)
                    .where(eq(routes.route_id, newRoute.route_id))
                    .limit(1)
            ).at(0);

            if (existingRoute) {
                if (!equalRecords(existingRoute, newRoute)) {
                    console.log("SKIPPED! Existing route is different from new route");
                    console.log("Existing route:", existingRoute);
                    console.log("New route:", newRoute);
                    console.log();
                }
            } else {
                // console.log("New route:", newRoute);
                await tx
                    .insert(routes)
                    .values(newRoute as typeof routes.$inferInsert)
                    .onConflictDoNothing();
            }
        }

        const inTrips = getTrips({}, [], [], { db: gtfsDB });

        for (const newTrip of inTrips) {
            const existingTrip = (
                await tx.select().from(trips).where(eq(trips.trip_id, newTrip.trip_id)).limit(1)
            ).at(0);

            if (existingTrip) {
                if (!equalRecords(existingTrip, newTrip)) {
                    console.log("SKIPPED! Existing trip is different from new trip");
                    console.log("Existing trip:", existingTrip);
                    console.log("New trip:", newTrip);
                    console.log();
                }
            } else {
                // console.log("New trip:", newTrip);
                await tx
                    .insert(trips)
                    .values(newTrip as typeof trips.$inferInsert)
                    .onConflictDoNothing();
            }
        }

        const inShapes = getShapes({}, [], [], { db: gtfsDB });

        for (const newShape of inShapes) {
            const existingShape = (
                await tx
                    .select()
                    .from(shapes)
                    .where(
                        and(
                            eq(shapes.shape_id, newShape.shape_id),
                            eq(shapes.shape_pt_sequence, newShape.shape_pt_sequence)
                        )
                    )
                    .limit(1)
            ).at(0);

            if (existingShape) {
                if (!equalRecords(existingShape, newShape)) {
                    console.log("SKIPPED! Existing shape is different from new shape");
                    console.log("Existing shape:", existingShape);
                    console.log("New shape:", newShape);
                    console.log();
                }
            } else {
                // console.log("New shape:", newShape);
                await tx
                    .insert(shapes)
                    .values(newShape as typeof shapes.$inferInsert)
                    .onConflictDoNothing();
            }
        }
    });
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
    conflictTarget?: IndexColumn | IndexColumn[],
    bulkSize = 1000
) {
    const insertChunks = Math.ceil(records.length / bulkSize);
    for (let i = 0; i < insertChunks; i++) {
        const start = i * bulkSize;
        const end = Math.min((i + 1) * bulkSize, records.length);

        const chunk = records.slice(start, end);

        if (conflictTarget) {
            await db
                .insert(table)
                .values(chunk as unknown as (typeof table.$inferInsert)[])
                .onConflictDoUpdate({
                    target: conflictTarget,
                    set: {},
                });
        } else {
        }
    }
}

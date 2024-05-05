import { type PostgresJsDatabase } from "drizzle-orm/postgres-js/driver";
import type BetterSqlite3 from "better-sqlite3";
import { getRoutes, getTrips, getShapes, getStops, getStoptimes } from "gtfs";
import { routes } from "@/db/schemas/routes";
import { trips } from "@/db/schemas/trips";
import { shapes } from "@/db/schemas/shapes";
import { stops } from "@/db/schemas/stops";
import { stop_times as stopTimes } from "@/db/schemas/stop_times";

import type defaultDB from "@/db";
import { sql, eq, and } from "drizzle-orm";
import {
    IndexColumn,
    PgInsertBase,
    PgInsertOnConflictDoUpdateConfig,
    type PgTransaction,
    type PgTableWithColumns,
    type TableConfig,
} from "drizzle-orm/pg-core";
import { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { equalRecords } from "@/utils/compare";

import { SingleBar } from "cli-progress";

const parseRawGtfsTimestamp = (rawGtfsTimestamp: string | undefined): Date | null => {
    return rawGtfsTimestamp ? new Date(parseInt(rawGtfsTimestamp) * 1000) : null;
};

const syncTable = async (
    transaction: PgTransaction<never, never, never>,
    table: PgTableWithColumns<never>,
    newTuples: Iterable<unknown>,
    getExistingTuple: (nt: any) => any,
    compareTuples: (existingTuple: any, newTuple: any) => boolean,
    transform?: (newTuple: any) => any,
    bulkSize: number = 1000
) => {
    const progressBar = new SingleBar({});
    progressBar.start(Array.from(newTuples).length, 0);

    const bulk: Promise<void>[] = [];

    for (const newTuple of newTuples) {
        const syncTuple = async () => {
            const existingTuple = await getExistingTuple(newTuple);
            if (existingTuple) {
                if (!compareTuples(existingTuple, newTuple)) {
                    console.log("SKIPPED! Existing tuple is different from new tuple");
                    console.log("Existing tuple:", existingTuple);
                    console.log("New tuple:", newTuple);
                    console.log();
                }
            } else {
                const newTupleToInsert = transform ? transform(newTuple) : newTuple;
                await transaction
                    .insert(table)
                    .values(newTupleToInsert as typeof table.$inferInsert)
                    .onConflictDoNothing();
            }
            progressBar.increment();
        };

        bulk.push(syncTuple());

        if (bulk.length >= bulkSize) {
            await Promise.all(bulk);
            bulk.splice(0, bulk.length);
        }
    }

    await Promise.all(bulk);
    progressBar.stop();
};

export async function syncGtfsStaticWithPG(psDB: typeof defaultDB, gtfsDB: BetterSqlite3.Database) {
    await psDB.transaction(async (tx) => {
        console.log("Sync routes...");

        syncTable(
            tx as any,
            routes as any,
            getRoutes({}, [], [], { db: gtfsDB }),
            async (newRoute: Record<string, any>) => {
                return (
                    await tx
                        .select()
                        .from(routes)
                        .where(eq(routes.route_id, newRoute.route_id))
                        .limit(1)
                ).at(0);
            },
            equalRecords
        );

        // const inRoutes = getRoutes({}, [], [], { db: gtfsDB });

        // for (const newRoute of inRoutes) {
        //     const existingRoute = (
        //         await tx
        //             .select()
        //             .from(routes)
        //             .where(eq(routes.route_id, newRoute.route_id))
        //             .limit(1)
        //     ).at(0);

        //     if (existingRoute) {
        //         if (!equalRecords(existingRoute, newRoute)) {
        //             console.log("SKIPPED! Existing route is different from new route");
        //             console.log("Existing route:", existingRoute);
        //             console.log("New route:", newRoute);
        //             console.log();
        //         }
        //     } else {
        //         // console.log("New route:", newRoute);
        //         await tx
        //             .insert(routes)
        //             .values(newRoute as typeof routes.$inferInsert)
        //             .onConflictDoNothing();
        //     }
        // }

        console.log("Sync trips...");

        await syncTable(
            tx as any,
            trips as any,
            getTrips({}, [], [], { db: gtfsDB }),
            async (newTrip: Record<string, any>) => {
                return (
                    await tx.select().from(trips).where(eq(trips.trip_id, newTrip.trip_id)).limit(1)
                ).at(0);
            },
            equalRecords
        );

        // const inTrips = getTrips({}, [], [], { db: gtfsDB });

        // for (const newTrip of inTrips) {
        //     const existingTrip = (
        //         await tx.select().from(trips).where(eq(trips.trip_id, newTrip.trip_id)).limit(1)
        //     ).at(0);

        //     if (existingTrip) {
        //         if (!equalRecords(existingTrip, newTrip)) {
        //             console.log("SKIPPED! Existing trip is different from new trip");
        //             console.log("Existing trip:", existingTrip);
        //             console.log("New trip:", newTrip);
        //             console.log();
        //         }
        //     } else {
        //         // console.log("New trip:", newTrip);
        //         await tx
        //             .insert(trips)
        //             .values(newTrip as typeof trips.$inferInsert)
        //             .onConflictDoNothing();
        //     }
        // }

        console.log("Sync shapes...");

        await syncTable(
            tx as any,
            shapes as any,
            getShapes({}, [], [], { db: gtfsDB }),
            async (newShape: Record<string, any>) => {
                return (
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
            },
            equalRecords
        );

        // const inShapes = getShapes({}, [], [], { db: gtfsDB });

        // for (const newShape of inShapes) {
        //     const existingShape = (
        //         await tx
        //             .select()
        //             .from(shapes)
        //             .where(
        //                 and(
        //                     eq(shapes.shape_id, newShape.shape_id),
        //                     eq(shapes.shape_pt_sequence, newShape.shape_pt_sequence)
        //                 )
        //             )
        //             .limit(1)
        //     ).at(0);

        //     if (existingShape) {
        //         if (!equalRecords(existingShape, newShape)) {
        //             console.log("SKIPPED! Existing shape is different from new shape");
        //             console.log("Existing shape:", existingShape);
        //             console.log("New shape:", newShape);
        //             console.log();
        //         }
        //     } else {
        //         // console.log("New shape:", newShape);
        //         await tx
        //             .insert(shapes)
        //             .values(newShape as typeof shapes.$inferInsert)
        //             .onConflictDoNothing();
        //     }
        // }

        console.log("Sync stops...");

        await syncTable(
            tx as any,
            stops as any,
            getStops({}, [], [], { db: gtfsDB }),
            async (newStop: Record<string, any>) => {
                return (
                    await tx.select().from(stops).where(eq(stops.stop_id, newStop.stop_id)).limit(1)
                ).at(0);
            },
            equalRecords
        );

        // const inStops = getStops({}, [], [], { db: gtfsDB });

        // for (const newStop of inStops) {
        //     const existingStop = (
        //         await tx.select().from(stops).where(eq(stops.stop_id, newStop.stop_id)).limit(1)
        //     ).at(0);

        //     if (existingStop) {
        //         if (!equalRecords(existingStop, newStop)) {
        //             console.log("SKIPPED! Existing stop is different from new stop");
        //             console.log("Existing stop:", existingStop);
        //             console.log("New stop:", newStop);
        //             console.log();
        //         }
        //     } else {
        //         // console.log("New stop:", newStop);
        //         await tx
        //             .insert(stops)
        //             .values(newStop as typeof stops.$inferInsert)
        //             .onConflictDoNothing();
        //     }
        // }

        console.log("Sync stoptimes...");

        await syncTable(
            tx as any,
            stopTimes as any,
            getStoptimes({}, [], [], { db: gtfsDB }),
            async (newStopTime: Record<string, any>) => {
                return (
                    await tx
                        .select()
                        .from(stopTimes)
                        .where(
                            and(
                                eq(stopTimes.trip_id, newStopTime.trip_id),
                                eq(stopTimes.stop_sequence, newStopTime.stop_sequence)
                            )
                        )
                        .limit(1)
                ).at(0);
            },
            equalRecords
        );

        // const inStopTimes = getStoptimes({}, [], [], { db: gtfsDB });

        // for (const newStopTime of inStopTimes) {
        //     const existingStopTime = (
        //         await tx
        //             .select()
        //             .from(stopTimes)
        //             .where(
        //                 and(
        //                     eq(stopTimes.trip_id, newStopTime.trip_id),
        //                     eq(stopTimes.stop_sequence, newStopTime.stop_sequence)
        //                 )
        //             )
        //             .limit(1)
        //     ).at(0);

        //     if (existingStopTime) {
        //         if (!equalRecords(existingStopTime, newStopTime)) {
        //             console.log("SKIPPED! Existing stop time is different from new stop time");
        //             console.log("Existing stop time:", existingStopTime);
        //             console.log("New stop time:", newStopTime);
        //             console.log();
        //         }
        //     } else {
        //         // console.log("New stop time:", newStopTime);
        //         await tx
        //             .insert(stopTimes)
        //             .values(newStopTime as typeof stopTimes.$inferInsert)
        //             .onConflictDoNothing();
        //     }
        // }
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

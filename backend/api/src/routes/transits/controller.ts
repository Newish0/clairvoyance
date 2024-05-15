import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import pgDb from "@/db";
import { and, lte, sql, eq, or, gte, desc, isNotNull, isNull, asc } from "drizzle-orm";

import { stops as stopsTable } from "@/db/schemas/stops";
import { stop_times as stopTimesTable } from "@/db/schemas/stop_times";
import { routes as routesTable } from "@/db/schemas/routes";
import { trips as tripsTable } from "@/db/schemas/trips";
import { realtime_vehicle_position as rtvpTable } from "@/db/schemas/rtvp";
import { stopTimesPTraveled } from "@/db/schemas/views/stop_times_p_traveled";
import { SECONDS_IN_A_DAY, getSecondsSinceStartOfDay } from "@/utils/datetime";
import { union } from "drizzle-orm/pg-core";

type NearbyTransit = typeof routesTable.$inferSelect & {
    trips: (typeof tripsTable.$inferSelect & {
        stop_time: typeof stopTimesTable.$inferSelect & {
            p_traveled: number;
            stop: typeof stopsTable.$inferSelect;
        };
        rtvp: typeof rtvpTable.$inferSelect | null;
    })[];
};

export default function (hono: Hono) {
    hono.get(
        "/nearby",
        zValidator(
            "query",
            z.object({
                lat: z.string(),
                lng: z.string(),
                radius: z.string(),
            })
        ),
        async (c) => {
            const { lat, lng, radius } = c.req.valid("query");

            const targetLat = parseFloat(lat);
            const targetLng = parseFloat(lng);
            const maxDistanceKm = parseFloat(radius);

            const secondsSinceStartOfDay = getSecondsSinceStartOfDay(true);

            const nearbyTransitsWithRtvpRaw = await pgDb
                .selectDistinctOn([tripsTable.route_id, tripsTable.direction_id])
                .from(stopsTable)
                .leftJoin(stopTimesTable, eq(stopTimesTable.stop_id, stopsTable.stop_id))
                .leftJoin(tripsTable, eq(tripsTable.trip_id, stopTimesTable.trip_id))
                .leftJoin(routesTable, eq(routesTable.route_id, tripsTable.route_id))
                .leftJoin(rtvpTable, eq(rtvpTable.trip_id, tripsTable.trip_id))
                .leftJoin(
                    stopTimesPTraveled,
                    and(
                        eq(stopTimesPTraveled.trip_id, stopTimesTable.trip_id),
                        eq(stopTimesPTraveled.stop_id, stopTimesTable.stop_id)
                    )
                )
                .where(
                    and(
                        lte(
                            sql<number>`(6371 * acos(
                                cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                                sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                            ))`,
                            maxDistanceKm
                        ),
                        and(
                            isNotNull(rtvpTable),
                            gte(rtvpTable.timestamp, sql`NOW() - INTERVAL '1 minute'`),
                            gte(stopTimesPTraveled.p_traveled, rtvpTable.p_traveled)
                        )
                    )
                )
                .orderBy(
                    tripsTable.route_id,
                    tripsTable.direction_id,
                    asc(sql<number>`(6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                    ))`),
                    asc(stopTimesTable.arrival_timestamp)
                );

            const nearbyTransitStaticRaw = await pgDb
                .selectDistinctOn([tripsTable.route_id, tripsTable.direction_id])
                .from(stopsTable)
                .leftJoin(stopTimesTable, eq(stopTimesTable.stop_id, stopsTable.stop_id))
                .leftJoin(tripsTable, eq(tripsTable.trip_id, stopTimesTable.trip_id))
                .leftJoin(routesTable, eq(routesTable.route_id, tripsTable.route_id))
                .leftJoin(rtvpTable, eq(rtvpTable.trip_id, tripsTable.trip_id))
                .leftJoin(
                    stopTimesPTraveled,
                    and(
                        eq(stopTimesPTraveled.trip_id, stopTimesTable.trip_id),
                        eq(stopTimesPTraveled.stop_id, stopTimesTable.stop_id)
                    )
                )
                .where(
                    and(
                        lte(
                            sql<number>`(6371 * acos(
                            cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                            sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                        ))`,
                            maxDistanceKm
                        ),
                        and(
                            isNull(rtvpTable),
                            eq(tripsTable.trip_id, stopTimesTable.trip_id),
                            gte(
                                sql<number>`MOD(${stopTimesTable.arrival_timestamp}, ${SECONDS_IN_A_DAY})`,
                                secondsSinceStartOfDay
                            )
                        )
                    )
                )
                .orderBy(
                    tripsTable.route_id,
                    tripsTable.direction_id,
                    asc(sql<number>`(6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                    ))`),
                    asc(stopTimesTable.arrival_timestamp)
                );

            const nearbyTransitsRawResult = [
                ...nearbyTransitsWithRtvpRaw,
                ...nearbyTransitStaticRaw.filter(
                    (t1) =>
                        !nearbyTransitsWithRtvpRaw.some(
                            (t2) =>
                                t1.trips &&
                                t2.trips &&
                                t1.trips.route_id === t2.trips.route_id &&
                                t1.trips.direction_id === t2.trips.direction_id
                        )
                ),
            ];

            const nearbyTransits: NearbyTransit[] = [];

            // Reformat data
            for (const rawTransit of nearbyTransitsRawResult) {
                const {
                    routes: route,
                    stop_times: stop_time,
                    stop_times_p_traveled,
                    stops: stop,
                    trips: trip,
                    vehicle_position,
                } = rawTransit;

                if (!route || !trip || !stop_time) continue;

                const nbTrip = {
                    ...trip,
                    rtvp: vehicle_position,
                    stop_time: {
                        ...stop_time,
                        stop,
                        p_traveled: (stop_times_p_traveled as any)?.p_traveled,
                    },
                };

                const existingNbEntry = nearbyTransits.find((nb) => nb.route_id === route.route_id);
                if (existingNbEntry) {
                    existingNbEntry.trips.push(nbTrip);
                } else {
                    nearbyTransits.push({
                        ...route,
                        trips: [nbTrip],
                    });
                }
            }

            return c.json(nearbyTransits);
        }
    );
}

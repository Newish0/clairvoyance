import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import pgDb from "@/db";
import { and, lte, sql, eq, or } from "drizzle-orm";

import { stops as stopsTable } from "@/db/schemas/stops";
import { stop_times as stopTimesTable } from "@/db/schemas/stop_times";
import { routes as routesTable } from "@/db/schemas/routes";
import { trips as tripsTable } from "@/db/schemas/trips";
import { realtime_vehicle_position as rtvpTable } from "@/db/schemas/rtvp";
import { SECONDS_IN_A_DAY, getSecondsSinceStartOfDay } from "@/utils/datetime";

type NearbyTransit = typeof routesTable.$inferSelect & {
    trips: (typeof tripsTable.$inferSelect & {
        stop_time: typeof stopTimesTable.$inferSelect & {
            p_traveled: number;
            stop: typeof stopsTable.$inferSelect;
        };
        rtvp: typeof rtvpTable.$inferSelect;
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

            // FIXME: nearby transit fails to consider trip that are late.
            //        i.e. when trip have not pass stop b/c it's late, it will
            //        be ignored since the static arrival time of that trip
            //        has already been passed.

            const targetLat = parseFloat(lat);
            const targetLng = parseFloat(lng);
            const maxDistanceKm = parseFloat(radius);

            const secondsSinceStartOfDay = getSecondsSinceStartOfDay(true);

            const nearbyTransitsRawResult = await pgDb.query.stops.findMany({
                where: (stops, { lte }) =>
                    lte(
                        sql<number>`
                                    (6371 * acos(
                                        cos(radians(${targetLat})) * cos(radians(${stops.stop_lat})) * cos(radians(${stops.stop_lon}) - radians(${targetLng})) +
                                        sin(radians(${targetLat})) * sin(radians(${stops.stop_lat}))
                                    ))`,
                        maxDistanceKm
                    ),
                with: {
                    // Select next closest arrival time
                    stop_times: {
                        where: (stop_times, { gte, sql }) =>
                            or(
                                gte(
                                    sql<number>`MOD(${stop_times.arrival_timestamp}, ${SECONDS_IN_A_DAY})`,
                                    secondsSinceStartOfDay
                                ),
                                gte(
                                    sql<number>`
                                        ${stop_times.shape_dist_traveled} /
                                        (SELECT 
                                            MAX(shape_dist_traveled) AS last_shape_dist_traveled
                                        FROM 
                                            stop_times
                                        WHERE trip_id = ${stop_times.trip_id})`,
                                    sql<number>`
                                        (SELECT p_traveled FROM vehicle_position
                                        WHERE trip_id = ${stop_times.trip_id}
                                        ORDER BY rtvp_timestamp DESC
                                        LIMIT 1)
                                    `
                                )
                            ),

                        orderBy: (stop_times, { asc }) =>
                            asc(
                                sql<number>`MOD(${stop_times.arrival_timestamp}, ${SECONDS_IN_A_DAY})`
                            ),
                        with: {
                            trip: {
                                with: {
                                    route: true,
                                    rtvps: {
                                        limit: 1,
                                        orderBy: (rtvps, { desc }) => desc(rtvps.timestamp),
                                    },
                                },
                            },
                        },
                        limit: 1,
                        extras: (stop_times, { sql }) => ({
                            p_traveled: sql<number>`
                                    ${stop_times.shape_dist_traveled} /
                                    (SELECT 
                                        MAX(shape_dist_traveled) AS last_shape_dist_traveled
                                    FROM 
                                        stop_times
                                    WHERE trip_id = ${stop_times.trip_id})`.as("p_traveled"),
                        }),
                    },
                },
                extras: (stops, { sql }) => ({
                    distance: sql<number>`
                    (6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${stops.stop_lat})) * cos(radians(${stops.stop_lon}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${stops.stop_lat}))
                    ))`.as("distance"),
                }),
                orderBy: (stops, { asc, sql }) =>
                    asc(sql<number>`
                (6371 * acos(
                    cos(radians(${targetLat})) * cos(radians(${stops.stop_lat})) * cos(radians(${stops.stop_lon}) - radians(${targetLng})) +
                    sin(radians(${targetLat})) * sin(radians(${stops.stop_lat}))
                ))`),
            });

            // Remove tuples with stops that have a closer alternative
            for (let i = nearbyTransitsRawResult.length - 1; i >= 0; i--) {
                const thisRouteId = nearbyTransitsRawResult[i].stop_times[0]?.trip.route_id;
                const thisDirectionId = nearbyTransitsRawResult[i].stop_times[0]?.trip.direction_id;
                const thisDistance = nearbyTransitsRawResult[i].distance;

                for (let j = nearbyTransitsRawResult.length - 1; j >= 0; j--) {
                    if (i === j) continue;

                    const otherRouteId = nearbyTransitsRawResult[j].stop_times[0]?.trip.route_id;
                    const otherDirectionId =
                        nearbyTransitsRawResult[j].stop_times[0]?.trip.direction_id;
                    const otherDistance = nearbyTransitsRawResult[j].distance;

                    if (
                        otherRouteId === thisRouteId &&
                        otherDirectionId === thisDirectionId &&
                        otherDistance >= thisDistance
                    ) {
                        nearbyTransitsRawResult.splice(j, 1);
                    }
                }
            }

            // Reformat data
            const nearbyTransits: NearbyTransit[] = [];

            for (const rawTransit of nearbyTransitsRawResult) {
                const { stop_times: remainingA, ...stop } = rawTransit;
                if (!remainingA?.at(0)) continue;
                const { trip: remainingB, ...stop_time } = remainingA[0];
                if (!remainingB) continue;
                const { route, ...remainingC } = remainingB;
                const { rtvps, ...trip } = remainingC;

                console.log(rtvps);

                const nbTrip = {
                    ...trip,
                    rtvp: rtvps[0],
                    stop_time: {
                        ...stop_time,
                        stop,
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

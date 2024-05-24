import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import pgDb from "clairvoyance-db";
import { sql, and, gte, desc, lte } from "drizzle-orm";

import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";

export default function (hono: Hono) {
    hono.get("/trip/:trip_id", async (c) => {
        const trip_id = c.req.param("trip_id");
        const tripRtvpResults = await pgDb.query.realtime_vehicle_position.findMany({
            where: (rtvp, { eq }) => eq(rtvp.trip_id, trip_id ?? ""),
            with: {
                tripUpdate: true,
            },
        });

        const tripRtvpWithElapsed: (typeof rtvpTable.$inferSelect & {
            elapsed: number | null;
        })[] = tripRtvpResults
            .map((rtvp) => {
                let elapsed: number | null = null;

                if (rtvp.tripUpdate.trip_start_timestamp) {
                    elapsed = Math.round(
                        (rtvp.timestamp.getTime() -
                            rtvp.tripUpdate.trip_start_timestamp?.getTime()) /
                            1000
                    );
                }

                return {
                    ...rtvp,
                    elapsed,
                };
            })
            .filter((rtvp) => rtvp.elapsed !== null);

        return c.json(tripRtvpWithElapsed);
    });

    hono.get(
        "/route/:route_id",
        zValidator(
            "query",
            z.object({
                direction_id: z.string().optional(),
            })
        ),
        async (c) => {
            const route_id = c.req.param("route_id");
            const { direction_id: directionIdStr } = c.req.valid("query");

            const tripIds = (
                await pgDb.query.trips.findMany({
                    where: (trip, { eq, and }) =>
                        and(
                            eq(trip.route_id, route_id ?? ""),
                            directionIdStr
                                ? eq(trip.direction_id, parseInt(directionIdStr))
                                : undefined
                        ),
                    columns: { trip_id: true },
                })
            ).map(({ trip_id }) => trip_id);

            const tripRtvpResults = await pgDb.query.realtime_vehicle_position.findMany({
                where: (rtvp, { inArray }) => inArray(rtvp.trip_id, tripIds),
                with: {
                    tripUpdate: true,
                },
            });

            const tripRtvpWithElapsed: (typeof rtvpTable.$inferSelect & {
                elapsed: number | null;
            })[] = tripRtvpResults
                .map((rtvp) => {
                    let elapsed: number | null = null;

                    if (rtvp.tripUpdate.trip_start_timestamp) {
                        elapsed = Math.round(
                            (rtvp.timestamp.getTime() -
                                rtvp.tripUpdate.trip_start_timestamp?.getTime()) /
                                1000
                        );
                    }

                    return {
                        ...rtvp,
                        elapsed,
                    };
                })
                .filter((rtvp) => rtvp.elapsed !== null);

            return c.json(tripRtvpWithElapsed);
        }
    );

    hono.get(
        "/eta",
        zValidator(
            "query",
            z.object({
                trip_id: z.string(),
                stop_id: z.string(),
            })
        ),
        async (c) => {
            const { trip_id, stop_id } = c.req.valid("query");

            const stopDistanceTraveled = (
                await pgDb.query.stop_times.findFirst({
                    where: (st, { and, eq }) =>
                        and(eq(st.trip_id, trip_id), eq(st.stop_id, stop_id)),
                    columns: {
                        shape_dist_traveled: true,
                    },
                })
            )?.shape_dist_traveled;

            const lastStopDistanceTraveled = (
                await pgDb.query.stop_times.findFirst({
                    where: (st, { and, eq }) => and(eq(st.trip_id, trip_id)),
                    orderBy: (st, { desc }) => desc(st.stop_sequence),
                    columns: {
                        shape_dist_traveled: true,
                    },
                })
            )?.shape_dist_traveled;

            if (!stopDistanceTraveled || !lastStopDistanceTraveled) {
                c.status(400);
                return c.json({
                    message: "No stop distance traveled or last stop distance traveled",
                });
            }

            const pTraveled = stopDistanceTraveled / lastStopDistanceTraveled;

            const trip = await pgDb.query.trips.findFirst({
                where: (t, { eq }) => eq(t.trip_id, trip_id),
            });

            if (!trip || trip.direction_id === null) {
                c.status(400);
                return c.json({
                    message: "No trip or direction id",
                });
            }

            const polyRegr = await pgDb.query.rtvp_polyregr.findMany({
                where: (rtvp_polyregr, { and, eq }) =>
                    and(
                        eq(rtvp_polyregr.route_id, trip.route_id),
                        eq(rtvp_polyregr.direction_id, trip.direction_id!)
                    ),
            });

            const latestRtvp = await pgDb.query.realtime_vehicle_position.findFirst({
                where: (rtvp, { eq }) => eq(rtvp.trip_id, trip_id),
                orderBy: (rtvp, { desc }) => desc(rtvp.timestamp),
                with: {
                    tripUpdate: true,
                },
            });

            if (!latestRtvp || !latestRtvp.tripUpdate.trip_start_timestamp) {
                c.status(400);
                return c.json({
                    message:
                        "No realtime vehicle position or trip start timestamp; Trip may have not started.",
                });
            }

            const latestRtvpWithElapsed = {
                ...latestRtvp,
                elapsed: Math.round(
                    (latestRtvp.timestamp.getTime() -
                        latestRtvp.tripUpdate.trip_start_timestamp.getTime()) /
                        1000
                ),
            };

            if (!latestRtvpWithElapsed.p_traveled) {
                c.status(400);
                return c.json({
                    message: "No p_traveled",
                });
            }

            const x0 = latestRtvpWithElapsed.p_traveled;
            const predictedElapsedAtX0 = polyRegr.reduce(
                (accum, { ci, i }) => accum + ci * x0 ** i,
                0
            );
            const elapsedDelta = latestRtvpWithElapsed.elapsed - predictedElapsedAtX0;

            const offsetPredictedElapsed =
                polyRegr.reduce((accum, { ci, i }) => accum + ci * pTraveled ** i, 0) +
                elapsedDelta;

            return c.json({
                stop_id,
                trip_id,
                stopDistanceTraveled,
                lastStopDistanceTraveled,
                pTraveled,
                predictedElapsedAtStop: offsetPredictedElapsed,
                eta: offsetPredictedElapsed - latestRtvpWithElapsed.elapsed,
            });
        }
    );

    hono.get(
        "/loc",
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

            const vehicles = await pgDb
                .selectDistinctOn([rtvpTable.trip_id], {
                    rtvp_id: rtvpTable.rtvp_id,
                    bearing: rtvpTable.bearing,
                    latitude: rtvpTable.latitude,
                    longitude: rtvpTable.longitude,
                    speed: rtvpTable.speed,
                    trip_id: rtvpTable.trip_id,
                    vehicle_id: rtvpTable.vehicle_id,
                    timestamp: rtvpTable.timestamp,
                    is_updated: rtvpTable.is_updated,
                    p_traveled: rtvpTable.p_traveled,
                    distance: sql<number>`(6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${rtvpTable.latitude})) * cos(radians(${rtvpTable.longitude}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${rtvpTable.latitude}))
                    ))`,
                })
                .from(rtvpTable)
                .where(
                    and(
                        lte(
                            sql<number>`(6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${rtvpTable.latitude})) * cos(radians(${rtvpTable.longitude}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${rtvpTable.latitude}))
                    ))`,
                            maxDistanceKm
                        ),
                        gte(rtvpTable.timestamp, new Date(Date.now() - 5 * 60 * 1000))
                    )
                )
                .orderBy(rtvpTable.trip_id, desc(rtvpTable.timestamp));

            return c.json(vehicles);
        }
    );
}

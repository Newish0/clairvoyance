import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import pgDb from "@/db";
import { sql, and, gte, desc, lte } from "drizzle-orm";

import { realtime_vehicle_position as rtvpTable } from "@/db/schemas/rtvp";

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

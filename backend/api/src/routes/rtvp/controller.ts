import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import pgDb from "@/db";
import { sql, and, gte, desc, lte } from "drizzle-orm";

import { realtime_vehicle_position as rtvpTable } from "@/db/schemas/rtvp";

export default function (hono: Hono) {
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
                    rel_timestamp: rtvpTable.rel_timestamp,
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
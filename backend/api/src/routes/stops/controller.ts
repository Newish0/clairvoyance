import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import pgDb from "@/db";
import { stops as stopsTable } from "@/db/schemas/stops";

export default function (hono: Hono) {
    // hono.get(
    //     "/",
    //     zValidator(
    //         "query",
    //         z.object({
    //             lat: z.string(),
    //             lng: z.string(),
    //             radius: z.string(),
    //         })
    //     ),
    //     async (c) => {
    //         const { lat, lng, radius } = c.req.valid("query");

    //         const targetLat = parseFloat(lat);
    //         const targetLng = parseFloat(lng);
    //         const maxDistanceKm = parseFloat(radius);

    //         const sqlQuery = `
    //             SELECT *,
    //                    (6371 * acos(
    //                        cos(radians(?)) * cos(radians(stop_lat)) * cos(radians(stop_lon) - radians(?)) +
    //                        sin(radians(?)) * sin(radians(stop_lat))
    //                    )) AS distance
    //             FROM stops
    //             WHERE distance <= ?
    //             ORDER BY distance ASC
    //         `;

    //         const stops = db.primary
    //             ?.prepare(sqlQuery)
    //             .all(targetLat, targetLng, targetLat, maxDistanceKm);

    //         return c.json(stops);
    //     }
    // );

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

            const stops = await pgDb.query.stops.findMany({
                where: (stops, { lte, sql }) =>
                    lte(
                        sql<number>`
                            (6371 * acos(
                                cos(radians(${targetLat})) * cos(radians(${stops.stop_lat})) * cos(radians(${stops.stop_lon}) - radians(${targetLng})) +
                                sin(radians(${targetLat})) * sin(radians(${stops.stop_lat}))
                            ))`,
                        maxDistanceKm
                    ),
            });

            return c.json(stops);
        }
    );
}

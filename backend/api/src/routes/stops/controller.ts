import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";

export default function (hono: Hono) {
    hono.get(
        "/",
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

            const sqlQuery = `
                SELECT *, 
                       (6371 * acos(
                           cos(radians(?)) * cos(radians(stop_lat)) * cos(radians(stop_lon) - radians(?)) +
                           sin(radians(?)) * sin(radians(stop_lat))
                       )) AS distance
                FROM stops
                WHERE distance <= ?
                ORDER BY distance ASC
            `;

            const stops = db.primary
                ?.prepare(sqlQuery)
                .all(targetLat, targetLng, targetLat, maxDistanceKm);

            return c.json(stops);
        }
    );
}

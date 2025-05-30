import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { fetchStopsGeoJSON, fetchNextTripsByStop } from "@/services/stopsService";

const router = new Hono()

    // // GET /stops/nearby?lat=&lng=&radius=
    // .get(
    //     "/nearby",
    //     zValidator(
    //         "query",
    //         z.object({
    //             lat: z.string().transform(Number),
    //             lng: z.string().transform(Number),
    //             radius: z.string().transform(Number),
    //         })
    //     ),
    //     async (c) => {
    //         const { lat, lng, radius } = c.req.valid("query");
    //         const data = await fetchNearbyStops(lat, lng, radius);
    //         return c.json(data);
    //     }
    // );

    // GET /stops/geojson
    .get(
        "/geojson",
        zValidator(
            "query",
            z.object({
                stopIds: z.union([z.string(), z.array(z.string())]),
            })
        ),
        async (c) => {
            const { stopIds } = c.req.valid("query");
            const ids = Array.isArray(stopIds) ? stopIds : [stopIds];
            const data = await fetchStopsGeoJSON(ids);
            return c.json(data);
        }
    )

    // GET /stops/:stopId/next-trips
    .get(
        "/:stopId/next-trips",
        zValidator("param", z.object({ stopId: z.string() })),
        async (c) => {
            const { stopId } = c.req.valid("param");
            const data = await fetchNextTripsByStop(stopId);
            return c.json(data);
        }
    );

export default router;

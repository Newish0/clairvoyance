import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
    fetchNearbyTrips,
    fetchScheduledTrips,
    fetchScheduledTripDetails,
} from "@/services/tripsService";

const router = new Hono();

// GET /trips/next?routeId=&directionId=&stopId=&startDatetime?=&endDatetime?
router.get(
    "/next",
    zValidator(
        "query",
        z.object({
            routeId: z.string(),
            directionId: z.string(),
            stopId: z.string(),
            startDatetime: z.string().optional(),
            endDatetime: z.string().optional(),
            limit: z.string().transform(Number).optional(),
        })
    ),
    async (c) => {
        const { routeId, directionId, stopId, startDatetime, endDatetime, limit } =
            c.req.valid("query");
        const data = await fetchScheduledTrips({
            routeId,
            directionId,
            stopId,
            startDatetime,
            endDatetime,
            limit
        });
        return c.json(data);
    }
);

// GET /trips/nearby?lat=&lng=&radius=
router.get(
    "/nearby",
    zValidator(
        "query",
        z.object({
            lat: z.string().transform(Number),
            lng: z.string().transform(Number),
            radius: z.string().transform(Number),
        })
    ),
    async (c) => {
        const { lat, lng, radius } = c.req.valid("query");
        const data = await fetchNearbyTrips(lat, lng, radius);
        return c.json(data);
    }
);

// GET /trips/:tripObjectId
router.get(
    "/:tripObjectId",
    zValidator("param", z.object({ tripObjectId: z.string() })),
    async (c) => {
        const { tripObjectId } = c.req.valid("param");
        const data = await fetchScheduledTripDetails(tripObjectId);
        return c.json(data);
    }
);

export default router;

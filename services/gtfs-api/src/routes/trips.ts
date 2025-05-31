import {
    fetchNearbyTrips,
    fetchScheduledTrips,
    fetchScheduledTripDetails,
} from "@/services/tripsService";

import { Elysia, t } from "elysia";

const router = new Elysia()

    // GET /trips/next?routeId=&directionId=&stopId=&startDatetime?=&endDatetime?
    .get(
        "/trips/next",
        async ({
            query: {
                routeId,
                directionId,
                stopId,
                startDatetime,
                endDatetime,
                limit,
                excludedTripObjectIds,
            },
        }) => {
            const data = await fetchScheduledTrips({
                routeId,
                directionId,
                stopId,
                startDatetime,
                endDatetime,
                limit,
                excludedTripObjectIds: excludedTripObjectIds
                    ? Array.isArray(excludedTripObjectIds)
                        ? excludedTripObjectIds
                        : [excludedTripObjectIds]
                    : undefined,
            });
            return data;
        },
        {
            query: t.Object({
                routeId: t.String(),
                directionId: t.Optional(t.String()),
                stopId: t.String(),
                startDatetime: t.Optional(t.String()),
                endDatetime: t.Optional(t.String()),
                limit: t.Optional(t.Number()),
                excludedTripObjectIds: t.Optional(t.Union([t.String(), t.Array(t.String())])),
            }),
        }
    )

    // GET /trips/nearby?lat=&lng=&radius=
    .get(
        "/trips/nearby",

        async ({ query: { lat, lng, radius } }) => {
            const data = await fetchNearbyTrips(lat, lng, radius);
            return data;
        },
        {
            query: t.Object({
                lat: t.Number(),
                lng: t.Number(),
                radius: t.Number(),
            }),
        }
    )

    // GET /trips/:tripObjectId
    .get(
        "/trips/:tripObjectId",
        async ({ params: { tripObjectId } }) => {
            const data = await fetchScheduledTripDetails(tripObjectId);
            return data;
        },
        {
            params: t.Object({
                tripObjectId: t.String(),
            }),
        }
    );

export default router;

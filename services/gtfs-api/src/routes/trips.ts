import {
    ScheduledTripDocumentSchema,
    ScheduledTripDocumentWithStopNamesSchema,
    StopTimeInfoSchema,
    TripDescriptorScheduleRelationshipSchema,
    VehicleSchema,
    VehicleStopStatusSchema,
} from "@/schemas/common-body";
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
            response: t.Array(ScheduledTripDocumentWithStopNamesSchema),
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
            response: t.Record(
                t.String(),
                t.Array(
                    t.Object({
                        _id: t.Any(),
                        trip_id: t.String(),
                        route_id: t.String(),
                        direction_id: t.Integer(),
                        start_datetime: t.Date(),
                        route_short_name: t.Optional(t.Nullable(t.String())),
                        trip_headsign: t.Optional(t.Nullable(t.String())),
                        stop_time: StopTimeInfoSchema,
                        stop_name: t.Optional(t.Nullable(t.String())),
                        current_status: t.Optional(t.Nullable(VehicleStopStatusSchema)),
                        current_stop_sequence: t.Optional(t.Nullable(t.Integer())),
                        vehicle: t.Optional(t.Nullable(VehicleSchema)),
                        stop_times_updated_at: t.Optional(t.Nullable(t.Date())),
                        schedule_relationship: t.Optional(
                            t.Nullable(TripDescriptorScheduleRelationshipSchema)
                        ),
                    })
                )
            ),
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
            response: t.Union([ScheduledTripDocumentWithStopNamesSchema, t.Null()]),
        }
    );

export default router;

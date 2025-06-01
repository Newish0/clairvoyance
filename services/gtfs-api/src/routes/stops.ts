import { fetchStopsGeoJSON, fetchNextTripsByStop } from "@/services/stopsService";
import { Elysia, t } from "elysia";

const router = new Elysia()

    // GET /stops/nearby?lat=&lng=&radius=
    // .get(
    //     "/stops/nearby",
    //     async ({
    //         query: { lat, lng, radius },
    //     }) => {
    //         const data = await fetchNearbyStops(lat, lng, radius);
    //         return data
    //     },
    //     {
    //         query: t.Object({
    //             lat: t.Number(),
    //             lng: t.Number(),
    //             radius: t.Number(),
    //         }),
    //     }
    // )

    // GET /stops/geojson
    .get(
        "/stops/geojson",

        async ({ query: { stopIds } }) => {
            const data = await fetchStopsGeoJSON(stopIds);
            return data;
        },
        {
            query: t.Object({
                stopIds: t.Array(t.String()),
            }),
            response: t.Object({
                type: t.String(),
                features: t.Array(
                    t.Object({
                        type: t.String(),
                        properties: t.Object({ stopId: t.String() }),
                        geometry: t.Optional(
                            t.Nullable(
                                t.Object({
                                    type: t.Optional(t.String()),
                                    coordinates: t.Array(t.Number()),
                                })
                            )
                        ),
                    })
                ),
            }),
        }
    )

    // GET /stops/:stopId/next-trips
    .get(
        "/stops/:stopId/next-trips",
        async ({ params: { stopId } }) => {
            const data = await fetchNextTripsByStop(stopId);
            return data;
        },
        {
            params: t.Object({
                stopId: t.String(),
            }),
        }
    );

export default router;

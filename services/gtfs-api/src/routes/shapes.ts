import { fetchShapeGeoJSON } from "@/services/shapesService";
import { Elysia, t } from "elysia";

const router = new Elysia()
    // GET /shapes/:shapeId/geojson
    .get(
        "/shapes/:shapeId/geojson",
        async ({ params: { shapeId } }) => {
            const data = await fetchShapeGeoJSON(shapeId);
            return data;
        },
        {
            params: t.Object({
                shapeId: t.String(),
            }),
            response: t.Object({
                type: t.String(),
                properties: t.Object({
                    shapeId: t.Optional(t.String()),
                    distances_traveled: t.Optional(t.Nullable(t.Array(t.Number()))),
                }),
                geometry: t.Optional(
                    t.Object({
                        type: t.Optional(t.String()),
                        coordinates: t.Array(t.Array(t.Number())),
                    })
                ),
            }),
        }
    );

export default router;

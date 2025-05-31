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
        }
    );

export default router;

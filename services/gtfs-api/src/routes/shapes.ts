import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { fetchShapeGeoJSON } from "@/services/shapesService";

const router = new Hono();

// GET /shapes/:shapeId/geojson
router.get(
    "/:shapeId/geojson",
    zValidator("param", z.object({ shapeId: z.string() })),
    async (c) => {
        const { shapeId } = c.req.valid("param");
        const data = await fetchShapeGeoJSON(shapeId);
        return c.json(data);
    }
);

export default router;

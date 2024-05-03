import { Hono } from "hono";
import { getShapesAsGeoJSON } from "gtfs";
import { db } from "@/services/gtfs-init";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export default function (hono: Hono) {
    hono.get(
        "/shapes",
        zValidator(
            "query",
            z.object({
                shape_id: z.string().optional(),
                route_id: z.string().optional(),
            })
        ),
        async (c) => {
            if (!db.primary) return c.status(500);

            const { shape_id, route_id } = c.req.valid("query");

            const shapesGeojson = await getShapesAsGeoJSON(
                {
                    shape_id,
                    route_id,
                },
                { db: db.primary}
            );
            return c.json(shapesGeojson);
        }
    );
}

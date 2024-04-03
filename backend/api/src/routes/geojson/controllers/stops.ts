import { Hono } from "hono";
import { getShapesAsGeoJSON } from "gtfs";
import { db } from "@/services/gtfs-init";

export default function (hono: Hono) {
    hono.get("/shapes", async (c) => {
        if (!db.primary) return c.status(500);

        const shapesGeojson = await getShapesAsGeoJSON({}, { db: db.primary });
        return c.json(shapesGeojson);
    });
}

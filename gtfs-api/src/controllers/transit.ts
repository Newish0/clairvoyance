import {
    getRoutes,
    getShapesAsGeoJSON,
    getStopsAsGeoJSON,
    getVehiclePositions,
    getStops,
    getTrips,
} from "gtfs";
import { type Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, on } from "@/services/gtfs";

import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export default function transitController(app: Hono) {
    app.get("/geojson/shapes", async (c) => {
        const shapesGeojson = await getShapesAsGeoJSON({}, { db: db.primary });
        return c.json(shapesGeojson);
    });

    app.get("/geojson/stops", async (c) => {
        const stopsGeojson = await getStopsAsGeoJSON({}, { db: db.primary });
        return c.json(stopsGeojson);
    });

    app.get("/routes", async (c) => {
        const routes = getRoutes(
            {}, // query filters
            [], // return  fields
            [["route_short_name", "ASC"]], // sorting
            { db: db.primary }
        );
        return c.json(routes);
    });

    app.get("/stops", async (c) => {
        const stops = getStops(
            {}, // query filters
            [], // return  fields
            [], // sorting
            { db: db.primary }
        );
        return c.json(stops);
    });

    app.get(
        "/trips",
        zValidator(
            "query",
            z.object({
                trip_id: z.string().optional(),
            })
        ),
        async (c) => {
            const { trip_id } = c.req.valid("query");

            const filter: Record<string, string | string[] | number | number[]> = {};
            if (trip_id) filter.trip_id = trip_id;

            const trips = getTrips(
                filter, // query filters
                [], // return  fields
                [], // sorting
                { db: db.primary }
            );
            return c.json(trips);
        }
    );

    // TODO: implement more efficient way of tracking last data update.
    let lastRTUpdateTime = 0;
    on("rtupdate", () => (lastRTUpdateTime = Date.now()));
    app.get("/stream", async (c) => {
        let id = 0;
        return streamSSE(c, async (stream) => {
            while (true) {
                const vehiclePositions = getVehiclePositions({}, [], [], {
                    db: db.primary,
                });

                await stream.writeSSE({
                    data: JSON.stringify(vehiclePositions),
                    event: "vehiclePositions",
                    id: String(id++),
                });
                await stream.sleep(20000);
            }
        });
    });
}

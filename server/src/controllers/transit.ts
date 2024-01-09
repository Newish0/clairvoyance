import { getRoutes, getShapesAsGeoJSON, getStopsAsGeoJSON, getVehiclePositions } from "gtfs";
import { type Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, on } from "@/services/gtfs";

//  TODO: Use router
export default function transitController(app: Hono) {
    app.get("api/transit/geojson/shapes", async (c) => {
        const shapesGeojson = await getShapesAsGeoJSON({}, { db });
        return c.json(shapesGeojson);
    });

    app.get("api/transit/geojson/stops", async (c) => {
        const stopsGeojson = await getStopsAsGeoJSON({}, { db });
        return c.json(stopsGeojson);
    });

    app.get("api/transit/routes", async (c) => {
        const routes = getRoutes(
            {}, // query filters
            [], // return  fields
            [["route_short_name", "ASC"]], // sorting
            { db }
        );
        return c.json(routes);
    });

    app.get("api/transit/stream", async (c) => {
        let id = 0;

        return streamSSE(c, async (stream) => {
            const updateHandler = async () => {
                const vehiclePositions = getVehiclePositions({}, [], [], {
                    db,
                });

                await stream.writeSSE({
                    data: JSON.stringify(vehiclePositions),
                    event: "vehiclePositions",
                    id: String(id++),
                });
            };

            on("rtupdate", updateHandler);
            updateHandler();
        });
    });
}

import {
    getRoutes,
    getShapesAsGeoJSON,
    getStopsAsGeoJSON,
    getVehiclePositions,
    getStops,
    getTrips,
    advancedQuery,
    JoinOptions,
    AdvancedQueryOptions,
} from "gtfs";
import { type Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, on } from "@/services/gtfs";

import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { reqQueryToAdvGTFSQuery, stripUndefines } from "@/utils/parse";

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
            const queryOptions: AdvancedQueryOptions = {
                query: reqQueryToAdvGTFSQuery(c.req.valid("query"), "trips"),
                fields: [
                    "trips.route_id",
                    "trips.service_id",
                    "trips.trip_id",
                    "trips.trip_headsign",
                    "trips.trip_short_name",
                    "trips.direction_id",
                    "trips.block_id",
                    "trips.shape_id",
                    "trips.wheelchair_accessible",
                    "trips.bikes_allowed",
                    "routes.route_short_name",
                    "routes.route_long_name",
                    "routes.route_desc",
                    "routes.continuous_pickup",
                    "routes.continuous_drop_off",
                    "routes.route_color",
                    "routes.route_type",
                    "vehicle_positions.bearing",
                    "vehicle_positions.latitude",
                    "vehicle_positions.longitude",
                    "vehicle_positions.speed",
                    "vehicle_positions.vehicle_id",
                    "vehicle_positions.timestamp",
                ],
                join: [
                    {
                        type: "INNER",
                        table: "routes",
                        on: "trips.route_id = routes.route_id",
                    },
                    {
                        type: "INNER",
                        table: "vehicle_positions",
                        on: "trips.trip_id = vehicle_positions.trip_id",
                    },
                ],
            };

            const trips = advancedQuery("trips", queryOptions);
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

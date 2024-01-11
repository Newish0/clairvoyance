import { shapesGeojsonApiDataSchema, stopsGeojsonApiDataSchema } from "@/schemas/zod/transit";

export async function fetchStops() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(new URL("./api/transit/geojson/stops", __GTFS_API_ENDPOINT__));
    const data = await res.json();
    return stopsGeojsonApiDataSchema.parse(data);
}

export async function fetchShapes() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(new URL("./api/transit/geojson/shapes", __GTFS_API_ENDPOINT__));
    const data = await res.json();
    return shapesGeojsonApiDataSchema.parse(data);
}

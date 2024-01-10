import { coordinateSchema, shapesApiDataSchema, stopsApiDataSchema } from "@/schemas/zod/transit";
import LiveData from "./LiveData";

export async function fetchStops() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(new URL("./api/transit/geojson/stops", __GTFS_API_ENDPOINT__));
    const data = await res.json();
    return stopsApiDataSchema.parse(data);
}

export async function fetchShapes() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(new URL("./api/transit/geojson/shapes", __GTFS_API_ENDPOINT__));
    const data = await res.json();
    return shapesApiDataSchema.parse(data);
}

export function getRealtimePosition() {
    return LiveData.getInstance(new URL("./api/transit/stream", __GTFS_API_ENDPOINT__));
}

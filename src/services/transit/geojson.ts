import { coordinateSchema, shapesApiDataSchema, stopsApiDataSchema } from "@/schemas/zod/transit";

export async function fetchStops() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch("./api/transit/geojson/stops");
    const data = await res.json();
    return stopsApiDataSchema.parse(data);
}

export async function fetchShapes() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch("./api/transit/geojson/shapes");
    const data = await res.json();
    return shapesApiDataSchema.parse(data);
}

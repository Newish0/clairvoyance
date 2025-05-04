import type { TripShapeResponse } from "./types";

const SHAPES_ENDPOINT = `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/trips/{{trip_id}}/shapes`;

export async function getShapes(tripId: string) {
    const url = new URL(SHAPES_ENDPOINT.replace("{{trip_id}}", tripId));

    const res = await fetch(url);
    const json: TripShapeResponse = await res.json();

    return json;
}

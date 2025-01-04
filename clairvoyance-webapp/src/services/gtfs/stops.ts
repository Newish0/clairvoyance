import type { TripStopResponse } from "./types";

const TRIP_STOP_TIMES_ENDPOINT = `${
    import.meta.env.PUBLIC_GTFS_API_ENDPOINT
}/trips/{{trip_id}}/stops`;

export async function getTripStops(tripId: string) {
    const url = new URL(TRIP_STOP_TIMES_ENDPOINT.replace("{{trip_id}}", tripId));

    const res = await fetch(url);
    const json: TripStopResponse[] = await res.json();

    return json;
}

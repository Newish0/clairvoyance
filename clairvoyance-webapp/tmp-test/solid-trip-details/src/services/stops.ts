import type { TripStopResponse } from "../types";

const TRIP_STOP_TIMES_ENDPOINT = `${
    import.meta.env.PUBLIC_GTFS_API_ENDPOINT
}/trips/{{trip_id}}/stops`;

export async function getTripStops(tripId: string): Promise<TripStopResponse[]> {
    const url = new URL(TRIP_STOP_TIMES_ENDPOINT.replace("{{trip_id}}", tripId));

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch stops for trip ${tripId}`);
        }
        const json: TripStopResponse[] = await res.json();
        return json;
    } catch (error) {
        throw new Error(
            `Error fetching trip stops: ${error instanceof Error ? error.message : "Unknown error"}`
        );
    }
}
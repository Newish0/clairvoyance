import type { TripDetailsResponse } from "./types";

const TRIP_DETAILS_ENDPOINT = `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/trips/{{trip_id}}`;

export async function getTripDetails(tripId: string) {
    const url = new URL(TRIP_DETAILS_ENDPOINT.replace("{{trip_id}}", tripId));

    try {
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Trip not found");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: TripDetailsResponse = await response.json();
        return data;
    } catch (error) {
        throw new Error(
            `Failed to fetch trip details: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }
}

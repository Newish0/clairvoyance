import type { RouteDetailsResponse } from "./types";

const ROUTE_DETAILS_ENDPOINT = `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/routes/{{route_id}}`;

export async function getRouteDetails(routeId: string) {
    const url = new URL(ROUTE_DETAILS_ENDPOINT.replace("{{route_id}}", routeId));

    try {
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Route not found");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: RouteDetailsResponse = await response.json();
        return data;
    } catch (error) {
        throw new Error(
            `Failed to fetch route details: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }
}

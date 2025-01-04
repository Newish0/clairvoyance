import type { RouteStopTimeResponse } from "./types";

const ROUTE_STOP_TIMES_ENDPOINT = `${
    import.meta.env.PUBLIC_GTFS_API_ENDPOINT
}/routes/{{route_id}}/stops/{{stop_id}}/times`;

interface GetRouteStopTimesParams {
    routeId: string;
    stopId: string;
    currentTime?: string;
    currentDate?: string;
}

export async function getRouteStopTimes({
    routeId,
    stopId,
    currentTime,
    currentDate,
}: GetRouteStopTimesParams) {
    const url = new URL(
        ROUTE_STOP_TIMES_ENDPOINT.replace("{{route_id}}", routeId).replace("{{stop_id}}", stopId)
    );

    if (currentTime) {
        url.searchParams.append("current_time", currentTime);
    }
    if (currentDate) {
        url.searchParams.append("current_date", currentDate);
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("No stop times found for this route and stop combination");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: RouteStopTimeResponse[] = await response.json();
        return data;
    } catch (error) {
        throw new Error(
            `Failed to fetch route stop times: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }
}
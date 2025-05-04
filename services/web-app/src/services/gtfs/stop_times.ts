import { format } from "date-fns";
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

    // Add default values for current time and date
    if(!currentTime) currentTime = format(new Date(), "HH:mm:ss");
    if(!currentDate) currentDate = format(new Date(), "yyyyMMdd");

    url.searchParams.append("current_time", currentTime);
    url.searchParams.append("current_date", currentDate);

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

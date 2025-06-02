import EndpointEnv from "~/constants/endpoint-env";
import { client } from "./client";

export const getStopNextTripsByStopId = async (stopId: string) => {
    // const response = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/stops/${stopId}/next-trips`);
    // return response.json();

    // TODO: Error handling
    const res = await client.stops({ stopId })["next-trips"].get();
    return res.data;
};

export const getStopsGeoJson = async (stopIds: string[]) => {
    // const queryParams = stopIds.map((stopId) => `stopIds=${stopId}`).join("&");
    // const response = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/stops/geojson?${queryParams}`);
    // return response.json();

    // TODO: Error handling
    const res = await client.stops.geojson.get({ query: { stopIds } });
    return res.data;
};

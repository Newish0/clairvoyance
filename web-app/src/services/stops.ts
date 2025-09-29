import { client } from "./client";

export const getStopNextTripsByStopId = async (stopId: string) => {
    // TODO: Error handling
    const res = await client.stops({ stopId })["next-trips"].get();
    return res.data;
};

export const getStopsGeoJson = async (stopIds: string[]) => {
    // TODO: Error handling
    const res = await client.stops.geojson.get({ query: { stopIds } });
    return res.data;
};

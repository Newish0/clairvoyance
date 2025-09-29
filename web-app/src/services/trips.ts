import { stringifyRecord } from "~/utils/urls";
import { client } from "./client";

type GetNearbyTripsParams = {
    latitude: number;
    longitude: number;
    radius: number;
};

export const getNearbyTrips = async (params: GetNearbyTripsParams) => {
    // TODO: Error handling
    const res = await client.trips.nearby.get({
        query: {
            lat: params.latitude,
            lng: params.longitude,
            radius: params.radius,
        },
    });

    return res.data;
};

export const getScheduledTripDetails = async (tripObjectId: string) => {
    // TODO: Error handling
    const res = await client.trips({ tripObjectId }).get();

    return res.data;
};

interface GetRouteNextTripsParams extends Record<string, any> {
    routeId: string;
    stopId?: string;
    directionId?: 0 | 1 | "0" | "1";
    startDatetime?: string | Date;
    endDatetime?: string | Date;
    limit?: number;
    excludedTripObjectIds?: string[];
}

interface GetRouteNextTripsAtStopParams extends GetRouteNextTripsParams {
    stopId: string;
}

export const getRouteNextTripsAtStop = async (
    params: GetRouteNextTripsAtStopParams
): Promise<any[]> => {
    // TODO: Error handling
    const res = await client.trips.next.get({ query: stringifyRecord(params) });

    return res.data;
};

export const getRouteNextTrips = async (params: GetRouteNextTripsParams) => {
    // TODO: Error handling
    const res = await client.trips.next.get({ query: stringifyRecord(params) });
    return res.data;
};

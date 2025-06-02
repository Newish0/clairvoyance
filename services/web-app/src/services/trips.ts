import EndpointEnv from "~/constants/endpoint-env";
import { recordToSearchParams, stringifyRecord } from "~/utils/urls";
import { client } from "./client";

type GetNearbyTripsParams = {
    latitude: number;
    longitude: number;
    radius: number;
};

export const getNearbyTrips = async (params: GetNearbyTripsParams) => {
    // const res = await fetch(
    //     `${EndpointEnv.GTFS_API_ENDPOINT}/trips/nearby?lat=${params.latitude}&lng=${params.longitude}&radius=${params.radius}`
    // );
    // const json = await res.json();
    // return json as Record<string, any[]>;

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
    // const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/trips/${tripObjectId}`);
    // const json = await res.json();
    // return json;

    // TODO: Error handling
    const res = await client.trips({ tripObjectId }).get();

    return res.data;
};

interface GetRouteNextTripsAtStopParams extends Record<string, any> {
    routeId: string;
    stopId: string;
    directionId?: 0 | 1 | "0" | "1";
    startDatetime?: string | Date;
    endDatetime?: string | Date;
    limit?: number;
    excludedTripObjectIds?: string[];
}

export const getRouteNextTripsAtStop = async (
    params: GetRouteNextTripsAtStopParams
): Promise<any[]> => {
    // const queryString = recordToSearchParams(params);
    // const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/trips/next?${queryString}`);
    // const json = await res.json();
    // return json;

    // TODO: Error handling
    const res = await client.trips.next.get({ query: stringifyRecord(params) });

    return res.data;
};

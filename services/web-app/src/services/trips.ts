import { recordToSearchParams } from "~/utils/urls";

type GetNearbyTripsParams = {
    latitude: number;
    longitude: number;
    radius: number;
};

export const getNearbyTrips = async (params: GetNearbyTripsParams) => {
    const res = await fetch(
        `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/trips/nearby?lat=${params.latitude}&lng=${
            params.longitude
        }&radius=${params.radius}`
    );
    const json = await res.json();
    return json as Record<string, any[]>;
};

export const getScheduledTripDetails = async (tripObjectId: string) => {
    const res = await fetch(`${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/trips/${tripObjectId}`);
    const json = await res.json();
    return json;
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
    const queryString = recordToSearchParams(params);
    const res = await fetch(
        `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/trips/next?${queryString}`
    );
    const json = await res.json();
    return json;
};

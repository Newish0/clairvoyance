import EndpointEnv from "~/constants/endpoint-env";
import { recordToSearchParams } from "~/utils/urls";

export interface GetAnyActiveAlertsByEntitySelector {
    agencyId?: string;
    routeType?: number;
    routeId?: string;
    directionId?: number | string;
    stopIds?: string[];
    stopId?: string;
    tripId?: string;
    tripStartDate?: string;
    tripStartTime?: string;
    tripRouteId?: string;
    tripDirectionId?: number;
}

export const getAnyActiveAlertsByEntitySelector = async (
    query: GetAnyActiveAlertsByEntitySelector
) => {
    const queryString = recordToSearchParams(query, true);

    const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/alerts/active?${queryString}`);
    const json = await res.json();
    return json;
};

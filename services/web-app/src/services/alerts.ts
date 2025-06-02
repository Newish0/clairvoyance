import EndpointEnv from "~/constants/endpoint-env";
import { recordToSearchParams, stringifyRecord } from "~/utils/urls";
import { client } from "./client";

export interface GetAnyActiveAlertsByEntitySelector extends Record<string, unknown> {
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
    // const queryString = recordToSearchParams(query, true);

    // const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/alerts/active?${queryString}`);
    // const json = await res.json();
    // return json;

    // TODO: Error handling
    const res = await client.alerts.active.get({
        query: stringifyRecord(query),
    });

    return res.data;
};

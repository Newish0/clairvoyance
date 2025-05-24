import EndpointEnv from "~/constants/endpoint-env";
import { recordToSearchParams } from "~/utils/urls";

type GetAnyActiveMatchingAlertsParams = {
    routeId?: string;
    directionId?: string;
    stopIds?: string[];
} & (
    | {}
    | {
          tripId: string;
          startDate: string;
          startTime: string;
      }
    | {
          routeId: string;
          directionId: string;
          startDate: string;
          startTime: string;
      }
);

export const getAnyMatchingActiveAlerts = async (query: GetAnyActiveMatchingAlertsParams) => {
    const queryString = recordToSearchParams(query, true);

    const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/alerts/active?${queryString}`);
    const json = await res.json();
    return json;
};

import type { Prettify } from "@/types/utils";
import { getDb } from "./mongo";

// type GetRouteAlertsParams = {
//     routeId: string;
//     directionId?: string;
// };

// export const getRouteAlerts = async ({ routeId, directionId }: GetRouteAlertsParams) => {
//     return [];
// };
type GetAnyActiveMatchingAlertsParams = Prettify<
    {
        routeId?: string;
        directionId?: number;
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
    )
>;

export const getAnyActiveMatchingAlerts = async (params: GetAnyActiveMatchingAlertsParams) => {
    const db = await getDb();
    const now = new Date();

    // Type guards to check if we have the required properties for each union case
    const hasTripInfo = "tripId" in params && "startDate" in params && "startTime" in params;
    const hasRouteDirectionInfo =
        "routeId" in params &&
        "directionId" in params &&
        "startDate" in params &&
        "startTime" in params;

    const query = {
        // The "active_periods" conditions
        active_periods: {
            $elemMatch: {
                $and: [
                    { $or: [{ end: null }, { end: { $gt: now } }] },
                    { $or: [{ start: null }, { start: { $lt: now } }] },
                ],
            },
        },

        // The "informed_entities" conditions
        ...(params.routeId ? { "informed_entities.route_id": params.routeId } : {}),
        ...(params.directionId ? { "informed_entities.direction_id": params.directionId } : {}),
        ...(params.stopIds && params.stopIds.length
            ? { "informed_entities.stop_id": { $in: params.stopIds } }
            : {}),
        ...(hasTripInfo
            ? {
                  $and: [
                      { "informed_entities.trip_id": params.tripId },
                      { "informed_entities.start_date": params.startDate },
                      { "informed_entities.start_time": params.startTime },
                  ],
              }
            : {}),
        ...(hasRouteDirectionInfo && !hasTripInfo // Avoid duplicate conditions
            ? {
                  $and: [
                      { "informed_entities.route_id": params.routeId },
                      { "informed_entities.direction_id": params.directionId },
                      { "informed_entities.start_date": params.startDate },
                      { "informed_entities.start_time": params.startTime },
                  ],
              }
            : {}),
    };

    const alerts = await db.collection("alerts").find(query).toArray();

    return alerts;
};

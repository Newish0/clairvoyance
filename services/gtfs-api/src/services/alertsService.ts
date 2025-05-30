import type { Prettify } from "@/types/utils";
import { getDb } from "./mongo";

const getActiveAlertSubQuery = (now: Date = new Date()) =>
    ({
        active_periods: {
            $elemMatch: {
                $and: [
                    { $or: [{ end: null }, { end: { $gt: now } }] },
                    { $or: [{ start: null }, { start: { $lt: now } }] },
                ],
            },
        },
    } as const);

// // type GetRouteAlertsParams = {
// //     routeId: string;
// //     directionId?: string;
// // };

// // export const getRouteAlerts = async ({ routeId, directionId }: GetRouteAlertsParams) => {
// //     return [];
// // };
// type GetAnyActiveMatchingAlertsParams = Prettify<
//     {
//         routeId?: string;
//         directionId?: number;
//         stopIds?: string[];
//     } & (
//         | {}
//         | {
//               tripId: string;
//               startDate: string;
//               startTime: string;
//           }
//         | {
//               routeId: string;
//               directionId: string;
//               startDate: string;
//               startTime: string;
//           }
//     )
// >;

// export const getAnyActiveMatchingAlerts = async (params: GetAnyActiveMatchingAlertsParams) => {
//     const db = await getDb();

//     // Type guards to check if we have the required properties for each union case
//     const hasTripInfo = "tripId" in params && "startDate" in params && "startTime" in params;
//     const hasRouteDirectionInfo =
//         "routeId" in params &&
//         "directionId" in params &&
//         "startDate" in params &&
//         "startTime" in params;

//     const query = {
//         // The "active_periods" conditions
//         ...getActiveAlertSubQuery(),

//         // The "informed_entities" conditions
//         ...(params.routeId ? { "informed_entities.route_id": params.routeId } : {}),
//         ...(params.directionId ? { "informed_entities.direction_id": params.directionId } : {}),
//         ...(params.stopIds && params.stopIds.length
//             ? { "informed_entities.stop_id": { $in: params.stopIds } }
//             : {}),
//         ...(hasTripInfo
//             ? {
//                   $and: [
//                       { "informed_entities.trip_id": params.tripId },
//                       { "informed_entities.start_date": params.startDate },
//                       { "informed_entities.start_time": params.startTime },
//                   ],
//               }
//             : {}),
//         ...(hasRouteDirectionInfo && !hasTripInfo // Avoid duplicate conditions
//             ? {
//                   $and: [
//                       { "informed_entities.route_id": params.routeId },
//                       { "informed_entities.direction_id": params.directionId },
//                       { "informed_entities.start_date": params.startDate },
//                       { "informed_entities.start_time": params.startTime },
//                   ],
//               }
//             : {}),
//     };

//     const alerts = await db.collection("alerts").find(query).toArray();

//     return alerts;
// };

// type GetTripAlertParams =
//     | {
//           tripId: string;
//           startDate: string;
//           startTime: string;
//       }
//     | {
//           routeId: string;
//           directionId: string;
//           startDate: string;
//           startTime: string;
//       };

// export const getTripAlert = async (params: GetTripAlertParams) => {
//     const db = await getDb();

//     const hasTripInfo = "tripId" in params && "startDate" in params && "startTime" in params;

//     const queryByTripId = hasTripInfo
//         ? {
//               "informed_entities.trip_id": params.tripId,
//               "informed_entities.start_date": params.startDate,
//               "informed_entities.start_time": params.startTime,
//           }
//         : {
//               "informed_entities.route_id": params.routeId,
//               "informed_entities.direction_id": params.directionId,
//               "informed_entities.start_date": params.startDate,
//               "informed_entities.start_time": params.startTime,
//           };

//     const alerts = await db
//         .collection("alerts")
//         .find({
//             ...getActiveAlertSubQuery(),
//             ...queryByTripId,
//         })
//         .toArray();
//     return alerts;
// };

// type GetRouteAlertsParams = {
//     routeId: string;
//     directionId?: string;
// };

// export const getRouteAlerts = async ({ routeId, directionId }: GetRouteAlertsParams) => {
//     const db = await getDb();
//     const alerts = await db
//         .collection("alerts")
//         .find({
//             ...getActiveAlertSubQuery(),

//             "informed_entities.direction_id": {

//             }
//             "informed_entities.route_id": routeId,
//         })
//         .toArray();
//     return alerts;
// };

interface TripDescriptor {
    tripId?: string;
    startTime?: string; // HH:MM:SS
    startDate?: string; // YYYYMMDD
    routeId?: string;
    directionId?: number; // 0 or 1
}

// This is our input "target" and also the structure within informed_entities
export interface GTFSEntitySelector {
    agencyId?: string | null;
    routeId?: string | null;
    routeType?: number | null;
    trip?: TripDescriptor | null;
    stopId?: string | null;
    directionId?: number | null; // Top-level direction_id

    /** Match entity that has one of these stop ids. Non-standard GTFS field */
    stopIds?: string[];
}

/**
 * Create a query toMongoDB that match the given target entity selector.
 * An alert matches if any of its `informed_entities` satisfy all conditions
 * specified in the `targetSelector`.
 *
 * @param targetSelector A partial GTFSEntitySelector representing the entity to find alerts for.
 *                       At least one field should be provided.
 * @returns A query to MongoDB
 */
export function getQueryForAlertsByEntitySelector(targetSelector: Partial<GTFSEntitySelector>) {
    const elemMatchConditions: Record<string, any> = {};
    let hasConditions = false;

    if (targetSelector.agencyId !== undefined) {
        elemMatchConditions.agency_id = targetSelector.agencyId;
        hasConditions = true;
    }
    if (targetSelector.routeId !== undefined) {
        elemMatchConditions.route_id = targetSelector.routeId;
        hasConditions = true;
    }
    if (targetSelector.routeType !== undefined) {
        elemMatchConditions.route_type = targetSelector.routeType;
        hasConditions = true;
    }
    if (targetSelector.stopId !== undefined) {
        elemMatchConditions.stop_id = targetSelector.stopId;
        hasConditions = true;
    }

    // Top-level direction_id (specific to a route, not necessarily a full trip)
    if (targetSelector.directionId !== undefined) {
        // As per GTFS-RT: "If provided the route_id must also be provided."
        // We'll assume the caller respects this or the query might yield unexpected results
        // if `route_id` isn't also part of the targetSelector or the stored informed_entity.
        elemMatchConditions.direction_id = targetSelector.directionId;
        hasConditions = true;
    }

    // Match entity that has one of the given stop ids.
    if (targetSelector.stopIds && targetSelector.stopIds.length) {
        elemMatchConditions.stop_id = { $in: targetSelector.stopIds };
        hasConditions = true;
    }

    if (targetSelector.trip) {
        const tripConditions = targetSelector.trip;
        if (tripConditions.tripId !== undefined) {
            elemMatchConditions["trip.trip_id"] = tripConditions.tripId;
            hasConditions = true;
        }
        if (tripConditions.routeId !== undefined) {
            elemMatchConditions["trip.route_id"] = tripConditions.routeId;
            hasConditions = true;
        }
        if (tripConditions.startTime !== undefined) {
            elemMatchConditions["trip.start_time"] = tripConditions.startTime;
            hasConditions = true;
        }
        if (tripConditions.startDate !== undefined) {
            elemMatchConditions["trip.start_date"] = tripConditions.startDate;
            hasConditions = true;
        }
        if (tripConditions.directionId !== undefined) {
            elemMatchConditions["trip.direction_id"] = tripConditions.directionId;
            hasConditions = true;
        }
    }

    if (!hasConditions) {
        throw new Error(
            "findAlertsByEntitySelector called with an empty targetSelector. This will likely not match any specific entities."
        );
    }

    const query = {
        informed_entities: {
            $elemMatch: elemMatchConditions,
        },
    };

    return query;
}

const nullIfFieldPresent = <T>(obj: T, field: keyof T, asField?: keyof T) =>
    obj[field] ? { [asField || field]: null } : {};

export const findAnyActiveAlertsByEntitySelector = async (
    selector: Partial<Omit<GTFSEntitySelector, "stopId">>
) => {
    const db = await getDb();
    const alertCollection = db.collection("alerts");

    const agencyAlertQuery = selector.agencyId
        ? getQueryForAlertsByEntitySelector({
              agencyId: selector.agencyId,
              ...nullIfFieldPresent(selector, "routeId"),
              ...nullIfFieldPresent(selector, "directionId"),
              ...nullIfFieldPresent(selector, "trip"),
              ...nullIfFieldPresent<GTFSEntitySelector>(selector, "stopIds", "stopId"),
          })
        : null;

    const routeAlertQuery = selector.routeId
        ? getQueryForAlertsByEntitySelector({
              routeId: selector.routeId,
              ...nullIfFieldPresent(selector, "directionId"),
              ...nullIfFieldPresent(selector, "trip"),
              ...nullIfFieldPresent<GTFSEntitySelector>(selector, "stopIds", "stopId"),
          })
        : null;

    const routeDirectionAlertQuery =
        selector.routeId && (selector.directionId !== undefined || selector.directionId !== null)
            ? getQueryForAlertsByEntitySelector({
                  routeId: selector.routeId,
                  directionId: selector.directionId,
                  ...nullIfFieldPresent(selector, "trip"),
                  ...nullIfFieldPresent<GTFSEntitySelector>(selector, "stopIds", "stopId"),
              })
            : null;

    const tripAlertQuery = selector.trip
        ? getQueryForAlertsByEntitySelector({
              // A trip is more specific than a route with direction so we don't need to specify them
              trip: selector.trip,
              ...nullIfFieldPresent<GTFSEntitySelector>(selector, "stopIds", "stopId"),
          })
        : null;

    const stopsAlertQuery = selector.stopIds
        ? getQueryForAlertsByEntitySelector({
              stopIds: selector.stopIds,
              ...nullIfFieldPresent(selector, "routeId"),
              ...nullIfFieldPresent(selector, "directionId"),
              ...nullIfFieldPresent(selector, "trip"),
          })
        : null;

    const stopRoutesAlertQuery =
        selector.stopIds?.length && selector.routeId
            ? getQueryForAlertsByEntitySelector({
                  stopIds: selector.stopIds,
                  routeId: selector.routeId,
                  ...nullIfFieldPresent(selector, "directionId"),
                  ...nullIfFieldPresent(selector, "trip"),
              })
            : null;

    const stopRoutesDirectionAlertQuery =
        selector.stopIds?.length &&
        selector.routeId &&
        (selector.directionId !== undefined || selector.directionId !== null)
            ? getQueryForAlertsByEntitySelector({
                  stopIds: selector.stopIds,
                  routeId: selector.routeId,
                  directionId: selector.directionId,
                  ...nullIfFieldPresent(selector, "trip"),
              })
            : null;

    const stopTripAlertQuery =
        selector.stopIds?.length && selector.trip
            ? getQueryForAlertsByEntitySelector({
                  stopIds: selector.stopIds,

                  // A trip is more specific than a route with direction so we don't need to specify them
                  trip: selector.trip,
              })
            : null;

    // TODO: Add route type query

    const query = {
        ...getActiveAlertSubQuery(),
        $or: [
            agencyAlertQuery,
            routeAlertQuery,
            routeDirectionAlertQuery,
            tripAlertQuery,
            stopsAlertQuery,
            stopRoutesAlertQuery,
            stopRoutesDirectionAlertQuery,
            stopTripAlertQuery,
        ].filter((q) => q !== null),
    };

    console.log("MongoDB query:", JSON.stringify(query, null, 2));

    return await alertCollection.find(query).toArray();
};

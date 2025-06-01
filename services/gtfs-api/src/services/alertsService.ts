import type { Prettify } from "@/types/utils";
import { getDb, type OmitId } from "./mongo";
import type { Alert } from "gtfs-db-types";
import type { WithId } from "mongodb";
import { StopNameService } from "./stopNameService";

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

    const alerts = await alertCollection.find(query).toArray();

    return alerts;
};

type LookupResult = {
    stop_names?: Record<string, string | null>;
};

export const createLookupForAlerts = async (alerts: WithId<OmitId<Alert>>[]): Promise<LookupResult> => {
    const db = await getDb();
    const stopNameSvc = StopNameService.getInstance(db);
    const lookup: LookupResult = {
        stop_names: {},
    };

    for (const alert of alerts) {
        if (alert.informed_entities?.length) {
            for (const entity of alert.informed_entities) {
                if (entity.stop_id) {
                    const stopName = await stopNameSvc.getStopNameByStopId(entity.stop_id);
                    lookup.stop_names![entity.stop_id] = stopName;
                }
            }
        }
    }

    return lookup;
};

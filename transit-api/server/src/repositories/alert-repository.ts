import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";
import { Direction, RouteType } from "../../../../gtfs-processor/shared/gtfs-db-types";

type AffectedEntitySelector = {
    agencyId?: string;
    routeId?: string;
    routeType?: RouteType;
    directionId?: Direction;
    stopId?: string | string[];
    tripInstanceId?: string;
};

export class AlertRepository extends DataRepository {
    protected collectionName = "alerts" as const;

    public async findAffectedActiveAlerts(query: AffectedEntitySelector, maxAgeSeconds = 300) {
        const now = new Date();
        const minDate = new Date(Date.now() - maxAgeSeconds * 1000);

        // Only include constraint if provided.(Otherwise allow it to be any value)
        const queryWithDbFields = {
            ...(query.agencyId ? { agency_id: { $in: [query.agencyId, null, ""] } } : {}),
            ...(query.routeId ? { route_id: { $in: [query.routeId, null, ""] } } : {}),
            ...(query.routeType ? { route_type: { $in: [query.routeType, null, ""] } } : {}),
            ...(query.directionId ? { direction_id: { $in: [query.directionId, null, ""] } } : {}),
            ...(query.stopId
                ? {
                      stop_id: {
                          $in: [
                              ...(Array.isArray(query.stopId) ? query.stopId : [query.stopId]),
                              null,
                              "",
                          ],
                      },
                  }
                : {}),
            ...(query.tripInstanceId
                ? { trip_instance: { $in: [query.tripInstanceId, null, ""] } }
                : {}),
        };

        const fullQuery = {
            $and: [
                {
                    $or: [
                        { "active_periods.start": { $lte: now } },
                        { "active_periods.start": { $exists: false } },
                        { "active_periods.start": null },
                    ],
                },
                {
                    $or: [
                        { "active_periods.end": { $gte: now } },
                        { "active_periods.end": { $exists: false } },
                        { "active_periods.end": null },
                    ],
                },
            ],
            informed_entities: {
                $elemMatch: queryWithDbFields,
            },
            last_seen: { $gte: minDate },
        };

        const alerts = await this.db.collection(this.collectionName).find(fullQuery).toArray();

        return alerts;
    }
}

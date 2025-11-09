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
            ...(query.agencyId ? { agency_id: query.agencyId } : {}),
            ...(query.routeId ? { route_id: query.routeId } : {}),
            ...(query.routeType ? { route_type: query.routeType } : {}),
            ...(query.directionId ? { direction_id: query.directionId } : {}),
            ...(query.stopId ? { stop_id: query.stopId } : {}),
            ...(query.tripInstanceId ? { trip_instance: query.tripInstanceId } : {}),
        };

        const dbQueries = AlertRepository.generateCombinations(
            queryWithDbFields,
            {
                $in: [null, ""],
            },
            (value) => {
                if (Array.isArray(value)) {
                    return { $in: value };
                } else {
                    return value;
                }
            }
        );

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
                $elemMatch: { $or: dbQueries },
            },
            last_seen: { $gte: minDate },
        };

        console.log("fullQuery", JSON.stringify(fullQuery, null, 0));

        const alerts = await this.db.collection(this.collectionName).find(fullQuery).toArray();

        return alerts;
    }
    /**
     * @example
     * Given {a: 1, b: 2, c: 3} with emptyValue = null, it outputs:
     * [
     *   { "a": 1,    "b": null, "c": null },
     *   { "a": 1,    "b": 2,    "c": null },
     *   { "a": 1,    "b": 2,    "c": 3    },
     *   { "a": null, "b": 2,    "c": null },
     *   { "a": null, "b": 2,    "c": 3    },
     *   { "a": null, "b": null, "c": 3    }
     * ]
     */
    private static generateCombinations<T extends Record<string, any>, U>(
        fieldValues: T,
        emptyValue: U,
        mapFn: (value: any) => any = (value) => value
    ) {
        const keys = Object.keys(fieldValues);
        const combinations: Array<Record<string, any>> = [];

        // Generate all non-empty subsets (exclude the empty set)
        const totalCombinations = (1 << keys.length) - 1; // 2^n - 1

        for (let mask = 1; mask <= totalCombinations; mask++) {
            const combination: Record<string, any> = {};

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                // Check if the i-th bit is set in the mask
                if (mask & (1 << i)) {
                    combination[key] = mapFn(fieldValues[key]);
                } else {
                    combination[key] = emptyValue;
                }
            }

            combinations.push(combination);
        }

        return combinations;
    }
}

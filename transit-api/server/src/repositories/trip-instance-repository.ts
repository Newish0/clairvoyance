import { FIVE_MIN_IN_MS, getHoursInFuture } from "@/utils/datetime";
import { DataRepository } from "./data-repository";
import { Direction, TripInstanceState } from "@root/gtfs-processor/shared/gtfs-db-types";
import { isFpEqual } from "@/utils/compare";

import type {
    Route,
    StopTimeInstance,
    Trip,
    VehiclePosition,
} from "@root/gtfs-processor/shared/gtfs-db-types";
import { WithId } from "mongodb";

type ScoreWeight = {
    distance: number;
    time: number;
};

type NearbyTrip = {
    _id: string;
    trip_id: string;
    agency_id: string;
    start_date: string;
    start_time: string;
    direction_id: string;
    route_id: string;
    shape_object_id: string;
    start_datetime: string;
    state: string;
    stop_times_updated_at: string;
    vehicle: object;
    trip: WithId<Trip>;
    route: WithId<Route>;
    stop_time: WithId<StopTimeInstance> & { stop_name: string; distance: number };
};

//    {
//     _id: "68de1eb2caf23f22f28155bb",
//     agency_id: "BCT-48",
//     trip_id: "11001518:10045676:10049350",
//     start_time: "23:55:00",
//     start_date: "20251001",
//     direction_id: "INBOUND",
//     positions: [],
//     route_id: "26-VIC",
//     shape: {
//       $ref: "shapes",
//       $id: "68d74c8c9e2567651578991f",
//     },
//     start_datetime: "2025-10-02T06:55:00.000Z",
//     state: "DIRTY",
//     stop_times: {
//       stop_id: "100966",
//       stop_headsign: "",
//       pickup_type: "REGULAR",
//       drop_off_type: "REGULAR",
//       timepoint: "APPROXIMATE",
//       shape_dist_traveled: 3742,
//       arrival_datetime: "2025-10-02T14:01:00.000Z",
//       departure_datetime: "2025-10-02T14:01:00.000Z",
//       predicted_arrival_datetime: "2025-10-02T07:01:00.000Z",
//       predicted_departure_datetime: "2025-10-02T07:01:00.000Z",
//       predicted_arrival_uncertainty: 30,
//       predicted_departure_uncertainty: 30,
//       schedule_relationship: "SCHEDULED",
//     },
//     stop_times_updated_at: "2025-10-01T23:41:52.671Z",
//     vehicle: null,
//     trip_details: {
//       _id: "68d74c899e256765157829c8",
//       trip_id: "11001518:10045676:10049350",
//       agency_id: "BCT-48",
//       block_id: "10049350",
//       direction_id: "INBOUND",
//       id: null,
//       route_id: "26-VIC",
//       service_id: "4439",
//       shape_id: "40061",
//       trip_headsign: "Dockyard via McKenzie/Tillicum",
//       trip_short_name: null,
//     },
//     route_details: {
//       _id: "68d74c849e25676515772394",
//       agency_id: "BCT-48",
//       route_id: "26-VIC",
//       route_color: "B06E0E",
//       route_long_name: "UVic / Dockyard",
//       route_short_name: "26",
//       route_text_color: "FFFFFF",
//       route_type: "BUS",
//     },
//   }

export class TripInstancesRepository extends DataRepository {
    protected collectionName = "trip_instances";

    /**
     * Fetches a list of scheduled trips that depart from nearby stops.
     *
     * WARNING: For performance reasons, this function by default only looks for scheduled
     *          trips that depart within the next 36 hours and trips that have departed within
     *          the last 12 hours. It may not find all trips that depart from nearby stops by default.
     *
     * @param lat The latitude of the center point to search.
     * @param lng The longitude of the center point to search.
     * @param radius The radius of the area to search for nearby stops.
     * @param maxDate The maximum start datetime to include in the results. Defaults to 48 hours from the current time.
     * @param minDate The minimum start datetime to include in the results. Defaults to 12 hours ago.
     * @param realtimeMaxAge The maximum age of the position updates to include in the results. Defaults to 5 minutes.
     * @param scoreWeight The weight of each score component in the final score. MUST SUM TO 1.
     * @returns A list of scheduled trips with stop names.
     */
    public async fetchNearbyTrips(
        lat: number,
        lng: number,
        radius: number,
        maxDate = getHoursInFuture(36),
        minDate = getHoursInFuture(-12),
        realtimeMaxAge = FIVE_MIN_IN_MS,
        scoreWeight: ScoreWeight = { distance: 0.6, time: 0.4 }
    ) {
        // Validate score weight
        if (Object.values(scoreWeight).reduce((a, b) => a + b, 0) !== 1) {
            throw new Error("Score weight must sum to 1");
        }

        const realtimeThreshold = new Date(Date.now() - realtimeMaxAge);

        // --- Step 1: Find nearby stops ---
        let stepStartTime = performance.now();
        const nearbyStopsCursor = this.db.collection("stops").aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    maxDistance: radius,
                    spherical: true,
                    query: {},
                },
            },
            {
                $project: {
                    _id: 0,
                    stop_id: 1,
                    distance: 1,
                    stop_name: 1,
                },
            },
            {
                $sort: { distance: 1 },
            },
        ]);
        const nearbyStops = await nearbyStopsCursor.toArray();
        console.log(`Step 1: Find nearby stops - ${performance.now() - stepStartTime} ms`);

        if (nearbyStops.length === 0) {
            return null;
        }

        // --- Step 2: Prepare ---
        stepStartTime = performance.now();
        const stopIds = nearbyStops.map((stop) => stop.stop_id);
        const stopInfoMap = new Map<string, { distance: number; name?: string }>(
            nearbyStops.map((s) => [s.stop_id, { distance: s.distance, name: s.stop_name }])
        );
        console.log(`Step 2: Prepare - ${performance.now() - stepStartTime} ms`);

        // --- Step 3: Find relevant upcoming scheduled stop times ---
        stepStartTime = performance.now();
        const now = new Date();
        const relevantTrips = this.db.collection("trip_instances").aggregate([
            {
                $match: {
                    "stop_times.stop_id": { $in: stopIds },
                    start_datetime: { $lt: maxDate, $gte: minDate }, // Limit for performance
                    state: { $ne: TripInstanceState.REMOVED },
                },
            },
            { $unwind: "$stop_times" },

            // TODO: Check if this extra $match is necessary
            {
                $match: {
                    "stop_times.stop_id": { $in: stopIds },
                },
            },

            // Populate the last known position for each trip
            {
                $addFields: {
                    latest_position_id: { $arrayElemAt: ["$positions.$id", -1] },
                },
            },
            {
                $lookup: {
                    from: "vehicle_positions",
                    localField: "latest_position_id",
                    foreignField: "_id",
                    as: "latest_position",
                },
            },

            // Lookup trip details
            {
                $lookup: {
                    from: "trips",
                    localField: "trip.$id",
                    foreignField: "_id",
                    as: "trip_details",
                },
            },

            // Lookup route details
            {
                $lookup: {
                    from: "routes",
                    localField: "route.$id",
                    foreignField: "_id",
                    as: "route_details",
                },
            },

            // Flatten the lookup arrays
            {
                $addFields: {
                    latest_position: { $arrayElemAt: ["$latest_position", 0] },
                    trip_details: { $arrayElemAt: ["$trip_details", 0] },
                    route_details: { $arrayElemAt: ["$route_details", 0] },
                },
            },

            // --- $match stage ---
            {
                $match: {
                    $or: [
                        // Static schedule check: departure time is in the future
                        { "stop_times.departure_datetime": { $gt: now } },
                        // Realtime check:
                        {
                            $and: [
                                // Realtime data exists and is fresh
                                { "latest_position.current_stop_sequence": { $ne: null } },
                                { stop_times_updated_at: { $gte: realtimeThreshold } },
                                // Realtime indicates trip hasn't passed the stop yet OR is currently at the stop
                                // Use $expr for field-to-field comparisons within $match
                                {
                                    $expr: {
                                        // <<< Wrap the field comparison logic in $expr >>>
                                        $or: [
                                            // Stop sequence is greater than current sequence
                                            {
                                                $gt: [
                                                    "$stop_times.stop_sequence",
                                                    "$latest_position.current_stop_sequence",
                                                ],
                                            },
                                            // Stop sequence equals current sequence (vehicle is at/approaching this stop)
                                            {
                                                $and: [
                                                    {
                                                        $eq: [
                                                            "$stop_times.stop_sequence",
                                                            "$latest_position.current_stop_sequence",
                                                        ],
                                                    },
                                                    // Comparison to a literal (1) also works inside $expr
                                                    {
                                                        $gte: [
                                                            "$latest_position.current_stop_sequence",
                                                            1,
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                }, // <<< End of $expr wrapper >>>
                            ],
                        },
                    ],
                },
            },
            {
                $sort: {
                    "stop_times.departure_datetime": 1,
                },
            },
            {
                $project: {
                    _id: 1,
                    agency_id: 1,
                    trip_id: 1,
                    start_date: 1,
                    start_time: 1,
                    route_id: 1,
                    direction_id: 1,
                    state: 1,
                    start_datetime: 1,
                    stop_time: "$stop_times",
                    stop_times_updated_at: 1,
                    trip: "$trip_details",
                    route: "$route_details",
                    shape_object_id: "$shape.$id",
                    vehicle: 1,
                    latest_position: 1,
                },
            },
        ]);

        console.log(
            `Step 3: Find relevant upcoming scheduled stop times - ${
                performance.now() - stepStartTime
            } ms`
        );

        // --- Step 4: Process results ---
        stepStartTime = performance.now();

        const tripsWithStopInfo: any[] = await relevantTrips
            .map((item) => {
                const stopId = item.stop_time.stop_id;
                const { distance, name: stopName } = stopInfoMap.get(stopId)!;
                return {
                    ...item,
                    stop_time: {
                        ...item.stop_time,
                        stop_name: stopName,
                        distance: distance,
                    },
                };
            })
            .toArray();

        console.log(`Step 4: Process results - ${performance.now() - stepStartTime} ms`);

        // --- Step 5: Sort results ---
        stepStartTime = performance.now();

        const nowTime = now.getTime();
        const maxDistance = Math.max(...tripsWithStopInfo.map((item) => item.stop_time.distance));
        const maxTimeDiff = Math.max(
            ...tripsWithStopInfo.map((item) =>
                Math.abs(item.stop_time.departure_datetime.getTime() - nowTime)
            )
        );

        tripsWithStopInfo.sort((a, b) => {
            const aNormDistance = a.stop_time.distance / maxDistance;
            const bNormDistance = b.stop_time.distance / maxDistance;

            const aTime = a.stop_time.departure_datetime.getTime();
            const bTime = b.stop_time.departure_datetime.getTime();
            const aNormTimeDiff = Math.abs(aTime - nowTime) / maxTimeDiff;
            const bNormTimeDiff = Math.abs(bTime - nowTime) / maxTimeDiff;

            // Weighted composite score
            const distanceWeight = scoreWeight.distance;
            const timeWeight = scoreWeight.time;

            const aScore = aNormTimeDiff * distanceWeight + aNormDistance * timeWeight;
            const bScore = bNormTimeDiff * distanceWeight + bNormDistance * timeWeight;

            return aScore - bScore;
        });

        console.log(`Step 5: Sort results - ${performance.now() - stepStartTime} ms`);

        // --- Step 6: Format final output ---
        stepStartTime = performance.now();

        const groupedByRoute: Record<string, Record<string, NearbyTrip[]>> = {};
        for (const tripInstance of tripsWithStopInfo) {
            const routeId = tripInstance.route_id;
            const directionId = tripInstance.direction_id || Direction.INBOUND;
            groupedByRoute[routeId] = groupedByRoute[routeId] || {};
            groupedByRoute[routeId][directionId] = groupedByRoute[routeId][directionId] || [];
            if (groupedByRoute[routeId][directionId].length < 3) {
                groupedByRoute[routeId][directionId].push(tripInstance);
            }
        }
        console.log(`Step 6: Format final output - ${performance.now() - stepStartTime} ms`);

        return groupedByRoute;
    }
}

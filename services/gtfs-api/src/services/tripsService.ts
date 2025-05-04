import { getDb } from "@/services/mongo";
import { ObjectId } from "mongodb";
import { StopNameService } from "./stopNameService";

export const fetchScheduledTripDetails = async (tripObjectId: string) => {
    const db = await getDb();
    const stopNameService = StopNameService.getInstance(db);

    const objId = (() => {
        try {
            return new ObjectId(tripObjectId);
        } catch {
            throw new Error("Invalid tripObjectId");
        }
    })();

    const trip = await db.collection("scheduled_trips").findOne({ _id: objId });

    // Add stop name to trip.scheduled_stop_times
    if (trip) {
        await Promise.all(
            trip.scheduled_stop_times.map(async (stopTime: any) => {
                stopTime.stop_name = await stopNameService.getStopNameByStopId(stopTime.stop_id);
            })
        );
    }

    return trip;
};

interface ScheduledTripsParams {
    routeId: string;
    directionId: string;
    stopId: string;
    startDatetime?: string;
    endDatetime?: string;
}

export const fetchScheduledTrips = async (params: ScheduledTripsParams) => {
    const db = await getDb();

    const scheduledTrips = await db
        .collection("scheduled_trips")
        .aggregate([
            {
                // First filter to only include trips that have our stop of interest
                // and match the route and direction
                // and match the start and end datetimes search range if provided
                $match: {
                    "scheduled_stop_times.stop_id": params.stopId,
                    route_id: params.routeId,
                    direction_id: parseInt(params.directionId),
                    ...(params.startDatetime && {
                        start_datetime: { $gte: new Date(params.startDatetime) },
                    }),
                    ...(params.endDatetime && {
                        start_datetime: { $lte: new Date(params.endDatetime) },
                    }),
                },
            },
            {
                $addFields: {
                    relevantStopTimes: {
                        $filter: {
                            input: "$scheduled_stop_times",
                            as: "stopTime",
                            cond: {
                                $and: [
                                    // Filter to only include the stop times for our stop of interest
                                    { $eq: ["$$stopTime.stop_id", params.stopId] },
                                    {
                                        // Use realtime (if it exists) or use static schedule.
                                        // Include stops with arrival times in the future,
                                        // If the trip past our stop before the scheduled time, we
                                        // still include it as user needs to know the trip arrived early.
                                        $or: [
                                            {
                                                $gt: ["$$stopTime.arrival_datetime", new Date()],
                                            },
                                            {
                                                $cond: {
                                                    if: {
                                                        $and: [
                                                            // Check if current_stop_sequence exists and is not null
                                                            {
                                                                $ne: [
                                                                    {
                                                                        $type: "$current_stop_sequence",
                                                                    },
                                                                    "missing",
                                                                ],
                                                            },
                                                            {
                                                                $ne: [
                                                                    "$current_stop_sequence",
                                                                    null,
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                    then: {
                                                        $and: [
                                                            // Ensure realtime data is NOT stale (AKA last realtime update was within 5 minutes)
                                                            {
                                                                $gte: [
                                                                    "$last_realtime_update_timestamp",
                                                                    (() => {
                                                                        const dt = new Date();
                                                                        dt.setMinutes(
                                                                            dt.getMinutes() - 5
                                                                        );
                                                                        return dt;
                                                                    })(),
                                                                ],
                                                            },
                                                            {
                                                                $or: [
                                                                    {
                                                                        // The vehicle has not arrive our stop of interest
                                                                        $gt: [
                                                                            "$$stopTime.stop_sequence",
                                                                            "$current_stop_sequence",
                                                                        ],
                                                                    },
                                                                    {
                                                                        // Allow if vehicle is currently stopped at or is en route
                                                                        // to our stop of interest (which in this case is current_stop_sequence).
                                                                        $and: [
                                                                            {
                                                                                $eq: [
                                                                                    "$$stopTime.stop_sequence",
                                                                                    "$current_stop_sequence",
                                                                                ],
                                                                            },
                                                                            {
                                                                                $gte: [
                                                                                    "$current_stop_sequence",
                                                                                    1,
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                    else: false, // Use static schedule if realtime data does not exist
                                                },
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                },
            },
            {
                // Filter out trips that don't have any relevant stop times after our filtering
                $match: {
                    relevantStopTimes: { $ne: [] },
                },
            },
            {
                // Sort by start_datetime in ascending order
                $sort: { start_datetime: 1 },
            },
            {
                // Limit to 100 results
                $limit: 100,
            },
        ])
        .toArray();

    // // Add stop names to each trip
    // const scheduledTripsWithStopNames = await Promise.all(
    //     scheduledTrips.map(async (trip) => {
    //         const stopNames = await Promise.all(
    //             trip.relevantStopTimes.map(async (stopTime) => {
    //                 const stopName = await stopNameService.getStopNameByStopId(stopTime.stop_id);
    //                 return { ...stopTime, stop_name: stopName };
    //             })
    //         );
    //         return { ...trip, relevantStopTimes: stopNames };
    //     })
    // )

    return scheduledTrips;
};

export const fetchNearbyTrips = async (lat: number, lng: number, radius: number) => {
    const db = await getDb();

    // --- Step 1: Find nearby stops ---
    const stopsCollection = db.collection("stops");
    const nearbyStopsCursor = stopsCollection.aggregate([
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

    if (nearbyStops.length === 0) {
        return {};
    }

    // --- Step 2: Prepare ---
    const stopIds = nearbyStops.map((stop) => stop.stop_id);
    const stopInfoMap = new Map<string, { distance: number; name?: string }>(
        nearbyStops.map((s) => [s.stop_id, { distance: s.distance, name: s.stop_name }])
    );

    // --- Step 3: Find relevant upcoming scheduled stop times ---
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const scheduledTripsCollection = db.collection("scheduled_trips");

    const relevantStopTimesCursor = scheduledTripsCollection.aggregate([
        {
            $match: {
                "scheduled_stop_times.stop_id": { $in: stopIds },
            },
        },
        { $unwind: "$scheduled_stop_times" },
        {
            $match: {
                "scheduled_stop_times.stop_id": { $in: stopIds },
            },
        },
        // --- $match stage ---
        {
            $match: {
                $or: [
                    // Static schedule check: arrival time is in the future
                    { "scheduled_stop_times.arrival_datetime": { $gt: now } },
                    // Realtime check:
                    {
                        $and: [
                            // Realtime data exists and is fresh
                            { current_stop_sequence: { $ne: null } },
                            { last_realtime_update_timestamp: { $gte: fiveMinutesAgo } },
                            // Realtime indicates trip hasn't passed the stop yet OR is currently at the stop
                            // Use $expr for field-to-field comparisons within $match
                            {
                                $expr: {
                                    // <<< Wrap the field comparison logic in $expr >>>
                                    $or: [
                                        // Stop sequence is greater than current sequence
                                        {
                                            $gt: [
                                                "$scheduled_stop_times.stop_sequence",
                                                "$current_stop_sequence",
                                            ],
                                        },
                                        // Stop sequence equals current sequence (vehicle is at/approaching this stop)
                                        {
                                            $and: [
                                                {
                                                    $eq: [
                                                        "$scheduled_stop_times.stop_sequence",
                                                        "$current_stop_sequence",
                                                    ],
                                                },
                                                // Comparison to a literal (1) also works inside $expr
                                                { $gte: ["$current_stop_sequence", 1] },
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
                "scheduled_stop_times.arrival_datetime": 1,
            },
        },
        {
            $project: {
                _id: 1,
                trip_id: 1,
                route_id: 1,
                direction_id: 1,
                start_datetime: 1,
                route_short_name: 1,
                trip_headsign: 1,
                stop_time: "$scheduled_stop_times",
                realtime_stop_updates: {
                    // Renamed for clarity
                    $getField: {
                        // Important: Ensure the type matches the object keys. If keys are strings, convert:
                        field: { $toString: "$scheduled_stop_times.stop_sequence" },
                        // If keys are numbers (less common for object keys), just use:
                        // field: "$scheduled_stop_times.stop_sequence",
                        input: "$realtime_stop_updates", // The object to look inside
                    },
                },
                current_status: 1,
                current_stop_sequence: 1,
                vehicle: 1,
                last_realtime_update_timestamp: 1,
            },
        },
    ]);

    const relevantStopTimes = await relevantStopTimesCursor.toArray();

    // --- Step 4: Process results ---
    const bestNextTripMap = new Map();
    for (const item of relevantStopTimes) {
        const stopId = item.stop_time.stop_id;
        const stopInfo = stopInfoMap.get(stopId);
        if (!stopInfo) continue;

        const { distance, name: stopName } = stopInfo;
        const routeDirKey = `${item.route_id}_${item.direction_id}`;
        const currentBest = bestNextTripMap.get(routeDirKey);

        let isBetter = false;
        if (!currentBest) {
            isBetter = true;
        } else {
            if (distance < currentBest.distance) {
                isBetter = true;
            } else if (
                distance === currentBest.distance &&
                item.stop_time.arrival_datetime < currentBest.stop_time.arrival_datetime
            ) {
                isBetter = true;
            }
        }

        if (isBetter) {
            const nextTripInfo = { ...item, distance, stop_name: stopName };
            bestNextTripMap.set(routeDirKey, nextTripInfo);
        }
    }

    // --- Step 5: Format final output ---
    const nextTrips = Array.from(bestNextTripMap.values());
    nextTrips.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.stop_time.arrival_datetime.getTime() - b.stop_time.arrival_datetime.getTime();
    });
    const groupedByRoute: Record<string, any[]> = {};
    for (const trip of nextTrips) {
        const key = trip.route_id;
        groupedByRoute[key] = groupedByRoute[key] || [];
        groupedByRoute[key].push(trip);
    }

    return groupedByRoute;
};

import { getDb, type OmitId } from "@/services/mongo";
import { FIVE_MIN_IN_MS, getHoursInFuture } from "@/utils/datetime";
import { ObjectId, type WithId } from "mongodb";
import { StopNameService } from "./stopNameService";
import type {
    ScheduledTripDocument,
    StopTimeInfo,
    Vehicle,
    VehicleStopStatus,
    TripDescriptorScheduleRelationship,
} from "gtfs-db-types";
import { isFpEqual } from "@/utils/distance";

export const addStopNameToStopTimeInfo = async (stopTimeInfo: StopTimeInfo) => {
    const stopNameService = StopNameService.getInstance(await getDb());
    const stopName = await stopNameService.getStopNameByStopId(stopTimeInfo.stop_id);
    return {
        ...stopTimeInfo,
        stop_name: stopName,
    };
};

type ScheduledTripWithStopNames = WithId<
    OmitId<
        ScheduledTripDocument & {
            stop_times: (StopTimeInfo & { stop_name?: string | null })[];
        }
    >
>;

export const addStopNameToScheduledTrips = async (
    trip: WithId<OmitId<ScheduledTripDocument>>
): Promise<ScheduledTripWithStopNames> => {
    return {
        ...trip,
        stop_times: await Promise.all(trip.stop_times?.map(addStopNameToStopTimeInfo) ?? []),
    };
};

export const fetchScheduledTripDetails = async (tripObjectId: string) => {
    const db = await getDb();

    const objId = (() => {
        try {
            return new ObjectId(tripObjectId);
        } catch {
            throw new Error("Invalid tripObjectId");
        }
    })();

    const trip = await db.collection("scheduled_trips").findOne({ _id: objId });

    // Add stop name to trip.scheduled_stop_times
    if (!trip) {
        return null;
    }

    return await addStopNameToScheduledTrips(trip);
};

interface ScheduledTripsParams {
    routeId: string;
    directionId?: string;
    stopId: string;
    startDatetime?: string;
    endDatetime?: string;
    limit?: number;
    excludedTripObjectIds?: string[];
}

export const fetchScheduledTrips = async ({
    routeId,
    directionId,
    stopId,
    startDatetime,
    endDatetime,
    limit = 100,
    excludedTripObjectIds,
}: ScheduledTripsParams) => {
    const db = await getDb();

    const dateFiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const results = await db
        .collection("scheduled_trips")
        .aggregate([
            {
                // First filter to only include trips that have our stop of interest
                // and match the route and direction
                // and match the start and end datetimes search range if provided
                $match: {
                    "stop_times.stop_id": stopId,
                    route_id: routeId,
                    ...(directionId ? { direction_id: parseInt(directionId) } : {}),
                    ...(startDatetime && {
                        start_datetime: {
                            $gte: new Date(startDatetime),
                            ...(endDatetime && {
                                $lte: new Date(endDatetime),
                            }),
                        },
                    }),
                    ...(excludedTripObjectIds && {
                        _id: {
                            $nin: excludedTripObjectIds.map((id) => new ObjectId(id)),
                        },
                    }),
                },
            },
            {
                $addFields: {
                    relevantStopTimes: {
                        $filter: {
                            input: "$stop_times",
                            as: "stopTime",
                            cond: {
                                $and: [
                                    // Filter to only include the stop times for our stop of interest
                                    { $eq: ["$$stopTime.stop_id", stopId] },
                                    {
                                        // Use realtime (if it exists) or use static schedule.
                                        // Include stops with departure times in the future,
                                        // If the trip past our stop before the scheduled time, we
                                        // still include it as user needs to know the trip arrived early.
                                        $or: [
                                            {
                                                $gt: ["$$stopTime.departure_datetime", new Date()],
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
                                                            // Ensure realtime data is NOT stale (AKA last realtime update was within x minutes)
                                                            {
                                                                $gte: [
                                                                    "$stop_times_updated_at",
                                                                    dateFiveMinAgo,
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
                $limit: limit,
            },
        ])
        .toArray();

    // Add stop names to each trip
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

    const scheduledTrips = results as WithId<OmitId<ScheduledTripDocument>>[];

    return await Promise.all(scheduledTrips.map(addStopNameToScheduledTrips));
};
/**
 * Fetches a list of scheduled trips that depart from nearby stops.
 *
 * WARNING: For performance reasons, this function by default only looks for scheduled
 *          trips that depart within the next 12 hours and trips that have departed within
 *          the last 48 hours. It may not find all trips that depart from nearby stops by default.
 *
 * @param lat The latitude of the user's location.
 * @param lng The longitude of the user's location.
 * @param radius The radius of the area to search for nearby stops.
 * @param maxDate The maximum start datetime to include in the results. Defaults to 12 hours from the current time.
 * @param minDate The minimum start datetime to include in the results. Defaults to 48 hours ago. For performance at cost of accuracy.
 * @param realtimeMaxAge The maximum age of the position updates to include in the results. Defaults to 5 minutes.
 * @returns A list of scheduled trips with stop names.
 */
export const fetchNearbyTrips = async (
    lat: number,
    lng: number,
    radius: number,
    maxDate = getHoursInFuture(12),
    minDate = getHoursInFuture(-48),
    realtimeMaxAge = FIVE_MIN_IN_MS
) => {
    const realtimeThreshold = new Date(Date.now() - realtimeMaxAge);

    // let stepStartTime;

    // stepStartTime = performance.now();
    const db = await getDb();
    // console.log(`Get DB connection - ${performance.now() - stepStartTime} ms`);

    // --- Step 1: Find nearby stops ---
    // stepStartTime = performance.now();
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
    // console.log(`Step 1: Find nearby stops - ${performance.now() - stepStartTime} ms`);

    if (nearbyStops.length === 0) {
        return {};
    }

    // --- Step 2: Prepare ---
    // stepStartTime = performance.now();
    const stopIds = nearbyStops.map((stop) => stop.stop_id);
    const stopInfoMap = new Map<string, { distance: number; name?: string }>(
        nearbyStops.map((s) => [s.stop_id, { distance: s.distance, name: s.stop_name }])
    );
    // console.log(`Step 2: Prepare - ${performance.now() - stepStartTime} ms`);

    // --- Step 3: Find relevant upcoming scheduled stop times ---
    // stepStartTime = performance.now();
    const now = new Date();
    const scheduledTripsCollection = db.collection("scheduled_trips");

    const relevantStopTimesCursor = scheduledTripsCollection.aggregate([
        {
            $match: {
                "stop_times.stop_id": { $in: stopIds },
                start_datetime: { $lt: maxDate, $gte: minDate }, // Limit for performance
            },
        },
        { $unwind: "$stop_times" },
        {
            $match: {
                "stop_times.stop_id": { $in: stopIds },
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
                            { current_stop_sequence: { $ne: null } },
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
                                                "$current_stop_sequence",
                                            ],
                                        },
                                        // Stop sequence equals current sequence (vehicle is at/approaching this stop)
                                        {
                                            $and: [
                                                {
                                                    $eq: [
                                                        "$stop_times.stop_sequence",
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
                "stop_times.departure_datetime": 1,
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
                stop_time: "$stop_times",
                current_status: 1,
                current_stop_sequence: 1,
                vehicle: 1,
                stop_times_updated_at: 1,
                schedule_relationship: 1,
            },
        },
    ]);

    type RelevantStopTime = {
        _id: ObjectId;
        trip_id: string;
        route_id: string;
        direction_id: number;
        start_datetime: Date;
        route_short_name?: string | null;
        trip_headsign?: string | null;
        stop_time: StopTimeInfo;
        current_status?: VehicleStopStatus | null;
        current_stop_sequence?: number | null;
        vehicle?: Vehicle | null;
        stop_times_updated_at?: Date | null;
        schedule_relationship?: TripDescriptorScheduleRelationship | null;
    };

    const relevantStopTimes: RelevantStopTime[] = (await relevantStopTimesCursor.toArray()) as any;
    // console.log(
    //     `Step 3: Find relevant upcoming scheduled stop times - ${
    //         // performance.now() - stepStartTime
    //     } ms`
    // );

    // --- Step 4: Process results ---
    // stepStartTime = performance.now();
    const bestNextTripMap = new Map<
        string,
        RelevantStopTime & { distance: number; stop_name?: string }
    >();
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
                item.stop_time.departure_datetime < currentBest.stop_time.departure_datetime
            ) {
                isBetter = true;
            }
        }

        if (isBetter) {
            const nextTripInfo = { ...item, distance, stop_name: stopName };
            bestNextTripMap.set(routeDirKey, nextTripInfo);
        }
    }
    // console.log(`Step 4: Process results - ${performance.now() - stepStartTime} ms`);

    // --- Step 5: Format final output ---
    // stepStartTime = performance.now();
    const nextTrips = Array.from(bestNextTripMap.values());

    // Trip at the closest stop and departs the earliest comes first.
    // Distance & departure time takes 50/50 of the weight
    nextTrips.sort((a, b) => {
        let score = 0;
        if (isFpEqual(a.distance, b.distance, 0.001)) {
            /* do nothing */
        } else if (a.distance < b.distance) {
            score = -1;
        } else if (a.distance > b.distance) {
            score = 1;
        }

        const aTime = a.stop_time.departure_datetime.getTime();
        const bTime = b.stop_time.departure_datetime.getTime();
        if (isFpEqual(aTime, bTime, 1000)) {
            /* do nothing */
        } else if (aTime < bTime) {
            score = -1;
        } else if (aTime > bTime) {
            score = 1;
        }

        return score;
    });
    const groupedByRoute: Record<string, typeof nextTrips> = {};
    for (const trip of nextTrips) {
        const key = trip.route_id;
        groupedByRoute[key] = groupedByRoute[key] || [];
        groupedByRoute[key].push(trip);
    }
    // console.log(`Step 5: Format final output - ${performance.now() - stepStartTime} ms`);

    return groupedByRoute;
};

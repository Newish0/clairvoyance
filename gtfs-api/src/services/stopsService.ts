import { getDb } from "./mongo";

export const fetchStopsGeoJSON = async (stopIds: string[]) => {
    const db = await getDb();

    const stopCursor = db.collection("stops").find({
        stop_id: {
            $in: stopIds,
        },
    });

    const features = await stopCursor
        .map((stop) => ({
            type: "Feature",
            properties: { stopId: stop.stop_id },
            geometry: stop.location,
        }))
        .toArray();

    return {
        type: "FeatureCollection",
        features,
    };
};

export const fetchNextTripsByStop = async (stopId: string) => {
    const db = await getDb();

    const nextTrips = await db
        .collection("scheduled_trips")
        .aggregate([
            {
                // First filter to only include trips that have our stop of interest
                $match: {
                    "stop_times.stop_id": stopId,
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
                                                            // Ensure realtime data is NOT stale (AKA last realtime update was within 5 minutes)
                                                            {
                                                                $gte: [
                                                                    "$stop_times_updated_at",
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
                // Limit to 10 results
                $limit: 10,
            },
        ])
        .toArray();

    return { stopId, nextTrips };
};

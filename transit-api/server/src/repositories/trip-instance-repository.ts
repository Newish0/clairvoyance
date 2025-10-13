import { OmitId, TransitDb } from "../database/mongo";
import { FIVE_MIN_IN_MS, getHoursInFuture } from "../utils/datetime";
import type {
    Route,
    StopTime,
    StopTimeInstance,
    Trip,
    VehiclePosition,
} from "../../../../gtfs-processor/shared/gtfs-db-types";
import { Direction, TripInstanceState } from "../../../../gtfs-processor/shared/gtfs-db-types";
import { DBRef, MongoAPIError, ObjectId, WithId } from "mongodb";
import { DataRepository } from "./data-repository";
import { StopRepository } from "./stop-repository";
import { VehiclePositionRepository } from "./vehicle-position-repository";

const CHANGESTREAM_CLOSED_ERROR = 234;

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

type TripVehiclePositionEvent = {
    latestPosition: WithId<OmitId<VehiclePosition>> | null;
    tripInstanceId: ObjectId;
};

type TripStopTimeEvent = {
    tripInstanceId: string;
} & StopTimeInstance;

export class TripInstancesRepository extends DataRepository {
    protected collectionName = "trip_instances" as const;
    private stopRepository: StopRepository;
    private vehiclePositionRepository: VehiclePositionRepository;

    constructor(db: TransitDb) {
        super(db);

        this.stopRepository = new StopRepository(db);
        this.vehiclePositionRepository = new VehiclePositionRepository(db);
    }

    public async findById(tripInstanceId: string) {
        return this.db
            .collection(this.collectionName)
            .findOne({ _id: new ObjectId(tripInstanceId) });
    }

    public async findNextAtStop({
        stopId,
        agencyId,
        routeId,
        directionId,
        excludedTripInstanceIds = [],
        limit = 5,
        realtimeMaxAgeMs: realtimeMaxAge = FIVE_MIN_IN_MS,
    }: {
        stopId: string;
        agencyId?: string;
        routeId?: string;
        directionId?: Direction;
        excludedTripInstanceIds?: string[];
        limit?: number;
        realtimeMaxAgeMs?: number;
    }) {
        const now = new Date();
        const realtimeThreshold = new Date(now.getTime() - realtimeMaxAge);
        return this.db
            .collection(this.collectionName)
            .aggregate([
                {
                    $match: {
                        agency_id: agencyId,
                        ...(routeId ? { route_id: routeId } : {}),
                        ...(directionId ? { direction_id: directionId } : {}),
                        _id: { $nin: excludedTripInstanceIds.map((id) => new ObjectId(id)) },
                        state: { $ne: TripInstanceState.REMOVED },
                    },
                },
                // Populate the last known position for each trip
                {
                    $addFields: {
                        latest_position_id: { $arrayElemAt: ["$positions", -1] },
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
                        localField: "trip",
                        foreignField: "_id",
                        as: "trip_details",
                    },
                },

                // Lookup route details
                {
                    $lookup: {
                        from: "routes",
                        localField: "route",
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
                {
                    $match: {
                        $or: [
                            {
                                stop_times: {
                                    $elemMatch: {
                                        stop_id: stopId,
                                        $or: [
                                            {
                                                departure_datetime: { $gt: now },
                                            },
                                            {
                                                predicted_departure_datetime: { $gt: now },
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                stop_times_updated_at: { $gte: realtimeThreshold },
                                stop_times: {
                                    $elemMatch: {
                                        stop_id: stopId,
                                        stop_sequence: {
                                            $gte: "$latest_position.current_stop_sequence",
                                        },
                                    },
                                },
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
                        stop_times: 1,
                        stop_times_updated_at: 1,
                        trip: "$trip_details",
                        route: "$route_details",
                        shape: 1,
                        vehicle: 1,
                        latest_position: 1,
                    },
                },
            ])
            .limit(limit)
            .toArray();
    }

    /**
     * Fetches a list of scheduled trips that depart from nearby stops.
     *
     * WARNING: For performance reasons, this function by default only looks for scheduled
     *          trips that depart within the next 36 hours and trips that have departed within
     *          the last 12 hours. It may not find all trips that depart from nearby stops by default.
     *
     * @param options Configuration object for the nearby trips search.
     * @param options.lat The latitude of the center point to search.
     * @param options.lng The longitude of the center point to search.
     * @param options.radius The radius of the area to search for nearby stops (mutually exclusive with bbox).
     * @param options.bbox Bounding box for the search area (mutually exclusive with radius).
     * @param options.bbox.minLat The minimum latitude of the bounding box.
     * @param options.bbox.maxLat The maximum latitude of the bounding box.
     * @param options.bbox.minLng The minimum longitude of the bounding box.
     * @param options.bbox.maxLng The maximum longitude of the bounding box.
     * @param options.maxDate The maximum start datetime to include in the results. Defaults to 36 hours from the current time.
     * @param options.minDate The minimum start datetime to include in the results. Defaults to 12 hours ago.
     * @param options.realtimeMaxAgeMs The maximum age in milliseconds of the position updates to include in the results. Defaults to 5 minutes.
     * @param options.scoreWeight The weight of each score component in the final score. MUST SUM TO 1. Defaults to { distance: 0.6, time: 0.4 }.
     * @returns A list of scheduled trips with stop names.
     */
    public async findNearbyTrips({
        lat,
        lng,
        maxDate = getHoursInFuture(36),
        minDate = getHoursInFuture(-12),
        realtimeMaxAgeMs = FIVE_MIN_IN_MS,
        scoreWeight = { distance: 0.6, time: 0.4 },
        ...rest
    }: {
        lat: number;
        lng: number;
        maxDate?: Date;
        minDate?: Date;
        realtimeMaxAgeMs?: number;
        scoreWeight?: ScoreWeight;
    } & (
        | {
              radius: number;
          }
        | {
              bbox: {
                  minLat: number;
                  maxLat: number;
                  minLng: number;
                  maxLng: number;
              };
          }
    )) {
        // Validate score weight
        if (Object.values(scoreWeight).reduce((a, b) => a + b, 0) !== 1) {
            throw new Error("Score weight must sum to 1");
        }
        console.log("findNearbyTrips");

        const realtimeThreshold = new Date(Date.now() - realtimeMaxAgeMs);

        // --- Step 1: Find nearby stops ---
        let stepStartTime = performance.now();

        const nearbyStops = await this.stopRepository.findNearbyStops({ lat, lng, ...rest });
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
                    latest_position_id: { $arrayElemAt: ["$positions", -1] },
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
                    localField: "trip",
                    foreignField: "_id",
                    as: "trip_details",
                },
            },

            // Lookup route details
            {
                $lookup: {
                    from: "routes",
                    localField: "route",
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
                        // Static schedule check:
                        //  - Stop time departure time is in the future
                        { "stop_times.departure_datetime": { $gt: now } },

                        // Realtime schedule check:
                        //  - Predicted departure time is in the future
                        { "stop_times.predicted_departure_datetime": { $gt: now } },

                        // Realtime vehicle position check:
                        //  1. Realtime data for where the vehicle is exists
                        //  2. Data is fresh
                        //  3. Trip hasn't passed the stop yet
                        {
                            $and: [
                                // Where the vehicle (in relation to the stop) is exists
                                { "latest_position.current_stop_sequence": { $ne: null } },
                                // Data is fresh
                                { stop_times_updated_at: { $gte: realtimeThreshold } },
                                {
                                    $expr: {
                                        $or: [
                                            // Vehicle has not passed this stop
                                            {
                                                $gt: [
                                                    "$stop_times.stop_sequence",
                                                    "$latest_position.current_stop_sequence",
                                                ],
                                            },
                                            // Vehicle is currently at this stop
                                            {
                                                $eq: [
                                                    "$stop_times.stop_sequence",
                                                    "$latest_position.current_stop_sequence",
                                                ],
                                            },
                                        ],
                                    },
                                },
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
                    shape: 1,
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

        // FIXME: We are grouping by route_id (does not include agency_id). So it is possible
        // for different agencies to have the same route_id leading to problems...
        // We should group by route_id + agency_id or do a Record of agency_id -> Record of route_id -> ...
        const groupedByRoute: Record<string, Record<string, NearbyTrip[]>> = {};
        for (const tripInstance of tripsWithStopInfo) {
            const routeId = tripInstance.route_id;
            const directionId = tripInstance.direction_id || Direction.INBOUND;
            groupedByRoute[routeId] = groupedByRoute[routeId] || {};
            groupedByRoute[routeId][directionId] = groupedByRoute[routeId][directionId] || [];

            // Always add the first trip instance (this is the best match; the next trip)
            if (groupedByRoute[routeId][directionId].length < 1) {
                groupedByRoute[routeId][directionId].push(tripInstance);
            }
            // Only add the next trip at the same stop of the best match
            // Limit to 3 trips at the closest stop
            else if (
                groupedByRoute[routeId][directionId][0].stop_time.stop_id ===
                    tripInstance.stop_time.stop_id &&
                groupedByRoute[routeId][directionId].length < 3
            ) {
                groupedByRoute[routeId][directionId].push(tripInstance);
            }
        }
        console.log(`Step 6: Format final output - ${performance.now() - stepStartTime} ms`);

        return groupedByRoute;
    }

    public async *watchLivePositions({
        agencyId,
        routeId,
        directionId,
        signal,
    }: {
        agencyId?: string;
        routeId?: string;
        directionId?: Direction;
        signal?: AbortSignal;
    }): AsyncGenerator<TripVehiclePositionEvent> {
        const pipeline = [
            {
                $match: {
                    ...(agencyId ? { "fullDocument.agency_id": agencyId } : {}),
                    ...(routeId ? { "fullDocument.route_id": routeId } : {}),
                    ...(directionId ? { "fullDocument.direction_id": directionId } : {}),
                    "updateDescription.updatedFields.positions": { $exists: true },
                },
            },
        ];

        // TODO: Only one change stream at a time... we should singleton this. Then we can't close until all signals are aborted.
        const changeStream = this.db.collection(this.collectionName).watch(pipeline);
        signal?.addEventListener("abort", () => changeStream.close());

        try {
            for await (const change of changeStream) {
                const changeWithUpdate = change as any;
                const latestPositionObjectId =
                    changeWithUpdate.updateDescription.updatedFields.positions.at(-1);

                const latestPosition = await this.vehiclePositionRepository.findById(
                    latestPositionObjectId
                );

                yield {
                    latestPosition,
                    tripInstanceId: changeWithUpdate.documentKey._id,
                } as const;
            }
        } catch (error) {
            if (error instanceof MongoAPIError && signal?.aborted) {
                return;
            }

            throw error;
        }
    }

    public async *watchLiveStopTimes(
        watchTripStops: {
            tripInstanceId: string;
            stopId: string;
        }[],
        signal?: AbortSignal
    ): AsyncGenerator<TripStopTimeEvent> {
        const pipeline = [
            {
                $match: {
                    "documentKey._id": {
                        $in: watchTripStops.map((item) => new ObjectId(item.tripInstanceId)),
                    },
                    "updateDescription.updatedFields.stop_times.stop_id": {
                        $in: watchTripStops.map((item) => item.stopId),
                    },
                },
            },
        ];

        // TODO: Only one change stream at a time... we should singleton this. Then we can't close until all signals are aborted.
        const changeStream = this.db.collection(this.collectionName).watch(pipeline);
        signal?.addEventListener("abort", () => changeStream.close());

        try {
            for await (const change of changeStream) {
                const changeWithUpdate = change as any;
                const stopTimes: StopTimeInstance[] =
                    changeWithUpdate.updateDescription.updatedFields.stop_times;
                const stopTime = stopTimes.find((st) =>
                    watchTripStops.some((ts) => ts.stopId == st.stop_id)
                );

                if (!stopTime) {
                    continue;
                }

                yield {
                    ...stopTime,
                    tripInstanceId: changeWithUpdate.documentKey._id,
                } as const;
            }
        } catch (error) {
            if (error instanceof MongoAPIError && signal?.aborted) {
                return;
            }

            throw error;
        }
    }
}

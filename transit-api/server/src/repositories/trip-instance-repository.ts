import { FIVE_MIN_IN_MS, getHoursInFuture, getMinAgo } from "../utils/datetime";
import { DataRepository } from "./data-repository";
import { StopRepository } from "./stop-repository";
import {
    asc,
    eq,
    and,
    gt,
    lt,
    inArray,
    getTableColumns,
    getViewSelectedFields,
    sql,
    or,
    gte,
    isNull,
    not,
    getColumns,
} from "drizzle-orm";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import * as enums from "database/models/enums";
import { Prettify } from "../types/utils";
import { Db } from "../db";

export class TripInstancesRepository extends DataRepository {
    private stopRepository: StopRepository;

    constructor(db: Db) {
        super(db);
        this.stopRepository = new StopRepository(db);
    }

    public async findById(tripInstanceId: number) {
        return this.db.query.tripInstances.findFirst({
            where: {
                id: tripInstanceId,
            },
            with: {
                stopTimeInstances: {
                    orderBy: asc(views.stopTimeInstances.stopSequence) as any,
                },
            },
        });
    }

    // TODO: should prob go to stop time instances repo: find[StopTimeInstances]ByRouteAtStop
    // public async findByRouteStopTimeAtStop({
    //     routeId,
    //     direction,
    //     stopId,
    //     minDatetime,
    //     maxDatetime,
    // }: {
    //     routeId: number;
    //     direction?: enums.Direction;
    //     stopId: number;
    //     minDatetime: Date;
    //     maxDatetime: Date;
    // }) {
    //     const tripInstanceIdsSubquery = this.db
    //         .select({
    //             tripInstanceId: schema.tripInstances.id,
    //         })
    //         .from(schema.tripInstances)
    //         .rightJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
    //         .where(
    //             and(
    //                 eq(schema.tripInstances.routeId, routeId),
    //                 direction && eq(schema.trips.direction, direction),
    //                 and(
    //                     gt(schema.tripInstances.startDatetime, minDatetime),
    //                     lt(schema.tripInstances.startDatetime, getHoursInFuture(48, maxDatetime)),
    //                 ),
    //             ),
    //         );

    //     const stopTimeInstancesResult = await this.db
    //         .select({
    //             ...getTableColumns(schema.stops),
    //             ...getViewSelectedFields(schema.stopTimeInstances),
    //             id: sql<number>`stop_time_instances.trip_instance_id`.as("id"),
    //         })
    //         .from(schema.stopTimeInstances)
    //         .leftJoin(schema.stops, eq(schema.stopTimeInstances.stopId, schema.stops.id))
    //         .where(
    //             and(
    //                 eq(schema.stopTimeInstances.stopId, stopId),
    //                 and(
    //                     gt(schema.stopTimeInstances.scheduledArrivalTime, minDatetime),
    //                     lt(schema.stopTimeInstances.scheduledDepartureTime, maxDatetime),
    //                 ),
    //                 inArray(schema.stopTimeInstances.tripInstanceId, tripInstanceIdsSubquery),
    //             ),
    //         )
    //         .orderBy(
    //             schema.stopTimeInstances.scheduledArrivalTime,
    //             schema.stopTimeInstances.scheduledDepartureTime,
    //         );

    //     const stopTimeInstancesMap: Record<number, (typeof stopTimeInstancesResult)[number]> =
    //         stopTimeInstancesResult.reduce(
    //             (acc, stopTimeInstance) => ({
    //                 ...acc,
    //                 [stopTimeInstance.id]: stopTimeInstance,
    //             }),
    //             {},
    //         );
    //     const tripInstanceIds = Object.keys(stopTimeInstancesMap).map(Number);

    //     const tripInstancesResult = await this.db
    //         .select()
    //         .from(schema.tripInstances)
    //         .leftJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
    //         .where(inArray(schema.tripInstances.id, tripInstanceIds));

    //     const fullyPopulatedTripInstances = tripInstancesResult.map((tripInstance) => ({
    //         ...tripInstance.trips, // trips MUST go first to allow tripInstances.id to overwrite trips.id
    //         ...tripInstance.trip_instances,
    //         stopTimeInstances: stopTimeInstancesMap[tripInstance.trip_instances.id],
    //     }));

    //     return fullyPopulatedTripInstances;
    // }

    // public async findNextAtStop({
    //     stopId,
    //     agencyId,
    //     routeId,
    //     directionId,
    //     excludedTripInstanceIds = [],
    //     limit = 5,
    //     realtimeMaxAgeMs: realtimeMaxAge = FIVE_MIN_IN_MS,
    // }: {
    //     stopId: string;
    //     agencyId?: string;
    //     routeId?: string;
    //     directionId?: schema.Direction;
    //     excludedTripInstanceIds?: string[];
    //     limit?: number;
    //     realtimeMaxAgeMs?: number;
    // }) {
    //     const now = new Date();
    //     const excludedIds = excludedTripInstanceIds.map(Number).filter((id) => !isNaN(id));

    //     // Resolve GTFS stopSid to internal stop ID
    //     const [stop] = await this.db
    //         .select()
    //         .from(schema.stops)
    //         .where(and(eq(schema.stops.agencyId, agencyId!), eq(schema.stops.stopSid, stopId)))
    //         .limit(1);

    //     if (!stop) return [];

    //     // Subquery: find matching trip instance IDs via the view
    //     const tripInstanceIdsSubquery = this.db
    //         .select({ id: schema.tripInstances.id })
    //         .from(schema.tripInstances)
    //         .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
    //         .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
    //         .innerJoin(
    //             schema.stopTimeInstances,
    //             eq(schema.stopTimeInstances.tripInstanceId, schema.tripInstances.id),
    //         )
    //         .where(
    //             and(
    //                 eq(schema.tripInstances.agencyId, agencyId!),
    //                 eq(schema.stopTimeInstances.stopId, stop.id),
    //                 or(
    //                     gt(schema.stopTimeInstances.scheduledDepartureTime, now),
    //                     gt(schema.stopTimeInstances.predictedDepartureTime, now),
    //                 ),
    //                 routeId ? eq(schema.routes.routeSid, routeId) : undefined,
    //                 directionId ? eq(schema.trips.direction, directionId) : undefined,
    //                 excludedIds.length > 0
    //                     ? not(inArray(schema.tripInstances.id, excludedIds))
    //                     : undefined,
    //             ),
    //         );

    //     const tripInstanceIds = await tripInstanceIdsSubquery;

    //     if (tripInstanceIds.length === 0) return [];

    //     const ids = tripInstanceIds.map((r) => r.id);

    //     // Main query: populate trip instances with trip and route
    //     const results = await this.db
    //         .select()
    //         .from(schema.tripInstances)
    //         .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
    //         .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
    //         .where(inArray(schema.tripInstances.id, ids));

    //     return results.map((r) => ({
    //         ...r.trip_instances,
    //         trip: r.trips,
    //         route: r.routes,
    //         stopTime: null,
    //     }));
    // }
    public async findNearbyTrips({
        lat,
        lng,
        radiusMeters,
        after = new Date(),
        stillAtStopToleranceMeters = 50,
        effectiveTimeToleranceSec = 20,
        realtimeMaxAgeMs = FIVE_MIN_IN_MS,
    }: {
        lat: number;
        lng: number;
        radiusMeters: number;
        after?: Date;
        stillAtStopToleranceMeters?: number;
        effectiveTimeToleranceSec?: number;
        realtimeMaxAgeMs?: number;
    }) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);

        // Shift `after` back by the tolerance so a bus that left a few seconds
        // ago still shows up. Only applied to the time-based filter — isStillAtStop
        // is a physical position check and doesn't need a time fudge.
        const afterWithTolerance = new Date(after.getTime() - effectiveTimeToleranceSec * 1000);

        // -----------------------------------------------------------------------
        // CTE 1: most recent vehicle position per trip instance
        // -----------------------------------------------------------------------
        const latestVehiclePosition = this.db.$with("latest_vp").as(
            this.db
                .selectDistinctOn([tables.vehiclePositions.tripInstanceId], {
                    tripInstanceId: tables.vehiclePositions.tripInstanceId,
                    shapeDistTraveled: tables.vehiclePositions.shapeDistTraveled,
                    currentStopSequence: tables.vehiclePositions.currentStopSequence,
                })
                .from(tables.vehiclePositions)
                .where(gt(tables.vehiclePositions.timestamp, realtimeThresholdDate))
                .orderBy(
                    tables.vehiclePositions.tripInstanceId,
                    sql`${tables.vehiclePositions.timestamp} DESC`,
                ),
        );

        // -----------------------------------------------------------------------
        // CTE 2: candidate stop time instances
        //
        //   effectiveTime   - the best available time for "when does this bus leave (or arrive if no departure)"
        //   isStillAtStop   - true if the vehicle hasn't passed this stop yet
        //
        // -----------------------------------------------------------------------
        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    // Stop
                    // Explicit .as() aliases are required on all three id columns —
                    // without them Drizzle emits the raw column name "id" for all three,
                    // which makes DISTINCT ON target the wrong column (stop id instead
                    // of route id) and produces a broken SELECT with three "id" columns.
                    stopId: tables.stops.id.as("stop_id"),
                    stopName: tables.stops.name,
                    distanceMeters: sql<number>`ST_Distance(
                        ${tables.stops.location}::geography,
                        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                    )`.as("distance_meters"),

                    // Route
                    routeId: tables.routes.id.as("route_id"),
                    routeShortName: tables.routes.shortName,
                    routeLongName: tables.routes.longName,
                    direction: tables.trips.direction,

                    // Stop time instance
                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
                    tripInstanceId: views.stopTimeInstances.tripInstanceId,
                    scheduledDepartureTime: views.stopTimeInstances.scheduledDepartureTime,
                    predictedDepartureTime: views.stopTimeInstances.predictedDepartureTime,
                    scheduledArrivalTime: views.stopTimeInstances.scheduledArrivalTime,
                    predictedArrivalTime: views.stopTimeInstances.predictedArrivalTime,

                    effectiveTime: sql<Date>`COALESCE(
                        ${views.stopTimeInstances.predictedDepartureTime},
                        ${views.stopTimeInstances.scheduledDepartureTime},
                        ${views.stopTimeInstances.predictedArrivalTime},
                        ${views.stopTimeInstances.scheduledArrivalTime}
                    )`.as("effective_time"),

                    // "Is the vehicle still at/before this stop?"
                    //
                    // Priority:
                    //   1. Compare shape distance traveled - most accurate,
                    //      but both sides must be non-null to use it.
                    //      vehicle.shapeDistTraveled <= stop.shapeDistTraveled + tolerance
                    //      means the vehicle hasn't gone more than `tolerance` metres
                    //      past the stop's position on the shape.
                    //
                    //   2. Compare stop sequence - works when shape distances
                    //      aren't available (some agencies don't report them or don't report accurately).
                    //      vehicle.currentStopSequence <= stop.stopSequence
                    //      means the vehicle hasn't passed this stop yet.
                    //
                    //   3. false - no vehicle position at all (trip has no
                    //      realtime data), fall through to effectiveTime filter
                    //      in the main query.
                    isStillAtStop: sql<boolean>`CASE
                        WHEN
                            ${latestVehiclePosition.shapeDistTraveled} IS NOT NULL
                            AND ${tables.stopTimes.shapeDistTraveled} IS NOT NULL
                        THEN
                            ${latestVehiclePosition.shapeDistTraveled} <= ${tables.stopTimes.shapeDistTraveled} + ${stillAtStopToleranceMeters}
                        WHEN
                            ${latestVehiclePosition.currentStopSequence} IS NOT NULL
                        THEN
                            ${latestVehiclePosition.currentStopSequence} <= ${views.stopTimeInstances.stopSequence}
                        ELSE
                            false
                    END`.as("is_still_at_stop"),
                })
                .from(views.stopTimeInstances)
                .innerJoin(
                    tables.stops,
                    sql`${views.stopTimeInstances.stopId}     = ${tables.stops.id}`,
                )
                .innerJoin(
                    tables.stopTimes,
                    sql`${views.stopTimeInstances.stopTimeId} = ${tables.stopTimes.id}`,
                )
                .innerJoin(
                    tables.trips,
                    sql`${tables.stopTimes.tripId}            = ${tables.trips.id}`,
                )
                .innerJoin(
                    tables.routes,
                    sql`${tables.trips.routeId}               = ${tables.routes.id}`,
                )
                // LEFT join - trips with no realtime data have no vehicle positions.
                .leftJoin(
                    latestVehiclePosition,
                    sql`${latestVehiclePosition.tripInstanceId} = ${views.stopTimeInstances.tripInstanceId}`,
                ).where(sql`${views.stopTimeInstances.stopId} IN (
                    SELECT id FROM ${tables.stops}
                    WHERE ST_DWithin(
                        ${tables.stops.location}::geography,
                        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                        ${radiusMeters}
                    )
                )`),
        );

        // -----------------------------------------------------------------------
        // Main query: one row per route+direction
        // -----------------------------------------------------------------------
        return this.db
            .with(latestVehiclePosition, candidates)
            .selectDistinctOn([candidates.routeId, candidates.direction])
            .from(candidates)
            .where(
                sql`
                    ${candidates.isStillAtStop} = true
                    OR ${candidates.effectiveTime} >= ${afterWithTolerance}
                `,
            )
            .orderBy(
                candidates.routeId,
                candidates.direction,
                candidates.distanceMeters,
                sql`${candidates.isStillAtStop} DESC`,
                candidates.effectiveTime,
            );
    }

    // public async *watchLivePositions({
    //     agencyId,
    //     routeId,
    //     directionId,
    //     signal,
    //     getInitialData = true,
    //     pollIntervalMs = 5000,
    // }: {
    //     agencyId?: string;
    //     routeId?: string;
    //     directionId?: schema.Direction;
    //     signal?: AbortSignal;
    //     getInitialData?: boolean;
    //     pollIntervalMs?: number;
    // }): AsyncGenerator<{
    //     tripInstanceId: number;
    //     latestPosition: typeof schema.vehiclePositions.$inferSelect | null;
    // }> {
    //     if (getInitialData) {
    //         const conditions: ReturnType<typeof sql>[] = [];
    //         if (agencyId) conditions.push(eq(schema.tripInstances.agencyId, agencyId));
    //         if (routeId !== undefined)
    //             conditions.push(eq(schema.tripInstances.routeId, Number(routeId)));
    //         if (directionId) conditions.push(eq(schema.trips.direction, directionId));

    //         const recentTripInstances = await this.db
    //             .selectDistinct({
    //                 tripInstanceId: schema.tripInstances.id,
    //                 positionId: schema.vehiclePositions.id,
    //                 timestamp: schema.vehiclePositions.timestamp,
    //                 location: schema.vehiclePositions.location,
    //                 stopId: schema.vehiclePositions.stopId,
    //                 currentStopSequence: schema.vehiclePositions.currentStopSequence,
    //                 currentStatus: schema.vehiclePositions.currentStatus,
    //                 congestionLevel: schema.vehiclePositions.congestionLevel,
    //                 occupancyStatus: schema.vehiclePositions.occupancyStatus,
    //                 occupancyPercentage: schema.vehiclePositions.occupancyPercentage,
    //                 bearing: schema.vehiclePositions.bearing,
    //                 odometer: schema.vehiclePositions.odometer,
    //                 speed: schema.vehiclePositions.speed,
    //                 ingestedAt: schema.vehiclePositions.ingestedAt,
    //             })
    //             .from(schema.tripInstances)
    //             .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
    //             .innerJoin(
    //                 schema.vehiclePositions,
    //                 eq(schema.vehiclePositions.tripInstanceId, schema.tripInstances.id),
    //             )
    //             .where(
    //                 and(
    //                     ...conditions,
    //                     gt(schema.vehiclePositions.timestamp, getHoursInFuture(-0.083)),
    //                 ),
    //             );

    //         const latestPerTrip = recentTripInstances.reduce((acc, row) => {
    //             const existing = acc.get(row.tripInstanceId);
    //             if (!existing || row.timestamp > existing.timestamp) {
    //                 acc.set(row.tripInstanceId, row);
    //             }
    //             return acc;
    //         }, new Map<number, (typeof recentTripInstances)[number]>());

    //         for (const [tripInstanceId, position] of latestPerTrip) {
    //             yield {
    //                 tripInstanceId,
    //                 latestPosition: {
    //                     id: position.positionId,
    //                     vehicleId: 0,
    //                     tripInstanceId,
    //                     timestamp: position.timestamp,
    //                     location: position.location,
    //                     stopId: position.stopId,
    //                     currentStopSequence: position.currentStopSequence,
    //                     currentStatus: position.currentStatus,
    //                     congestionLevel: position.congestionLevel,
    //                     occupancyStatus: position.occupancyStatus,
    //                     occupancyPercentage: position.occupancyPercentage,
    //                     bearing: position.bearing,
    //                     odometer: position.odometer,
    //                     speed: position.speed,
    //                     ingestedAt: position.ingestedAt,
    //                 } satisfies typeof schema.vehiclePositions.$inferSelect,
    //             };
    //         }
    //     }

    //     // Poll for new positions
    //     let lastPoll = new Date(0);
    //     while (!signal?.aborted) {
    //         await new Promise((r) => setTimeout(r, pollIntervalMs));
    //         if (signal?.aborted) return;

    //         const newPositions = await this.db
    //             .select()
    //             .from(schema.vehiclePositions)
    //             .where(gt(schema.vehiclePositions.ingestedAt, lastPoll));

    //         lastPoll = new Date();

    //         for (const pos of newPositions) {
    //             yield { tripInstanceId: pos.tripInstanceId!, latestPosition: pos };
    //         }
    //     }
    // }

    // public async *watchLiveStopTimes(
    //     watchTripStops: {
    //         tripInstanceId: string;
    //         stopId: string;
    //     }[],
    //     signal?: AbortSignal,
    //     pollIntervalMs = 5000,
    // ): AsyncGenerator<typeof schema.stopTimeRealtimeInstances.$inferSelect> {
    //     const tripInstanceIds = watchTripStops
    //         .map((t) => Number(t.tripInstanceId))
    //         .filter((id) => !isNaN(id));
    //     if (tripInstanceIds.length === 0) return;

    //     let lastPoll = new Date(0);
    //     while (!signal?.aborted) {
    //         await new Promise((r) => setTimeout(r, pollIntervalMs));
    //         if (signal?.aborted) return;

    //         const newRows = await this.db
    //             .select()
    //             .from(schema.stopTimeRealtimeInstances)
    //             .where(
    //                 and(
    //                     inArray(schema.stopTimeRealtimeInstances.tripInstanceId, tripInstanceIds),
    //                     gt(schema.stopTimeRealtimeInstances.lastUpdatedAt, lastPoll),
    //                 ),
    //             );

    //         lastPoll = new Date();

    //         for (const row of newRows) {
    //             yield row;
    //         }
    //     }
    // }
}

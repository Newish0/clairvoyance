import * as enums from "database/models/enums";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { and, asc, eq, getColumns, gt, gte, lte, sql } from "drizzle-orm";
import { FIVE_MIN_IN_MS, getMinAgo } from "../utils/datetime";
import { DataRepository } from "./data-repository";

export class TripInstancesRepository extends DataRepository {
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

    /**
     * Shared helper - reused by both findNearbyTrips and findUpcomingDepartures
     */
    private buildLatestVehiclePositionCTE(realtimeThresholdDate: Date) {
        return this.db.$with("latest_vp").as(
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
    }

    /** one result per route+direction at nearest stop */
    public async findNearbyTrips({
        lat,
        lng,
        radiusMeters,
        after = new Date(),
        stillAtStopToleranceMeters = 50,
        effectiveTimeToleranceSec = 20,
        realtimeMaxAgeMs = FIVE_MIN_IN_MS,
        tripInstanceLookbackHours = 16,
        tripInstanceLookaheadHours = 36,
    }: {
        lat: number;
        lng: number;
        radiusMeters: number;
        after?: Date;
        stillAtStopToleranceMeters?: number;
        effectiveTimeToleranceSec?: number;
        realtimeMaxAgeMs?: number;
        tripInstanceLookbackHours?: number;
        tripInstanceLookaheadHours?: number;
    }) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);
        const afterWithTolerance = new Date(after.getTime() - effectiveTimeToleranceSec * 1000);
        // Prefilter tripInstances to a rolling window around `after` to cut the
        // candidate set before the expensive joins and window function run.
        const tripInstanceFrom = new Date(
            after.getTime() - tripInstanceLookbackHours * 60 * 60 * 1000,
        );
        const tripInstanceTo = new Date(
            after.getTime() + tripInstanceLookaheadHours * 60 * 60 * 1000,
        );
        const latestVehiclePosition = this.buildLatestVehiclePositionCTE(realtimeThresholdDate);

        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    agencyId: tables.stops.agencyId,

                    // Explicit .as() required - stops, routes, stopTimeInstances all
                    // have an "id" column; without aliases DISTINCT ON targets the wrong one.
                    stopId: tables.stops.id.as("stop_id"),
                    stopName: tables.stops.name,
                    distanceMeters: sql<number>`ST_Distance(
                        ${tables.stops.location}::geography,
                        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                    )`.as("distance_meters"),

                    routeId: tables.routes.id.as("route_id"),
                    routeShortName: tables.routes.shortName,
                    routeLongName: tables.routes.longName,
                    direction: tables.trips.direction,
                    routeColor: tables.routes.color,
                    routeTextColor: tables.routes.textColor,
                    tripHeadsign: tables.trips.headsign,

                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
                    tripInstanceId: views.stopTimeInstances.tripInstanceId,
                    startDate: tables.tripInstances.startDate,
                    scheduledDepartureTime: views.stopTimeInstances.scheduledDepartureTime,
                    predictedDepartureTime: views.stopTimeInstances.predictedDepartureTime,
                    scheduledArrivalTime: views.stopTimeInstances.scheduledArrivalTime,
                    predictedArrivalTime: views.stopTimeInstances.predictedArrivalTime,
                    scheduleRelationship: views.stopTimeInstances.scheduleRelationship,

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
                    //   2. Compare stop sequence - fallback when shape distances unavailable.
                    //   3. false - no vehicle position, fall through to effectiveTime filter.
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
                .innerJoin(
                    tables.tripInstances,
                    sql`${views.stopTimeInstances.tripInstanceId} = ${tables.tripInstances.id}`,
                )
                .leftJoin(
                    latestVehiclePosition,
                    sql`${latestVehiclePosition.tripInstanceId} = ${views.stopTimeInstances.tripInstanceId}`,
                )
                .where(
                    and(
                        // Prefilter: only consider trip instances within the rolling window.
                        // Cuts the candidate set dramatically before joins + window function run.
                        gte(tables.tripInstances.startDatetime, tripInstanceFrom),
                        lte(tables.tripInstances.startDatetime, tripInstanceTo),
                        sql`${views.stopTimeInstances.stopId} IN (
                    SELECT id FROM ${tables.stops}
                    WHERE ST_DWithin(
                        ${tables.stops.location}::geography,
                        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                        ${radiusMeters}
                    )
                )`,
                    ),
                ),
        );

        // isLast = no later departure exists for the same route+direction+stop on the same service date.
        // RANK() instead of ROW_NUMBER() so two trips with identical effectiveTime both get marked last.
        const annotated = this.db.$with("annotated").as(
            this.db
                .select({
                    ...getColumns(candidates),
                    isLast: sql<boolean>`RANK() OVER (
                        PARTITION BY
                            ${candidates.routeId},
                            ${candidates.direction},
                            ${candidates.stopId},
                            ${candidates.startDate}
                        ORDER BY ${candidates.effectiveTime} DESC
                    ) = 1`.as("is_last"),
                })
                .from(candidates),
        );

        return this.db
            .with(latestVehiclePosition, candidates, annotated)
            .selectDistinctOn([annotated.routeId, annotated.direction])
            .from(annotated)
            .where(
                sql`
                ${annotated.isStillAtStop} = true
                OR ${annotated.effectiveTime} >= ${afterWithTolerance}
            `,
            )
            .orderBy(
                annotated.routeId,
                annotated.direction,
                annotated.distanceMeters,
                sql`${annotated.isStillAtStop} DESC`,
                annotated.effectiveTime,
            );
    }

    /**
     * Next N departures at a specific stop+route+direction
     */
    public async findUpcomingDepartures({
        stopId,
        routeId,
        direction,
        after = new Date(),
        limit = 5,
        stillAtStopToleranceMeters = 50,
        effectiveTimeToleranceSec = 20,
        realtimeMaxAgeMs = FIVE_MIN_IN_MS,
        tripInstanceLookbackHours = 16,
        tripInstanceLookaheadHours = 36,
    }: {
        stopId: number;
        routeId: number;
        direction: enums.Direction;
        after?: Date;
        limit?: number;
        stillAtStopToleranceMeters?: number;
        effectiveTimeToleranceSec?: number;
        realtimeMaxAgeMs?: number;
        tripInstanceLookbackHours?: number;
        tripInstanceLookaheadHours?: number;
    }) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);
        const afterWithTolerance = new Date(after.getTime() - effectiveTimeToleranceSec * 1000);
        const tripInstanceFrom = new Date(
            after.getTime() - tripInstanceLookbackHours * 60 * 60 * 1000,
        );
        const tripInstanceTo = new Date(
            after.getTime() + tripInstanceLookaheadHours * 60 * 60 * 1000,
        );
        const latestVehiclePosition = this.buildLatestVehiclePositionCTE(realtimeThresholdDate);

        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
                    tripInstanceId: views.stopTimeInstances.tripInstanceId,
                    stopSequence: views.stopTimeInstances.stopSequence,
                    startDate: tables.tripInstances.startDate,
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
                .innerJoin(
                    tables.tripInstances,
                    sql`${views.stopTimeInstances.tripInstanceId} = ${tables.tripInstances.id}`,
                )
                .leftJoin(
                    latestVehiclePosition,
                    sql`${latestVehiclePosition.tripInstanceId} = ${views.stopTimeInstances.tripInstanceId}`,
                )
                .where(
                    and(
                        gte(tables.tripInstances.startDatetime, tripInstanceFrom),
                        lte(tables.tripInstances.startDatetime, tripInstanceTo),
                        eq(views.stopTimeInstances.stopId, stopId),
                        eq(tables.routes.id, routeId),
                        eq(tables.trips.direction, direction),
                    ),
                ),
        );

        const annotated = this.db.$with("annotated").as(
            this.db
                .select({
                    ...candidates._.selectedFields,
                    isLast: sql<boolean>`RANK() OVER (
                        PARTITION BY
                            ${candidates.tripInstanceId},
                            ${candidates.startDate}
                        ORDER BY ${candidates.effectiveTime} DESC
                    ) = 1`.as("is_last"),
                })
                .from(candidates),
        );

        return this.db
            .with(latestVehiclePosition, candidates, annotated)
            .select()
            .from(annotated)
            .where(
                sql`
                ${annotated.isStillAtStop} = true
                OR ${annotated.effectiveTime} >= ${afterWithTolerance}
            `,
            )
            .orderBy(sql`${annotated.isStillAtStop} DESC`, annotated.effectiveTime)
            .limit(limit);
    }

    public async findDepartures({
        stopId,
        routeId,
        direction,
        from,
        to,
        limit = 20,
        offset = 0,
        stillAtStopToleranceMeters = 50,
        realtimeMaxAgeMs = FIVE_MIN_IN_MS,
    }: {
        stopId: number;
        routeId: number;
        direction: enums.Direction;
        from: Date;
        to?: Date;
        limit?: number;
        offset?: number;
        stillAtStopToleranceMeters?: number;
        realtimeMaxAgeMs?: number;
    }) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);
        const latestVehiclePosition = this.buildLatestVehiclePositionCTE(realtimeThresholdDate);

        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
                    tripInstanceId: views.stopTimeInstances.tripInstanceId,
                    stopSequence: views.stopTimeInstances.stopSequence,
                    startDate: tables.tripInstances.startDate,
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

                    // Metadata only - not used for filtering here.
                    // UI can use this to distinguish "bus is here now" from scheduled/historic.
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
                .innerJoin(
                    tables.tripInstances,
                    sql`${views.stopTimeInstances.tripInstanceId} = ${tables.tripInstances.id}`,
                )
                .leftJoin(
                    latestVehiclePosition,
                    sql`${latestVehiclePosition.tripInstanceId} = ${views.stopTimeInstances.tripInstanceId}`,
                )
                .where(
                    and(
                        eq(views.stopTimeInstances.stopId, stopId),
                        eq(tables.routes.id, routeId),
                        eq(tables.trips.direction, direction),
                    ),
                ),
        );

        const annotated = this.db.$with("annotated").as(
            this.db
                .select({
                    ...getColumns(candidates),
                    isLast: sql<boolean>`RANK() OVER (
                        PARTITION BY
                            ${candidates.tripInstanceId},
                            ${candidates.startDate}
                        ORDER BY ${candidates.effectiveTime} DESC
                    ) = 1`.as("is_last"),
                })
                .from(candidates),
        );

        return this.db
            .with(latestVehiclePosition, candidates, annotated)
            .select()
            .from(annotated)
            .where(
                and(
                    gte(annotated.effectiveTime, from),
                    to ? lte(annotated.effectiveTime, to) : undefined,
                ),
            )
            .orderBy(annotated.effectiveTime)
            .limit(limit)
            .offset(offset);
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

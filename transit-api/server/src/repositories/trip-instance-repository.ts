import * as enums from "database/models/enums";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { and, asc, eq, gt, sql } from "drizzle-orm";
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
        const afterWithTolerance = new Date(after.getTime() - effectiveTimeToleranceSec * 1000);
        const latestVehiclePosition = this.buildLatestVehiclePositionCTE(realtimeThresholdDate);

        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    // Explicit .as() required — stops, routes, stopTimeInstances all
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

                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
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
    }: {
        stopId: number;
        routeId: number;
        direction: enums.Direction;
        after?: Date;
        limit?: number;
        stillAtStopToleranceMeters?: number;
        effectiveTimeToleranceSec?: number;
        realtimeMaxAgeMs?: number;
    }) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);
        const afterWithTolerance = new Date(after.getTime() - effectiveTimeToleranceSec * 1000);
        const latestVehiclePosition = this.buildLatestVehiclePositionCTE(realtimeThresholdDate);

        const candidates = this.db.$with("candidates").as(
            this.db
                .select({
                    stopTimeInstanceId: views.stopTimeInstances.id.as("stop_time_instance_id"),
                    tripInstanceId: views.stopTimeInstances.tripInstanceId,
                    stopSequence: views.stopTimeInstances.stopSequence,
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

        return this.db
            .with(latestVehiclePosition, candidates)
            .select()
            .from(candidates)
            .where(
                sql`
                ${candidates.isStillAtStop} = true
                OR ${candidates.effectiveTime} >= ${afterWithTolerance}
            `,
            )
            .orderBy(sql`${candidates.isStillAtStop} DESC`, candidates.effectiveTime)
            .limit(limit);
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

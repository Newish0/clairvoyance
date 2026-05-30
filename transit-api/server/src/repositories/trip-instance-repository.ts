import { BunSQLDatabase } from "drizzle-orm/bun-sql";
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
} from "drizzle-orm";
import * as schema from "database";
import { Prettify } from "../types/utils";

export class TripInstancesRepository extends DataRepository {
    private stopRepository: StopRepository;

    constructor(db: BunSQLDatabase<typeof schema>) {
        super(db);
        this.stopRepository = new StopRepository(db);
    }

    public async findById(tripInstanceId: number) {
        return this.db.query.tripInstances.findFirst({
            where: eq(schema.tripInstances.id, tripInstanceId),
            with: {
                stopTimeInstances: {
                    orderBy: asc(schema.stopTimeInstances.stopSequence),
                },
            },
        });
    }

    public async findByRouteStopTimeAtStop({
        routeId,
        direction,
        stopId,
        minDatetime,
        maxDatetime,
    }: {
        routeId: number;
        direction?: schema.Direction;
        stopId: number;
        minDatetime: Date;
        maxDatetime: Date;
    }) {
        const tripInstanceIdsSubquery = this.db
            .select({
                tripInstanceId: schema.tripInstances.id,
            })
            .from(schema.tripInstances)
            .rightJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .where(
                and(
                    eq(schema.tripInstances.routeId, routeId),
                    direction && eq(schema.trips.direction, direction),
                    and(
                        gt(schema.tripInstances.startDatetime, minDatetime),
                        lt(schema.tripInstances.startDatetime, getHoursInFuture(48, maxDatetime)),
                    ),
                ),
            );

        const stopTimeInstancesResult = await this.db
            .select({
                ...getTableColumns(schema.stops),
                ...getViewSelectedFields(schema.stopTimeInstances),
                id: sql<number>`stop_time_instances.trip_instance_id`.as("id"),
            })
            .from(schema.stopTimeInstances)
            .leftJoin(schema.stops, eq(schema.stopTimeInstances.stopId, schema.stops.id))
            .where(
                and(
                    eq(schema.stopTimeInstances.stopId, stopId),
                    and(
                        gt(schema.stopTimeInstances.scheduledArrivalTime, minDatetime),
                        lt(schema.stopTimeInstances.scheduledDepartureTime, maxDatetime),
                    ),
                    inArray(schema.stopTimeInstances.tripInstanceId, tripInstanceIdsSubquery),
                ),
            )
            .orderBy(
                schema.stopTimeInstances.scheduledArrivalTime,
                schema.stopTimeInstances.scheduledDepartureTime,
            );

        const stopTimeInstancesMap: Record<number, (typeof stopTimeInstancesResult)[number]> =
            stopTimeInstancesResult.reduce(
                (acc, stopTimeInstance) => ({
                    ...acc,
                    [stopTimeInstance.id]: stopTimeInstance,
                }),
                {},
            );
        const tripInstanceIds = Object.keys(stopTimeInstancesMap).map(Number);

        const tripInstancesResult = await this.db
            .select()
            .from(schema.tripInstances)
            .leftJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .where(inArray(schema.tripInstances.id, tripInstanceIds));

        const fullyPopulatedTripInstances = tripInstancesResult.map((tripInstance) => ({
            ...tripInstance.trips, // trips MUST go first to allow tripInstances.id to overwrite trips.id
            ...tripInstance.trip_instances,
            stopTimeInstances: stopTimeInstancesMap[tripInstance.trip_instances.id],
        }));

        return fullyPopulatedTripInstances;
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
        directionId?: schema.Direction;
        excludedTripInstanceIds?: string[];
        limit?: number;
        realtimeMaxAgeMs?: number;
    }) {
        const now = new Date();
        const excludedIds = excludedTripInstanceIds.map(Number).filter((id) => !isNaN(id));

        // Resolve GTFS stopSid to internal stop ID
        const [stop] = await this.db
            .select()
            .from(schema.stops)
            .where(and(eq(schema.stops.agencyId, agencyId!), eq(schema.stops.stopSid, stopId)))
            .limit(1);

        if (!stop) return [];

        // Subquery: find matching trip instance IDs via the view
        const tripInstanceIdsSubquery = this.db
            .select({ id: schema.tripInstances.id })
            .from(schema.tripInstances)
            .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
            .innerJoin(
                schema.stopTimeInstances,
                eq(schema.stopTimeInstances.tripInstanceId, schema.tripInstances.id),
            )
            .where(
                and(
                    eq(schema.tripInstances.agencyId, agencyId!),
                    eq(schema.stopTimeInstances.stopId, stop.id),
                    or(
                        gt(schema.stopTimeInstances.scheduledDepartureTime, now),
                        gt(schema.stopTimeInstances.predictedDepartureTime, now),
                    ),
                    routeId ? eq(schema.routes.routeSid, routeId) : undefined,
                    directionId ? eq(schema.trips.direction, directionId) : undefined,
                    excludedIds.length > 0 ? not(inArray(schema.tripInstances.id, excludedIds)) : undefined,
                ),
            );

        const tripInstanceIds = await tripInstanceIdsSubquery;

        if (tripInstanceIds.length === 0) return [];

        const ids = tripInstanceIds.map((r) => r.id);

        // Main query: populate trip instances with trip and route
        const results = await this.db
            .select()
            .from(schema.tripInstances)
            .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
            .where(inArray(schema.tripInstances.id, ids));

        return results.map((r) => ({
            ...r.trip_instances,
            trip: r.trips,
            route: r.routes,
            stopTime: null,
        }));
    }

    public async findNearbyTrips(
        {
            lat,
            lng,
            maxDate = getHoursInFuture(36),
            minDate = getHoursInFuture(-12),
            realtimeMaxAgeMs = FIVE_MIN_IN_MS,
            ...rest
        }: {
            lat: number;
            lng: number;
            maxDate?: Date;
            minDate?: Date;
            realtimeMaxAgeMs?: number;
        } & (
            | { radius: number }
            | { bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } }
        ),
        maxRadius = 10000,
    ) {
        const realtimeThresholdDate = getMinAgo(realtimeMaxAgeMs);

        // Step 1: find nearby stops with distances
        const nearbyStops = await this.stopRepository.findNearbyStops({ lat, lng, ...rest }, maxRadius);
        if (nearbyStops.length === 0) return [];

        const stopIds = nearbyStops.map((s) => s.id);
        const stopInfoMap = new Map(nearbyStops.map((s) => [s.id, { distance: s.distance, name: s.name }]));

        // Step 2: find matching trip instance IDs + stop IDs from the view
        const matchingSubquery = this.db
            .select({
                id: schema.tripInstances.id,
                stopId: schema.stopTimeInstances.stopId,
                routeSid: schema.routes.routeSid,
                direction: schema.trips.direction,
            })
            .from(schema.stopTimeInstances)
            .innerJoin(schema.tripInstances, eq(schema.tripInstances.id, schema.stopTimeInstances.tripInstanceId))
            .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
            .where(
                and(
                    inArray(schema.stopTimeInstances.stopId, stopIds),
                    or(
                        and(
                            or(
                                lt(schema.stopTimeInstances.lastUpdatedAt, realtimeThresholdDate),
                                isNull(schema.stopTimeInstances.lastUpdatedAt),
                                isNull(schema.stopTimeInstances.predictedDepartureTime),
                            ),
                            gt(schema.stopTimeInstances.scheduledDepartureTime, minDate),
                            lt(schema.stopTimeInstances.scheduledDepartureTime, maxDate),
                        ),
                        and(
                            gte(schema.stopTimeInstances.lastUpdatedAt, realtimeThresholdDate),
                            gt(schema.stopTimeInstances.predictedDepartureTime, minDate),
                            lt(schema.stopTimeInstances.predictedDepartureTime, maxDate),
                        ),
                    ),
                ),
            )
            .orderBy(schema.stopTimeInstances.scheduledDepartureTime);

        const matchingRows = await matchingSubquery;
        if (matchingRows.length === 0) return {};

        // Step 3: fetch full trip instance data for matched IDs
        const ids = matchingRows.map((r) => r.id);
        const tripRows = await this.db
            .select()
            .from(schema.tripInstances)
            .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
            .innerJoin(schema.routes, eq(schema.routes.id, schema.tripInstances.routeId))
            .where(inArray(schema.tripInstances.id, ids));

        // Build a lookup for matched rows by trip instance ID
        const matchByTiId = new Map(matchingRows.map((r) => [r.id, r]));

        // Step 4: attach stop info and group by route ID + direction
        const groupedByRoute: Record<string, Record<string, any[]>> = {};
        for (const row of tripRows) {
            const match = matchByTiId.get(row.trip_instances.id)!;
            const stopInfo = stopInfoMap.get(match.stopId!)!;
            const routeId = match.routeSid!;
            const directionId = match.direction || "INBOUND";

            groupedByRoute[routeId] = groupedByRoute[routeId] || {};
            groupedByRoute[routeId][directionId] = groupedByRoute[routeId][directionId] || [];

            const tripEntry = {
                ...row.trip_instances,
                trip: row.trips,
                route: row.routes,
                stopTime: {
                    stopId: match.stopId,
                    stopName: stopInfo?.name || null,
                    distance: stopInfo?.distance || 0,
                },
            };

            const entries = groupedByRoute[routeId][directionId];
            // First match per direction
            if (entries.length < 1) {
                entries.push(tripEntry);
            }
            // Up to 3 additional at same stop as the first match
            else if (
                entries[0].stopTime.stopId === tripEntry.stopTime.stopId &&
                entries.length < 4
            ) {
                entries.push(tripEntry);
            }
        }

        return groupedByRoute;
    }

    public async *watchLivePositions({
        agencyId,
        routeId,
        directionId,
        signal,
        getInitialData = true,
        pollIntervalMs = 5000,
    }: {
        agencyId?: string;
        routeId?: string;
        directionId?: schema.Direction;
        signal?: AbortSignal;
        getInitialData?: boolean;
        pollIntervalMs?: number;
    }): AsyncGenerator<{
        tripInstanceId: number;
        latestPosition: typeof schema.vehiclePositions.$inferSelect | null;
    }> {
        if (getInitialData) {
            const conditions: ReturnType<typeof sql>[] = [];
            if (agencyId) conditions.push(eq(schema.tripInstances.agencyId, agencyId));
            if (routeId !== undefined) conditions.push(eq(schema.tripInstances.routeId, Number(routeId)));
            if (directionId) conditions.push(eq(schema.trips.direction, directionId));

            const recentTripInstances = await this.db
                .selectDistinct({
                    tripInstanceId: schema.tripInstances.id,
                    positionId: schema.vehiclePositions.id,
                    timestamp: schema.vehiclePositions.timestamp,
                    location: schema.vehiclePositions.location,
                    stopId: schema.vehiclePositions.stopId,
                    currentStopSequence: schema.vehiclePositions.currentStopSequence,
                    currentStatus: schema.vehiclePositions.currentStatus,
                    congestionLevel: schema.vehiclePositions.congestionLevel,
                    occupancyStatus: schema.vehiclePositions.occupancyStatus,
                    occupancyPercentage: schema.vehiclePositions.occupancyPercentage,
                    bearing: schema.vehiclePositions.bearing,
                    odometer: schema.vehiclePositions.odometer,
                    speed: schema.vehiclePositions.speed,
                    ingestedAt: schema.vehiclePositions.ingestedAt,
                })
                .from(schema.tripInstances)
                .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInstances.tripId))
                .innerJoin(
                    schema.vehiclePositions,
                    eq(schema.vehiclePositions.tripInstanceId, schema.tripInstances.id),
                )
                .where(
                    and(
                        ...conditions,
                        gt(schema.vehiclePositions.timestamp, getHoursInFuture(-0.083)),
                    ),
                );

            const latestPerTrip = recentTripInstances.reduce(
                (acc, row) => {
                    const existing = acc.get(row.tripInstanceId);
                    if (!existing || row.timestamp > existing.timestamp) {
                        acc.set(row.tripInstanceId, row);
                    }
                    return acc;
                },
                new Map<number, (typeof recentTripInstances)[number]>(),
            );

            for (const [tripInstanceId, position] of latestPerTrip) {
                yield {
                    tripInstanceId,
                    latestPosition: {
                        id: position.positionId,
                        vehicleId: 0,
                        tripInstanceId,
                        timestamp: position.timestamp,
                        location: position.location,
                        stopId: position.stopId,
                        currentStopSequence: position.currentStopSequence,
                        currentStatus: position.currentStatus,
                        congestionLevel: position.congestionLevel,
                        occupancyStatus: position.occupancyStatus,
                        occupancyPercentage: position.occupancyPercentage,
                        bearing: position.bearing,
                        odometer: position.odometer,
                        speed: position.speed,
                        ingestedAt: position.ingestedAt,
                    } satisfies typeof schema.vehiclePositions.$inferSelect,
                };
            }
        }

        // Poll for new positions
        let lastPoll = new Date(0);
        while (!signal?.aborted) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            if (signal?.aborted) return;

            const newPositions = await this.db
                .select()
                .from(schema.vehiclePositions)
                .where(gt(schema.vehiclePositions.ingestedAt, lastPoll));

            lastPoll = new Date();

            for (const pos of newPositions) {
                yield { tripInstanceId: pos.tripInstanceId!, latestPosition: pos };
            }
        }
    }

    public async *watchLiveStopTimes(
        watchTripStops: {
            tripInstanceId: string;
            stopId: string;
        }[],
        signal?: AbortSignal,
        pollIntervalMs = 5000,
    ): AsyncGenerator<typeof schema.stopTimeRealtimeInstances.$inferSelect> {
        const tripInstanceIds = watchTripStops.map((t) => Number(t.tripInstanceId)).filter((id) => !isNaN(id));
        if (tripInstanceIds.length === 0) return;

        let lastPoll = new Date(0);
        while (!signal?.aborted) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            if (signal?.aborted) return;

            const newRows = await this.db
                .select()
                .from(schema.stopTimeRealtimeInstances)
                .where(
                    and(
                        inArray(schema.stopTimeRealtimeInstances.tripInstanceId, tripInstanceIds),
                        gt(schema.stopTimeRealtimeInstances.lastUpdatedAt, lastPoll),
                    ),
                );

            lastPoll = new Date();

            for (const row of newRows) {
                yield row;
            }
        }
    }
}

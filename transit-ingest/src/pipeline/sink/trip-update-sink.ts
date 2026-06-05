import { LRUCache } from "lru-cache";
import { eq } from "drizzle-orm";
import * as tables from "database/models/tables";
import type { TripInstanceState } from "database/models/enums";
import type { Sink } from "../core/pipe";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Db } from "../../db/client";
import type { TripUpdateEntity, ParsedStopTimeUpdate } from "../transformer/trip-update-mapper";
import { TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType } from "../../gen/proto/gtfs-realtime_pb";
import {
    mapTripDescriptorScheduleRelationship,
    mapStopTimeUpdateScheduleRelationship,
    mapPickupDropoffType,
} from "../../utils/realtime-helpers";

// =========================================================
// Sink — all DB logic lives here
// =========================================================

/**
 * Custom sink that handles all DB operations for trip updates.
 * Receives structured TripUpdateEntity from the mapper.
 */
export class TripUpdateSink implements Sink<TripUpdateEntity> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private tripCache: LRUCache<string, any>;
    private stopCache: LRUCache<string, number>;
    private stopTimeCache: LRUCache<string, number>;

    constructor(
        private db: Db,
        private agencyId: string,
    ) {
        this.tripCache = new LRUCache({ max: 3000 });
        this.stopCache = new LRUCache({ max: 3000 });
        this.stopTimeCache = new LRUCache({ max: 3000 });
    }

    async run(ctx: Context, input: AsyncIterable<TripUpdateEntity>): Promise<void> {
        for await (const entity of input) {
            try {
                await this.processTripUpdate(ctx, entity);
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "TRIP_UPDATE_SINK_ERROR",
                        `Failed to process trip update for entity ${entity.entityId}`,
                        e,
                    ),
                );
                ctx.skipped++;
            }
        }
    }

    private async processTripUpdate(ctx: Context, entity: TripUpdateEntity): Promise<void> {
        // Lookup trip
        const trip = await this.getTrip(entity.coreTripId);
        if (!trip) {
            ctx.logger.debug(
                { tripSid: entity.coreTripId },
                "Trip not found in static data, skipping",
            );
            return;
        }

        // Lookup existing trip instance
        let tripInstance = await this.findTripInstance(trip.id, entity.startDate, entity.startTime);

        const newState = mapTripDescriptorScheduleRelationship(entity.scheduleRelationship);

        // If no trip instance and not NEW → skip
        if (!tripInstance && newState !== "DIRTY") {
            ctx.logger.debug(
                { tripSid: entity.coreTripId, startDate: entity.startDate, startTime: entity.startTime },
                "Trip instance not found and not NEW, skipping",
            );
            return;
        }

        // Create trip instance if it doesn't exist (NEW trip)
        if (!tripInstance) {
            tripInstance = await this.createTripInstance(
                ctx,
                trip.id,
                trip.routeId,
                trip.shapeId,
                entity.startDate,
                entity.startTime,
                newState,
            );
            if (!tripInstance) return;
        }

        // Process stop_time_updates
        const { created, updated } = await this.processStopTimeUpdates(
            ctx,
            tripInstance.id,
            trip.id,
            entity.stopTimeUpdates,
        );

        // Update trip instance state
        const finalState: TripInstanceState = newState === "REMOVED" ? "REMOVED" : "DIRTY";

        await this.db
            .update(tables.tripInstances)
            .set({ state: finalState, lastTripUpdateAt: new Date() })
            .where(eq(tables.tripInstances.id, tripInstance.id));

        ctx.logger.debug(
            {
                tripSid: entity.coreTripId,
                state: finalState,
                stopTimesCreated: created,
                stopTimesUpdated: updated,
            },
            "Trip update processed",
        );
    }

    // =========================================================
    // Trip lookup
    // =========================================================

    private async getTrip(
        tripSid: string,
    ): Promise<{ id: number; routeId: number; shapeId: number | null } | null> {
        const cached = this.tripCache.get(tripSid);
        if (cached !== undefined) return cached;

        const row = await this.db.query.trips.findFirst({
            where: { agencyId: this.agencyId, tripSid },
            columns: { id: true, routeId: true, shapeId: true },
        });

        if (!row || row.routeId == null) {
            this.tripCache.set(tripSid, null);
            return null;
        }

        const result = { id: row.id, routeId: row.routeId, shapeId: row.shapeId };
        this.tripCache.set(tripSid, result);
        return result;
    }

    // =========================================================
    // Trip instance lookup
    // =========================================================

    private async findTripInstance(
        tripId: number,
        startDate: string,
        startTime: string,
    ): Promise<{ id: number } | null> {
        const row = await this.db.query.tripInstances.findFirst({
            where: { tripId, startDate, startTime },
            columns: { id: true },
        });

        return row ?? null;
    }

    // =========================================================
    // Create trip instance
    // =========================================================

    private async createTripInstance(
        ctx: Context,
        tripId: number,
        routeId: number,
        shapeId: number | null,
        startDate: string,
        startTime: string,
        state: TripInstanceState,
    ): Promise<{ id: number } | null> {
        try {
            const startDatetime = this.computeStartDatetime(startDate, startTime);

            const [row] = await this.db
                .insert(tables.tripInstances)
                .values({
                    agencyId: this.agencyId,
                    tripId,
                    routeId,
                    shapeId: shapeId ?? undefined,
                    startDate,
                    startTime,
                    startDatetime,
                    state,
                })
                .onConflictDoUpdate({
                    target: [
                        tables.tripInstances.tripId,
                        tables.tripInstances.startDate,
                        tables.tripInstances.startTime,
                    ],
                    set: { state, lastTripUpdateAt: new Date() },
                })
                .returning({ id: tables.tripInstances.id });

            return row ?? null;
        } catch (e) {
            ctx.errors.push(
                recoverableError("TRIP_INSTANCE_CREATE_ERROR", "Failed to create trip instance", e),
            );
            return null;
        }
    }

    private computeStartDatetime(startDate: string, startTime: string): Date {
        const year = parseInt(startDate.substring(0, 4), 10);
        const month = parseInt(startDate.substring(4, 6), 10) - 1;
        const day = parseInt(startDate.substring(6, 8), 10);

        const parts = startTime.split(":");
        const hours = parseInt(parts[0] ?? "0", 10);
        const minutes = parseInt(parts[1] ?? "0", 10);
        const seconds = parseInt(parts[2] ?? "0", 10);

        const extraDays = Math.floor(hours / 24);
        return new Date(Date.UTC(year, month, day + extraDays, hours % 24, minutes, seconds));
    }

    // =========================================================
    // Stop time update processing
    // =========================================================

    private async processStopTimeUpdates(
        ctx: Context,
        tripInstanceId: number,
        tripId: number,
        stopTimeUpdates: ParsedStopTimeUpdate[],
    ): Promise<{ created: number; updated: number }> {
        let created = 0;
        let updated = 0;

        // Get existing realtime stop time instances
        const existingRows = await this.db.query.stopTimeRealtimeInstances.findMany({
            where: { tripInstanceId },
        });

        // Index for fast lookup
        const existingByStopId = new Map<number, (typeof existingRows)[number]>();
        const existingBySequence = new Map<number, (typeof existingRows)[number]>();
        for (const row of existingRows) {
            if (row.stopId != null) {
                existingByStopId.set(row.stopId, row);
            }
            existingBySequence.set(row.stopSequence, row);
        }

        for (const stu of stopTimeUpdates) {
            try {
                const result = await this.processOneStopTimeUpdate(
                    ctx,
                    tripInstanceId,
                    tripId,
                    stu,
                    existingByStopId,
                    existingBySequence,
                );
                if (result === "created") created++;
                else if (result === "updated") updated++;
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "STOP_TIME_UPDATE_ERROR",
                        `Failed to process stop_time_update (sequence: ${stu.stopSequence})`,
                        e,
                    ),
                );
            }
        }

        return { created, updated };
    }

    private async processOneStopTimeUpdate(
        ctx: Context,
        tripInstanceId: number,
        tripId: number,
        stu: ParsedStopTimeUpdate,
        existingByStopId: Map<number, { id: number; stopSequence: number; stopId: number | null }>,
        existingBySequence: Map<number, { id: number; stopSequence: number; stopId: number | null }>,
    ): Promise<"created" | "updated" | "skipped"> {
        const stopSequence = stu.stopSequence;

        // Resolve stop_id (DB PK) from stop_sid (GTFS string) — needed for lookup and write
        let resolvedStopId: number | null = null;
        if (stu.stopId) {
            resolvedStopId = await this.getStopId(stu.stopId);
        }

        // Match by resolved stop_id first (stop_sequence can drift in RT), fallback to stop_sequence
        let existing: { id: number; stopSequence: number; stopId: number | null } | undefined;
        if (resolvedStopId != null) {
            existing = existingByStopId.get(resolvedStopId);
        }
        if (!existing && stopSequence != null) {
            existing = existingBySequence.get(stopSequence);
        }

        // Resolve stop_time_id from static data
        // Use existing row's stop_sequence if matched (matches static schedule),
        // otherwise fall back to RT's stop_sequence
        let resolvedStopTimeId: number | null = null;
        const staticSequence = existing?.stopSequence ?? stopSequence;
        if (staticSequence != null) {
            resolvedStopTimeId = await this.getStopTimeId(tripId, staticSequence);
        }

        // Parse time fields
        const arrivalTimes = {
            scheduledTime: stu.arrival?.scheduledTime ?? null,
            time: stu.arrival?.time ?? null,
            delay: stu.arrival?.delay ?? null,
        };
        const departureTimes = {
            scheduledTime: stu.departure?.scheduledTime ?? null,
            time: stu.departure?.time ?? null,
            delay: stu.departure?.delay ?? null,
        };

        const scheduleRel = mapStopTimeUpdateScheduleRelationship(
            stu.scheduleRelationship,
        );

        // Extract stop_time_properties
        const props = stu.stopTimeProperties;
        const stopHeadsign = props?.stopHeadsign || undefined;
        const pickupType = props?.pickupType != null ? mapPickupDropoffType(props.pickupType as TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType) : undefined;
        const dropOffType = props?.dropOffType != null ? mapPickupDropoffType(props.dropOffType as TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType) : undefined;

        const toTimestamp = (secs: number | null): Date | null =>
            secs != null ? new Date(secs * 1000) : null;

        if (existing) {
            await this.db
                .update(tables.stopTimeRealtimeInstances)
                .set({
                    stopId: resolvedStopId ?? undefined,
                    stopTimeId: resolvedStopTimeId ?? undefined,
                    scheduledArrivalTime: toTimestamp(arrivalTimes.scheduledTime),
                    scheduledDepartureTime: toTimestamp(departureTimes.scheduledTime),
                    predictedArrivalTime: toTimestamp(arrivalTimes.time),
                    predictedDepartureTime: toTimestamp(departureTimes.time),
                    predictedArrivalUncertainty: stu.arrival?.uncertainty ?? undefined,
                    predictedDepartureUncertainty: stu.departure?.uncertainty ?? undefined,
                    scheduleRelationship: scheduleRel,
                    stopHeadsign,
                    pickupType,
                    dropOffType,
                    lastUpdatedAt: new Date(),
                })
                .where(eq(tables.stopTimeRealtimeInstances.id, existing.id));

            return "updated";
        } else {
            // Can't insert without a valid stop_sequence — skip if not provided and no static match
            if (stopSequence == null) {
                ctx.logger.debug(
                    { tripInstanceId, resolvedStopId },
                    "stop_time_update missing stop_sequence and no static match, skipping",
                );
                return "skipped";
            }

            const [inserted] = await this.db.insert(tables.stopTimeRealtimeInstances).values({
                tripInstanceId,
                stopTimeId: resolvedStopTimeId ?? undefined,
                stopSequence,
                stopId: resolvedStopId ?? undefined,
                scheduledArrivalTime: toTimestamp(arrivalTimes.scheduledTime),
                scheduledDepartureTime: toTimestamp(departureTimes.scheduledTime),
                predictedArrivalTime: toTimestamp(arrivalTimes.time),
                predictedDepartureTime: toTimestamp(departureTimes.time),
                predictedArrivalUncertainty: stu.arrival?.uncertainty ?? undefined,
                predictedDepartureUncertainty: stu.departure?.uncertainty ?? undefined,
                scheduleRelationship: scheduleRel,
                stopHeadsign,
                pickupType,
                dropOffType,
            }).returning({ id: tables.stopTimeRealtimeInstances.id });

            if (!inserted) {
                return "skipped";
            }

            // Update lookup maps with the real DB id
            if (resolvedStopId != null) {
                existingByStopId.set(resolvedStopId, {
                    id: inserted.id,
                    stopSequence,
                    stopId: resolvedStopId,
                });
            }
            if (stopSequence != null) {
                existingBySequence.set(stopSequence, {
                    id: inserted.id,
                    stopSequence,
                    stopId: resolvedStopId,
                });
            }

            return "created";
        }
    }

    // =========================================================
    // Stop lookup
    // =========================================================

    private async getStopId(stopSid: string): Promise<number | null> {
        const cached = this.stopCache.get(stopSid);
        if (cached !== undefined) return cached === -1 ? null : cached;

        const row = await this.db.query.stops.findFirst({
            where: { agencyId: this.agencyId, stopSid },
            columns: { id: true },
        });

        if (!row) {
            this.stopCache.set(stopSid, -1);
            return null;
        }

        this.stopCache.set(stopSid, row.id);
        return row.id;
    }

    // =========================================================
    // Stop time lookup
    // =========================================================

    private async getStopTimeId(tripId: number, stopSequence: number): Promise<number | null> {
        const key = `${tripId}:${stopSequence}`;
        const cached = this.stopTimeCache.get(key);
        if (cached !== undefined) return cached === -1 ? null : cached;

        const row = await this.db.query.stopTimes.findFirst({
            where: { tripId, stopSequence },
            columns: { id: true },
        });

        if (!row) {
            this.stopTimeCache.set(key, -1);
            return null;
        }

        this.stopTimeCache.set(key, row.id);
        return row.id;
    }
}

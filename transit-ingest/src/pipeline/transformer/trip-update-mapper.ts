import type { Transform } from "../core/pipe";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { ParsedEntity } from "./protobuf-decoder";
import { extractCoreTripId, normalizeTimes } from "../../utils/realtime-helpers";
import {
    TripDescriptor_ScheduleRelationship,
    TripUpdate_StopTimeUpdate_ScheduleRelationship,
} from "../../gen/proto/gtfs-realtime_pb";
import type { TripUpdate_StopTimeUpdate } from "../../gen/proto/gtfs-realtime_pb";

// =========================================================
// Output types — structured data, no DB
// =========================================================

interface ParsedStopTimeEvent {
    delay: number | null;
    time: number | null;
    uncertainty: number;
    scheduledTime: number | null;
}

export interface ParsedStopTimeUpdate {
    stopSequence: number;
    stopId: string;
    arrival: ParsedStopTimeEvent | null;
    departure: ParsedStopTimeEvent | null;
    scheduleRelationship: TripUpdate_StopTimeUpdate_ScheduleRelationship;
    departureOccupancyStatus: number;
    stopTimeProperties: {
        assignedStopId: string;
        stopHeadsign: string;
        pickupType: number;
        dropOffType: number;
    } | null;
}

export interface TripUpdateEntity {
    type: "trip_update";
    entityId: string;
    coreTripId: string;
    startDate: string;
    startTime: string;
    scheduleRelationship: TripDescriptor_ScheduleRelationship;
    stopTimeUpdates: ParsedStopTimeUpdate[];
    feedTimestamp: bigint;
}

function mapStEvent(
    event: { delay: number; time: bigint; uncertainty: number; scheduledTime: bigint } | undefined,
    allowScheduledTime: boolean,
): ParsedStopTimeEvent | null {
    if (!event) return null;
    // Proto int64 defaults to 0n when not set — coerce to null for time/scheduledTime
    // (delay=0 is valid "on time", must NOT be filtered)
    const time = event.time !== 0n ? event.time : null;
    const scheduledTime = event.scheduledTime !== 0n ? event.scheduledTime : null;
    const normalized = normalizeTimes(
        allowScheduledTime ? scheduledTime : null,
        time,
        event.delay,
    );
    // scheduled_time is forbidden for non-NEW/REPLACEMENT/DUPLICATED — strip after normalization
    return {
        delay: normalized.delay,
        time: normalized.time,
        uncertainty: event.uncertainty,
        scheduledTime: allowScheduledTime ? normalized.scheduledTime : null,
    };
}

// =========================================================
// Mapper — pure transform, no DB
// =========================================================

/**
 * Transforms protobuf FeedEntity (with trip_update) into structured data.
 * No DB access. All DB logic lives in TripUpdateSink.
 */
export class TripUpdateMapper implements Transform<ParsedEntity, TripUpdateEntity> {
    async *run(ctx: Context, input: AsyncIterable<ParsedEntity>): AsyncIterable<TripUpdateEntity> {
        for await (const { entity, feedTimestamp } of input) {
            if (!entity.tripUpdate) continue;

            try {
                const result = this.map(entity, feedTimestamp);
                if (result) yield result;
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "TRIP_UPDATE_MAP_ERROR",
                        `Failed to map trip update for entity ${entity.id}`,
                        e,
                    ),
                );
                ctx.skipped++;
            }
        }
    }

    private map(entity: ParsedEntity["entity"], feedTimestamp: bigint): TripUpdateEntity | null {
        const tripUpdate = entity.tripUpdate!;
        const tripDescriptor = tripUpdate.trip;

        if (!tripDescriptor?.tripId) {
            return null;
        }

        // For DUPLICATED trips, use TripProperties for the new trip identity
        const isDuplicated =
            tripDescriptor.scheduleRelationship === TripDescriptor_ScheduleRelationship.DUPLICATED;
        const tripProps = isDuplicated ? tripUpdate.tripProperties : undefined;

        const coreTripId = tripProps?.tripId
            ? extractCoreTripId(tripProps.tripId)
            : extractCoreTripId(tripDescriptor.tripId);
        const startDate = tripProps?.startDate || tripDescriptor.startDate;
        const startTime = tripProps?.startTime || tripDescriptor.startTime;

        if (!startDate || !startTime) {
            return null;
        }

        // Sort by stop_sequence per spec: "updates must be sorted by stop_sequence"
        const sortedStus = [...tripUpdate.stopTimeUpdate].sort(
            (a, b) => a.stopSequence - b.stopSequence,
        );

        // Propagate delay across SKIPPED stops per spec:
        // "Delay from a previous stop propagates over the SKIPPED stop"
        let lastArrivalDelay: number | null = null;
        let lastDepartureDelay: number | null = null;

        const stopTimeUpdates = sortedStus.map((stu) => {
            const mapped = this.mapStopTimeUpdate(
                stu,
                tripDescriptor.scheduleRelationship,
                lastArrivalDelay,
                lastDepartureDelay,
            );

            // Track last known delay for propagation across SKIPPED stops
            if (stu.scheduleRelationship !== TripUpdate_StopTimeUpdate_ScheduleRelationship.SKIPPED) {
                if (mapped.arrival?.delay != null) lastArrivalDelay = mapped.arrival.delay;
                if (mapped.departure?.delay != null) lastDepartureDelay = mapped.departure.delay;
            }

            return mapped;
        });

        return {
            type: "trip_update",
            entityId: entity.id,
            coreTripId,
            startDate,
            startTime,
            scheduleRelationship: tripDescriptor.scheduleRelationship,
            stopTimeUpdates,
            feedTimestamp,
        };
    }

    private mapStopTimeUpdate(
        stu: TripUpdate_StopTimeUpdate,
        tripScheduleRelationship: TripDescriptor_ScheduleRelationship,
        propagatedArrivalDelay: number | null,
        propagatedDepartureDelay: number | null,
    ): ParsedStopTimeUpdate {
        const isSkipped =
            stu.scheduleRelationship === TripUpdate_StopTimeUpdate_ScheduleRelationship.SKIPPED;

        const isNoData =
            stu.scheduleRelationship === TripUpdate_StopTimeUpdate_ScheduleRelationship.NO_DATA;

        const allowScheduledTime =
            tripScheduleRelationship === TripDescriptor_ScheduleRelationship.NEW ||
            tripScheduleRelationship === TripDescriptor_ScheduleRelationship.REPLACEMENT ||
            tripScheduleRelationship === TripDescriptor_ScheduleRelationship.DUPLICATED;

        let arrival = isSkipped || isNoData ? null : mapStEvent(stu.arrival, allowScheduledTime);
        let departure = isSkipped || isNoData ? null : mapStEvent(stu.departure, allowScheduledTime);

        // Propagate delay across SKIPPED stops per spec
        if (isSkipped && arrival == null && departure == null) {
            if (propagatedArrivalDelay != null) {
                arrival = { delay: propagatedArrivalDelay, time: null, uncertainty: 0, scheduledTime: null };
            }
            if (propagatedDepartureDelay != null) {
                departure = { delay: propagatedDepartureDelay, time: null, uncertainty: 0, scheduledTime: null };
            }
        }

        return {
            stopSequence: stu.stopSequence,
            stopId: stu.stopId,
            arrival,
            departure,
            scheduleRelationship: stu.scheduleRelationship,
            departureOccupancyStatus: stu.departureOccupancyStatus,
            stopTimeProperties: stu.stopTimeProperties
                ? {
                      assignedStopId: stu.stopTimeProperties.assignedStopId,
                      stopHeadsign: stu.stopTimeProperties.stopHeadsign,
                      pickupType: stu.stopTimeProperties.pickupType,
                      dropOffType: stu.stopTimeProperties.dropOffType,
                  }
                : null,
        };
    }
}

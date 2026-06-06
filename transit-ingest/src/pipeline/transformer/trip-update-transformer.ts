import type { TripInstanceState } from "database";
import * as tables from "database/models/tables";
import type { TripUpdate } from "../../gen/proto/gtfs-realtime_pb";
import { TripDescriptor_ScheduleRelationship } from "../../gen/proto/gtfs-realtime_pb";
import {
    extractCoreTripSid,
    mapPickupDropoffType,
    mapStopTimeUpdateScheduleRelationship,
    mapTripDescriptorScheduleRelationship,
    normalizeTimes,
} from "../../utils/realtime-helpers";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Transform } from "../core/pipe";
import type { ParsedEntity } from "./protobuf-decoder";

export interface TransformedTripUpdate {
    tripInstanceId?: number;
    tripSid: string;
    tripId: number;
    routeId: number;
    shapeId: number | null;
    startDate: string;
    startTime: string;
    state: TripInstanceState;
    stopTimeInstancesToUpsert?: (typeof tables.stopTimeRealtimeInstances.$inferInsert)[];
}

export class TripUpdateTransformer implements Transform<ParsedEntity, TransformedTripUpdate> {
    async *run(
        ctx: Context,
        input: AsyncIterable<ParsedEntity>,
    ): AsyncIterable<TransformedTripUpdate> {
        for await (const { entity, feedTimestamp } of input) {
            if (!entity.tripUpdate) continue;

            try {
                const result = await this.transform(ctx, entity.tripUpdate, feedTimestamp);
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

    /**
     * GTFS RT Spec: For DUPLICATED trips, use TripProperties for the new trip identity
     */
    private resolveTripIdentity(tripUpdate: TripUpdate) {
        const tripDescriptor = tripUpdate.trip;
        if (!tripDescriptor?.tripId) return null;

        const isDuplicated =
            tripDescriptor.scheduleRelationship === TripDescriptor_ScheduleRelationship.DUPLICATED;

        const tripProps = isDuplicated ? tripUpdate.tripProperties : null;

        const resolvedTrip = tripProps ?? tripDescriptor;
        return {
            coreTripSid: extractCoreTripSid(resolvedTrip.tripId),
            startDate: resolvedTrip.startDate,
            startTime: resolvedTrip.startTime,
        };
    }

    private async getTrip(ctx: Context, tripSid: string) {
        const trip = await ctx.db.query.trips.findFirst({
            where: { agencyId: ctx.config.agencyId, tripSid },
            columns: { id: true, routeId: true, shapeId: true },
        });

        return trip;
    }

    private async getTripInstance(
        ctx: Context,
        tripId: number,
        startDate: string,
        startTime: string,
    ) {
        const tripInstance = await ctx.db.query.tripInstances.findFirst({
            where: { tripId, startDate, startTime },
        });

        return tripInstance;
    }

    private async transform(
        ctx: Context,
        tripUpdate: TripUpdate,
        feedTimestamp: bigint,
    ): Promise<TransformedTripUpdate | null> {
        const resolvedTripIdentity = this.resolveTripIdentity(tripUpdate);

        if (!resolvedTripIdentity) {
            //  TODO: use neverthrow
            return null;
        }

        const { coreTripSid, startDate, startTime } = resolvedTripIdentity;
        if (!startDate || !startTime) {
            // TODO: use neverthrow
            return null;
        }

        const newTripInstanceState: TripInstanceState = tripUpdate.trip
            ? mapTripDescriptorScheduleRelationship(tripUpdate.trip?.scheduleRelationship)
            : "DIRTY";

        const trip = await this.getTrip(ctx, coreTripSid);
        if (!trip) {
            ctx.logger.debug({ tripSid: coreTripSid }, "Trip not found in static data, skipping");
            return null; // TODO: use neverthrow
        }

        const tripInstance = await this.getTripInstance(ctx, trip.id, startDate, startTime);

        // Design decision: accept that if this is a new trip being created, on the first RT update,
        //                  tripInstance has NOT been created. Hence, at this point, stopTimeInstances
        //                  will be empty (no rows in stopTimeStaticInstances view).
        //                  That is, we accept 2 RT data ingest before data is fully correct.
        if (!tripInstance) {
            return {
                tripSid: coreTripSid,
                startDate,
                startTime,
                tripId: trip.id,
                routeId: trip.routeId,
                shapeId: trip.shapeId,
                state: newTripInstanceState,
            };
        }

        const stopTimeInstances = await ctx.db.query.stopTimeInstances.findMany({
            where: { tripInstanceId: tripInstance?.id },
            with: { stop: true },
            orderBy: { stopSequence: "asc" },
        });

        // GTFS RT Spec: updates must be sorted by stop_sequence to allow propagating delays
        const sortedStopTimeUpdates = tripUpdate.stopTimeUpdate.toSorted(
            (a, b) => a.stopSequence - b.stopSequence,
        );

        const updatedStopTimeInstances: Record<
            (typeof tables.stopTimeRealtimeInstances.$inferInsert)["stopSequence"],
            typeof tables.stopTimeRealtimeInstances.$inferInsert
        > = {};
        for (const stu of sortedStopTimeUpdates) {
            // Match by stop id first and then by stop sequence if no stop id
            const sti = stopTimeInstances.find(
                (stiToComp) =>
                    (stiToComp.stop?.stopSid &&
                        stu.stopId &&
                        stiToComp.stop.stopSid === stu.stopId) ||
                    stiToComp.stopSequence === stu.stopSequence,
            );

            if (!sti) {
                continue; // This really should happen per design decision above.
                // TODO: figure out how to handle this
            }

            // Resolve new stop id if needed (i.e was matched by stop seq instead of stop id)
            let stopId = sti.stopId;
            if (stu.stopId !== sti?.stop?.stopSid) {
                const stop = await ctx.db.query.stops.findFirst({
                    where: { agencyId: ctx.config.agencyId, stopSid: stu.stopId },
                    columns: { id: true },
                });

                if (!stop) {
                    continue; // TODO: figure out how to handle this
                }
                stopId = stop.id;
            }

            // IMPORTANT: Some agencies uses 0 for scheduledTime to imply no scheduled time.
            //            Thus we use || to handle that case.
            const arrival = normalizeTimes(
                stu.arrival?.scheduledTime || sti.scheduledArrivalTime,
                stu.arrival?.time,
                stu.arrival?.delay,
            );
            const departure = normalizeTimes(
                stu.departure?.scheduledTime || sti.scheduledDepartureTime,
                stu.departure?.time,
                stu.departure?.delay,
            );

            updatedStopTimeInstances[stu.stopSequence] = {
                id: sti.id ?? undefined,
                tripInstanceId: tripInstance.id,
                stopSequence: stu.stopSequence,
                stopId,
                scheduledArrivalTime: this.posixToDate(arrival.scheduledTime),
                scheduledDepartureTime: this.posixToDate(departure.scheduledTime),
                predictedArrivalTime: this.posixToDate(arrival.time),
                predictedDepartureTime: this.posixToDate(departure.time),
                predictedArrivalUncertainty: stu.arrival?.uncertainty,
                predictedDepartureUncertainty: stu.departure?.uncertainty,
                scheduleRelationship: mapStopTimeUpdateScheduleRelationship(
                    stu.scheduleRelationship,
                ),
                stopHeadsign: stu.stopTimeProperties?.stopHeadsign ?? sti.stopHeadsign,
                pickupType: stu.stopTimeProperties?.pickupType
                    ? mapPickupDropoffType(stu.stopTimeProperties.pickupType)
                    : sti.pickupType,
                dropOffType: stu.stopTimeProperties?.dropOffType
                    ? mapPickupDropoffType(stu.stopTimeProperties.dropOffType)
                    : sti.dropOffType,
                lastUpdatedAt: new Date(), // TODO: use feedTimestamp
            };
        }

        // Stop time delay propagation (per GTFS RT spec)
        for (let i = 1; i < stopTimeInstances.length; i++) {
            const sti = stopTimeInstances[i];
            if (!sti) continue;

            if (sti.stopSequence && !updatedStopTimeInstances[sti?.stopSequence]) {
                const lastUpdatedSti = Object.values(updatedStopTimeInstances).findLast(
                    (usti) => usti.stopSequence < sti.stopSequence,
                );

                if (!lastUpdatedSti) continue;

                const arrivalDelayMs =
                    lastUpdatedSti.predictedArrivalTime && lastUpdatedSti.scheduledArrivalTime
                        ? lastUpdatedSti.predictedArrivalTime.getTime() -
                          lastUpdatedSti.scheduledArrivalTime.getTime()
                        : null;
                const departureDelayMs =
                    lastUpdatedSti.predictedDepartureTime && lastUpdatedSti.scheduledDepartureTime
                        ? lastUpdatedSti.predictedDepartureTime.getTime() -
                          lastUpdatedSti.scheduledDepartureTime.getTime()
                        : null;

                updatedStopTimeInstances[sti.stopSequence] = {
                    ...sti,
                    id: undefined,
                    predictedArrivalTime: this.posixToDate(
                        sti.scheduledArrivalTime && arrivalDelayMs !== null
                            ? (sti.scheduledArrivalTime.getTime() + arrivalDelayMs) / 1000
                            : null,
                    ),
                    predictedDepartureTime: this.posixToDate(
                        sti.scheduledDepartureTime && departureDelayMs !== null
                            ? (sti.scheduledDepartureTime.getTime() + departureDelayMs) / 1000
                            : null,
                    ),
                };
            }
        }

        return {
            tripInstanceId: tripInstance.id,
            state: newTripInstanceState,
            tripSid: coreTripSid,
            startDate,
            startTime,
            tripId: trip.id,
            routeId: trip.routeId,
            shapeId: trip.shapeId,
            stopTimeInstancesToUpsert: Object.values(updatedStopTimeInstances),
        };
    }

    private posixToDate(posix: number | null | undefined): Date | null {
        return posix === null || posix === undefined ? null : new Date(posix * 1000);
    }
}

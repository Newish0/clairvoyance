import { fromAsyncThrowable } from "neverthrow";
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
import { type ItemResult, itemOk, skipItem } from "../core/error";
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
    ): AsyncIterable<ItemResult<TransformedTripUpdate>> {
        for await (const { entity, feedTimestamp } of input) {
            if (!entity.tripUpdate) continue;
            yield await this.transform(ctx, entity.tripUpdate, feedTimestamp);
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

    private getTrip(ctx: Context, tripSid: string) {
        return fromAsyncThrowable(
            () => ctx.db.query.trips.findFirst({
                where: { agencyId: ctx.config.agencyId, tripSid },
                columns: { id: true, routeId: true, shapeId: true },
            }),
            (e: unknown) => e,
        )();
    }

    private getTripInstance(
        ctx: Context,
        tripId: number,
        startDate: string,
        startTime: string,
    ) {
        return fromAsyncThrowable(
            () => ctx.db.query.tripInstances.findFirst({
                where: { tripId, startDate, startTime },
            }),
            (e: unknown) => e,
        )();
    }

    private async transform(
        ctx: Context,
        tripUpdate: TripUpdate,
        feedTimestamp: bigint,
    ): Promise<ItemResult<TransformedTripUpdate>> {
        const resolvedTripIdentity = this.resolveTripIdentity(tripUpdate);

        if (!resolvedTripIdentity) {
            return skipItem("NO_TRIP_IDENTITY", "Trip update has no resolvable trip identity");
        }

        const { coreTripSid, startDate, startTime } = resolvedTripIdentity;
        if (!startDate || !startTime) {
            return skipItem(
                "MISSING_START_DATE_OR_TIME",
                `Trip ${coreTripSid} has no startDate or startTime`,
            );
        }

        const newTripInstanceState: TripInstanceState = tripUpdate.trip
            ? mapTripDescriptorScheduleRelationship(tripUpdate.trip?.scheduleRelationship)
            : "DIRTY";

        const tripResult = await this.getTrip(ctx, coreTripSid);
        if (tripResult.isErr()) {
            return skipItem("TRIP_DB_ERROR", `DB error fetching trip ${coreTripSid}`, tripResult.error);
        }
        const trip = tripResult.value;
        if (!trip) {
            ctx.logger.debug({ tripSid: coreTripSid }, "Trip not found in static data, skipping");
            return skipItem("TRIP_NOT_FOUND", `Trip ${coreTripSid} not in static data`);
        }

        const tripInstanceResult = await this.getTripInstance(ctx, trip.id, startDate, startTime);
        if (tripInstanceResult.isErr()) {
            return skipItem(
                "TRIP_INSTANCE_DB_ERROR",
                `DB error fetching trip instance for trip ${coreTripSid}`,
                tripInstanceResult.error,
            );
        }
        const tripInstance = tripInstanceResult.value;

        // Design decision: accept that if this is a new trip being created, on the first RT update,
        //                  tripInstance has NOT been created. Hence, at this point, stopTimeInstances
        //                  will be empty (no rows in stopTimeStaticInstances view).
        //                  That is, we accept 2 RT data ingest before data is fully correct.
        if (!tripInstance) {
            return itemOk({
                tripSid: coreTripSid,
                startDate,
                startTime,
                tripId: trip.id,
                routeId: trip.routeId,
                shapeId: trip.shapeId,
                state: newTripInstanceState,
            });
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
            const sti = stopTimeInstances.find(
                (stiToComp) =>
                    (stiToComp.stop?.stopSid &&
                        stu.stopId &&
                        stiToComp.stop.stopSid === stu.stopId) ||
                    stiToComp.stopSequence === stu.stopSequence,
            );

            if (!sti) {
                continue;
            }

            let stopId = sti.stopId;
            if (stu.stopId !== sti?.stop?.stopSid) {
                const stop = await ctx.db.query.stops.findFirst({
                    where: { agencyId: ctx.config.agencyId, stopSid: stu.stopId },
                    columns: { id: true },
                });

                if (!stop) {
                    continue;
                }
                stopId = stop.id;
            }

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

        return itemOk({
            tripInstanceId: tripInstance.id,
            state: newTripInstanceState,
            tripSid: coreTripSid,
            startDate,
            startTime,
            tripId: trip.id,
            routeId: trip.routeId,
            shapeId: trip.shapeId,
            stopTimeInstancesToUpsert: Object.values(updatedStopTimeInstances),
        });
    }

    private posixToDate(posix: number | null | undefined): Date | null {
        return posix === null || posix === undefined ? null : new Date(posix * 1000);
    }
}

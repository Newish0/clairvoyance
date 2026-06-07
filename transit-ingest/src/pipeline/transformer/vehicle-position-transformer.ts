import type {
    CongestionLevel,
    OccupancyStatus,
    VehicleStopStatus,
    WheelchairBoarding,
} from "database/models/enums";
import { fromAsyncThrowable } from "neverthrow";
import type { VehiclePosition } from "../../gen/proto/gtfs-realtime_pb";
import {
    extractCoreTripSid,
    mapCongestionLevel,
    mapOccupancyStatus,
    mapVehicleStopStatus,
    mapWheelchairAccessible,
} from "../../utils/realtime-helpers";
import type { Context } from "../core/context";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import type { Transform } from "../core/pipe";
import type { ParsedEntity } from "./protobuf-decoder";

export interface TransformedVehiclePosition {
    vehicleSid: string;
    vehicleLabel: string | null;
    vehicleLicensePlate: string | null;
    vehicleWheelchairAccessible: WheelchairBoarding | null;

    tripInstanceId: number | null;
    stopId: number | null;

    timestamp: Date;
    location: { x: number; y: number };
    currentStopSequence: number | null;
    currentStatus: VehicleStopStatus | null;
    congestionLevel: CongestionLevel | null;
    occupancyStatus: OccupancyStatus;
    occupancyPercentage: number | null;
    bearing: number | null;
    odometer: number | null;
    speed: number | null;
}

export class VehiclePositionTransformer implements Transform<
    ParsedEntity,
    TransformedVehiclePosition
> {
    async *run(
        ctx: Context,
        input: AsyncIterable<ParsedEntity>,
    ): AsyncIterable<ItemResult<TransformedVehiclePosition>> {
        for await (const { entity, feedTimestamp } of input) {
            if (!entity.vehicle) continue;
            yield await this.transform(ctx, entity.vehicle, feedTimestamp);
        }
    }

    private getTrip(ctx: Context, tripSid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.trips.findFirst({
                    where: { agencyId: ctx.config.agencyId, tripSid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private getTripInstance(ctx: Context, tripId: number, startDate: string, startTime: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.tripInstances.findFirst({
                    where: { tripId, startDate, startTime },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private getStop(ctx: Context, stopSid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.stops.findFirst({
                    where: { agencyId: ctx.config.agencyId, stopSid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private async transform(
        ctx: Context,
        vehicle: VehiclePosition,
        feedTimestamp: bigint,
    ): Promise<ItemResult<TransformedVehiclePosition>> {
        const vehicleDescriptor = vehicle.vehicle;
        if (!vehicleDescriptor?.id) {
            return skipItem(
                "NO_VEHICLE_IDENTITY",
                "Vehicle position has no vehicle descriptor or id",
            );
        }
        const vehicleSid = vehicleDescriptor.id;

        let tripInstanceId: number | null = null;
        const tripDescriptor = vehicle.trip;
        if (tripDescriptor?.tripId && tripDescriptor.startDate && tripDescriptor.startTime) {
            const coreTripSid = extractCoreTripSid(tripDescriptor.tripId);
            const tripResult = await this.getTrip(ctx, coreTripSid);
            if (tripResult.isErr()) {
                return skipItem(
                    "TRIP_DB_ERROR",
                    `DB error fetching trip ${coreTripSid}`,
                    tripResult.error,
                );
            }
            if (!tripResult.value) {
                ctx.logger.debug(
                    { vehicleSid, tripSid: coreTripSid, agencyId: ctx.config.agencyId },
                    "Trip not found in static data; vehicle tracked without trip",
                );
            } else {
                const tiResult = await this.getTripInstance(
                    ctx,
                    tripResult.value.id,
                    tripDescriptor.startDate,
                    tripDescriptor.startTime,
                );
                if (tiResult.isErr()) {
                    return skipItem(
                        "TRIP_INSTANCE_DB_ERROR",
                        `DB error fetching trip instance for trip ${coreTripSid}`,
                        tiResult.error,
                    );
                }
                if (tiResult.value) {
                    tripInstanceId = tiResult.value.id;
                }
            }
        }

        let stopId: number | null = null;
        if (vehicle.stopId) {
            const stopResult = await this.getStop(ctx, vehicle.stopId);
            if (stopResult.isErr()) {
                return skipItem(
                    "STOP_DB_ERROR",
                    `DB error fetching stop ${vehicle.stopId}`,
                    stopResult.error,
                );
            }
            if (!stopResult.value) {
                ctx.logger.debug(
                    { vehicleSid, stopSid: vehicle.stopId },
                    "Stop not found in static data",
                );
            } else {
                stopId = stopResult.value.id;
            }
        }

        const timestamp =
            vehicle.timestamp !== 0n
                ? new Date(Number(vehicle.timestamp) * 1000)
                : new Date(Number(feedTimestamp) * 1000);

        if (!vehicle.position) {
            return skipItem("NO_POSITION_DATA", "Vehicle position has no coordinates");
        }
        const position = vehicle.position;
        if (!position.latitude && !position.longitude) {
            return skipItem(
                "NO_COORDINATES",
                "Position lat/lng both exactly zero - treat as no data",
            );
        }
        const location: { x: number; y: number } = { x: position.longitude, y: position.latitude };
        const bearing: number | null = position.bearing ?? null;
        const odometer: number | null = position.odometer ?? null;
        const speed: number | null = position.speed ?? null;

        const currentStopSequence = vehicle.currentStopSequence;
        const currentStatus = mapVehicleStopStatus(vehicle.currentStatus);
        const congestionLevel = mapCongestionLevel(vehicle.congestionLevel);
        const occupancyStatus = mapOccupancyStatus(vehicle.occupancyStatus);
        const occupancyPercentage = vehicle.occupancyPercentage;

        return itemOk({
            vehicleSid,
            vehicleLabel: vehicleDescriptor.label || null,
            vehicleLicensePlate: vehicleDescriptor.licensePlate || null,
            vehicleWheelchairAccessible:
                mapWheelchairAccessible(vehicleDescriptor.wheelchairAccessible) ?? null,

            tripInstanceId,
            stopId,

            timestamp,
            location,
            currentStopSequence,
            currentStatus,
            congestionLevel,
            occupancyStatus,
            occupancyPercentage,
            bearing,
            odometer,
            speed,
        });
    }
}

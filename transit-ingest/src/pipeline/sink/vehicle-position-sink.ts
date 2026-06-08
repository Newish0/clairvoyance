import * as tables from "database/models/tables";
import { eq } from "drizzle-orm";
import { upsertMany } from "../../db/upsert";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Sink } from "../core/pipe";
import type { TransformedVehiclePosition } from "../transformer/vehicle-position-transformer";

export class VehiclePositionSink implements Sink<TransformedVehiclePosition> {
    async run(ctx: Context, input: AsyncIterable<TransformedVehiclePosition>): Promise<void> {
        for await (const vp of input) {
            try {
                await this.processOne(ctx, vp);
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "VEHICLE_POSITION_SINK_ERROR",
                        `Failed to process vehicle position for vehicle ${vp.vehicleSid}`,
                        e,
                    ),
                );
                ctx.skipped++;
            }
        }
    }

    private async processOne(ctx: Context, vp: TransformedVehiclePosition): Promise<void> {
        const vehicleId = await this.upsertVehicle(ctx, vp);

        if (!vehicleId) {
            throw new Error(`Could not upsert vehicle ${vp.vehicleSid}`);
        }

        await this.upsertPosition(ctx, vp, vehicleId);

        if (vp.tripInstanceId !== null) {
            await ctx.db
                .update(tables.tripInstances)
                .set({ vehicleId, state: "DIRTY" })
                .where(eq(tables.tripInstances.id, vp.tripInstanceId));
        }
    }

    private async upsertVehicle(ctx: Context, vp: TransformedVehiclePosition) {
        const [row] = await ctx.db
            .insert(tables.vehicles)
            .values({
                agencyId: ctx.config.agencyId,
                vehicleSid: vp.vehicleSid,
                label: vp.vehicleLabel,
                licensePlate: vp.vehicleLicensePlate,
                wheelchairAccessible: vp.vehicleWheelchairAccessible,
            })
            .onConflictDoUpdate({
                target: [tables.vehicles.agencyId, tables.vehicles.vehicleSid],
                set: {
                    label: vp.vehicleLabel,
                    licensePlate: vp.vehicleLicensePlate,
                    wheelchairAccessible: vp.vehicleWheelchairAccessible,
                },
            })
            .returning({ id: tables.vehicles.id });

        return row?.id;
    }

    private async upsertPosition(
        ctx: Context,
        vp: TransformedVehiclePosition,
        vehicleId: number,
    ): Promise<void> {
        await upsertMany(
            ctx.db,
            tables.vehiclePositions,
            [
                {
                    vehicleId,
                    tripInstanceId: vp.tripInstanceId,
                    timestamp: vp.timestamp,
                    location: vp.location,
                    stopId: vp.stopId,
                    currentStopSequence: vp.currentStopSequence,
                    currentStatus: vp.currentStatus,
                    congestionLevel: vp.congestionLevel,
                    occupancyStatus: vp.occupancyStatus,
                    occupancyPercentage: vp.occupancyPercentage,
                    bearing: vp.bearing,
                    odometer: vp.odometer,
                    speed: vp.speed,
                    shapeDistTraveled: vp.shapeDistTraveled,
                },
            ],
            [tables.vehiclePositions.vehicleId, tables.vehiclePositions.timestamp],
        );
    }
}

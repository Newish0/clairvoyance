import type { Transform } from "../core/pipe";
import { stopTimes } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { recoverableError } from "../core/error";
import {
    type pickupDropOffEnum,
    type timepointEnum,
} from "database/models/enums";

const PICKUP_DROP_OFF_MAPPING: Record<
    string,
    (typeof pickupDropOffEnum.enumValues)[number]
> = {
    "0": "REGULAR",
    "1": "NO_PICKUP_OR_DROP_OFF",
    "2": "PHONE_AGENCY",
    "3": "COORDINATE_WITH_DRIVER",
};

const TIMEPOINT_MAPPING: Record<string, (typeof timepointEnum.enumValues)[number]> = {
    "0": "APPROXIMATE",
    "1": "EXACT",
};

export class StopTimeTransformer implements Transform<CsvRow, typeof stopTimes.$inferInsert> {
    private stopTimeInsertSchema = createInsertSchema(stopTimes);
    private tripCache = new Map<string, number | null>();
    private stopCache = new Map<string, number | null>();

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof stopTimes.$inferInsert> {
        for await (const row of input) {
            const tripSid = row["trip_id"];
            const stopSid = row["stop_id"];

            const tripId = tripSid ? await this.lookupTrip(ctx, tripSid) : null;
            const stopId = stopSid ? await this.lookupStop(ctx, stopSid) : null;

            const stopTime = this.stopTimeInsertSchema({
                agencyId: this.agencyId,
                tripSid,
                stopSid,
                stopSequence: row["stop_sequence"] ? parseInt(row["stop_sequence"], 10) : undefined,
                tripId: tripId ?? undefined,
                stopId: stopId ?? undefined,
                arrivalTime: row["arrival_time"] ?? null,
                departureTime: row["departure_time"] ?? null,
                stopHeadsign: row["stop_headsign"] ?? null,
                pickupType: row["pickup_type"]
                    ? (PICKUP_DROP_OFF_MAPPING[row["pickup_type"]] ?? null)
                    : null,
                dropOffType: row["drop_off_type"]
                    ? (PICKUP_DROP_OFF_MAPPING[row["drop_off_type"]] ?? null)
                    : null,
                timepoint: row["timepoint"]
                    ? (TIMEPOINT_MAPPING[row["timepoint"]] ?? null)
                    : null,
                shapeDistTraveled: row["shape_dist_traveled"]
                    ? parseFloat(row["shape_dist_traveled"])
                    : null,
            });

            if (stopTime instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Stop time row validation failed: ${stopTime.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield stopTime;
            }
        }
    }

    private async lookupTrip(ctx: Context, tripSid: string): Promise<number | null> {
        if (this.tripCache.has(tripSid)) {
            return this.tripCache.get(tripSid)!;
        }

        const result = await ctx.db.query.trips.findFirst({
            where: { agencyId: this.agencyId, tripSid },
            columns: { id: true },
        });

        const tripId = result?.id ?? null;

        if (tripId === null) {
            ctx.logger.warn({ tripSid, agencyId: this.agencyId }, "Trip not found");
        }

        this.tripCache.set(tripSid, tripId);
        return tripId;
    }

    private async lookupStop(ctx: Context, stopSid: string): Promise<number | null> {
        if (this.stopCache.has(stopSid)) {
            return this.stopCache.get(stopSid)!;
        }

        const result = await ctx.db.query.stops.findFirst({
            where: { agencyId: this.agencyId, stopSid },
            columns: { id: true },
        });

        const stopId = result?.id ?? null;

        if (stopId === null) {
            ctx.logger.warn({ stopSid, agencyId: this.agencyId }, "Stop not found");
        }

        this.stopCache.set(stopSid, stopId);
        return stopId;
    }
}

import type { Transform } from "../core/pipe";
import { eq, sql } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import { shapes, stopTimes } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import { type pickupDropOffEnum, type timepointEnum } from "database/models/enums";

const PICKUP_DROP_OFF_MAPPING: Record<string, (typeof pickupDropOffEnum.enumValues)[number]> = {
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
    private tripCache: LRUCache<string, { tripId: number | null; shapeId: number | null }>;
    private stopCache: LRUCache<
        string,
        { stopId: number | null; location: { lat: number; lng: number } | null }
    >;

    constructor(public agencyId: string) {
        this.tripCache = new LRUCache({ max: 10000 });
        this.stopCache = new LRUCache({ max: 10000 });
    }

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof stopTimes.$inferInsert>> {
        for await (const row of input) {
            yield await this.transformRow(ctx, row);
        }
    }

    private async transformRow(
        ctx: Context,
        row: CsvRow,
    ): Promise<ItemResult<typeof stopTimes.$inferInsert>> {
        const tripSid = row["trip_id"];
        const stopSid = row["stop_id"];

        const trip = tripSid
            ? await this.lookupTrip(ctx, tripSid)
            : { tripId: null, shapeId: null };
        const stop = stopSid
            ? await this.lookupStop(ctx, stopSid)
            : { stopId: null, location: null };

        const shapeDistTraveled = await this.resolveShapeDistTraveled(
            ctx,
            row,
            trip.shapeId,
            stop.location,
        );

        const stopTime = this.stopTimeInsertSchema({
            agencyId: this.agencyId,
            tripSid,
            stopSid,
            stopSequence: row["stop_sequence"] ? parseInt(row["stop_sequence"], 10) : undefined,
            tripId: trip.tripId ?? undefined,
            stopId: stop.stopId ?? undefined,
            arrivalTime: row["arrival_time"] || null,
            departureTime: row["departure_time"] || null,
            stopHeadsign: row["stop_headsign"] || null,
            pickupType: row["pickup_type"]
                ? (PICKUP_DROP_OFF_MAPPING[row["pickup_type"]] ?? null)
                : null,
            dropOffType: row["drop_off_type"]
                ? (PICKUP_DROP_OFF_MAPPING[row["drop_off_type"]] ?? null)
                : null,
            timepoint: row["timepoint"] ? (TIMEPOINT_MAPPING[row["timepoint"]] ?? null) : null,
            shapeDistTraveled,
        });

        if (stopTime instanceof akType.errors) {
            return skipItem(
                "VALIDATION_ERROR",
                `Stop time row validation failed: ${stopTime.summary}`,
            );
        }
        return itemOk(stopTime);
    }

    private async resolveShapeDistTraveled(
        ctx: Context,
        row: CsvRow,
        shapeId: number | null,
        stopLocation: { lat: number; lng: number } | null,
    ): Promise<number | null> {
        const csv = row["shape_dist_traveled"];
        if (csv) return parseFloat(csv);
        if (shapeId && stopLocation) {
            return this.computeShapeDistTraveled(ctx, shapeId, stopLocation);
        }
        return null;
    }

    private async lookupTrip(
        ctx: Context,
        tripSid: string,
    ): Promise<{ tripId: number | null; shapeId: number | null }> {
        const cached = this.tripCache.get(tripSid);
        if (cached) return cached;

        const result = await ctx.db.query.trips.findFirst({
            where: { agencyId: this.agencyId, tripSid },
            columns: { id: true, shapeId: true },
        });

        const entry = { tripId: result?.id ?? null, shapeId: result?.shapeId ?? null };

        if (result === null) {
            ctx.logger.warn({ tripSid, agencyId: this.agencyId }, "Trip not found");
        }

        this.tripCache.set(tripSid, entry);
        return entry;
    }

    private async lookupStop(
        ctx: Context,
        stopSid: string,
    ): Promise<{ stopId: number | null; location: { lat: number; lng: number } | null }> {
        const cached = this.stopCache.get(stopSid);
        if (cached) return cached;

        const result = await ctx.db.query.stops.findFirst({
            where: { agencyId: this.agencyId, stopSid },
            columns: { id: true, location: true },
        });

        const location = result?.location
            ? { lat: result.location.y, lng: result.location.x }
            : null;
        const entry = { stopId: result?.id ?? null, location };

        if (result === null) {
            ctx.logger.warn({ stopSid, agencyId: this.agencyId }, "Stop not found");
        }

        this.stopCache.set(stopSid, entry);
        return entry;
    }

    private async computeShapeDistTraveled(
        ctx: Context,
        shapeId: number,
        location: { lat: number; lng: number },
    ): Promise<number | null> {
        const result = await ctx.db
            .select({
                distTraveled: sql<number>`
                    ST_LineLocatePoint(
                        ${shapes.path},
                        ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)
                    ) * ST_Length(${shapes.path}::geography)
                `.as("dist_traveled"),
            })
            .from(shapes)
            .where(eq(shapes.id, shapeId))
            .limit(1);
        return result[0]?.distTraveled ?? null;
    }
}

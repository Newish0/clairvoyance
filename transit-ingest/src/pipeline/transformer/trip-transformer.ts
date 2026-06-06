import type { Transform } from "../core/pipe";
import { trips } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import { type directionEnum } from "database/models/enums";

const DIRECTION_MAPPING: Record<string, (typeof directionEnum.enumValues)[number]> = {
    "0": "OUTBOUND",
    "1": "INBOUND",
};

export class TripTransformer implements Transform<CsvRow, typeof trips.$inferInsert> {
    private tripInsertSchema = createInsertSchema(trips);
    private routeCache = new Map<string, number | null>();
    private shapeCache = new Map<string, number | null>();

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof trips.$inferInsert>> {
        for await (const row of input) {
            const routeSid = row["route_id"];
            const shapeSid = row["shape_id"];

            const routeId = routeSid ? await this.lookupRoute(ctx, routeSid) : null;
            const shapeId = shapeSid ? await this.lookupShape(ctx, shapeSid) : null;

            const trip = this.tripInsertSchema({
                agencyId: this.agencyId,
                tripSid: row["trip_id"],
                serviceSid: row["service_id"],
                routeId: routeId ?? undefined,
                shapeId: shapeId ?? undefined,
                headsign: row["trip_headsign"] ?? null,
                shortName: row["trip_short_name"] ?? null,
                direction: row["direction_id"] ? (DIRECTION_MAPPING[row["direction_id"]] ?? null) : null,
                blockId: row["block_id"] ?? null,
            });

            if (trip instanceof akType.errors) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Trip row validation failed: ${trip.summary}`,
                );
            } else {
                yield itemOk(trip);
            }
        }
    }

    private async lookupRoute(ctx: Context, routeSid: string): Promise<number | null> {
        if (this.routeCache.has(routeSid)) {
            return this.routeCache.get(routeSid)!;
        }

        const result = await ctx.db.query.routes.findFirst({
            where: { agencyId: this.agencyId, routeSid },
            columns: { id: true },
        });

        const routeId = result?.id ?? null;

        if (routeId === null) {
            ctx.logger.warn({ routeSid, agencyId: this.agencyId }, "Route not found");
        }

        this.routeCache.set(routeSid, routeId);
        return routeId;
    }

    private async lookupShape(ctx: Context, shapeSid: string): Promise<number | null> {
        if (this.shapeCache.has(shapeSid)) {
            return this.shapeCache.get(shapeSid)!;
        }

        const result = await ctx.db.query.shapes.findFirst({
            where: { agencyId: this.agencyId, shapeSid },
            columns: { id: true },
        });

        const shapeId = result?.id ?? null;

        if (shapeId === null) {
            ctx.logger.warn({ shapeSid, agencyId: this.agencyId }, "Shape not found");
        }

        this.shapeCache.set(shapeSid, shapeId);
        return shapeId;
    }
}

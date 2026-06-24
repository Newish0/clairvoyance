import * as tables from "database/models/tables";
import type { Context } from "../core/context";
import { type ItemResult, itemOk } from "../core/error";
import type { Source } from "../core/pipe";

type Stop = typeof tables.stops.$inferInsert;

export class StopParentRefSource implements Source<Stop> {
    constructor(public batchSize: number = 1000) {}
    async *run(ctx: Context): AsyncIterable<ItemResult<Stop>> {
        let offset = 0;
        let stops = await this.getBatch(ctx, offset, this.batchSize);
        while (stops.length > 0) {
            const sidMap = await this.getSidMap(
                ctx,
                stops.map((s) => s.parentStationSid!),
            );
            const stopsWithParentId = stops.map((s) => {
                const parentId = sidMap.get(s.parentStationSid!);
                return { ...s, parentId };
            });

            for (const stop of stopsWithParentId) {
                yield itemOk(stop);
            }

            offset += this.batchSize;
            stops = await this.getBatch(ctx, offset, this.batchSize);
        }
    }

    private async getBatch(ctx: Context, offset: number, limit: number) {
        return await ctx.db.query.stops.findMany({
            where: {
                agencyId: ctx.config.agencyId,
                parentStationSid: { isNotNull: true },
            },
            offset,
            limit,
        });
    }

    private async getSidMap(ctx: Context, sids: string[]) {
        const stops = await ctx.db.query.stops.findMany({
            where: {
                agencyId: ctx.config.agencyId,
                stopSid: { in: sids },
            },
            columns: { id: true, stopSid: true },
        });
        const map = stops?.reduce((acc, stop) => {
            acc.set(stop.stopSid, stop.id);
            return acc;
        }, new Map<string, number>());
        return map;
    }
}

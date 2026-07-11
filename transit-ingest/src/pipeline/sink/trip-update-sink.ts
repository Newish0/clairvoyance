import { fromAsyncThrowable } from "neverthrow";
import type { TripInstanceState } from "database/models/enums";
import * as tables from "database/models/tables";
import { eq } from "drizzle-orm";
import { upsertMany } from "../../db/upsert";
import { gtfsTimeToDate } from "../../utils/datetime";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Sink } from "../core/pipe";
import type { TransformedTripUpdate } from "../transformer/trip-update-transformer";

export class TripUpdateSink implements Sink<TransformedTripUpdate> {
    private agencyTz: string = "Etc/UTC";

    constructor() {}

    async run(ctx: Context, input: AsyncIterable<TransformedTripUpdate>): Promise<void> {
        await this.preloadAgencyTz(ctx);

        for await (const tu of input) {
            try {
                await this.processTripUpdate(ctx, tu);
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "TRIP_UPDATE_SINK_ERROR",
                        `Failed to process trip update for trip ${tu.tripSid} (${ctx.config.agencyId})`,
                        e,
                    ),
                );
                ctx.skipped++;
            }
        }
    }

    private async preloadAgencyTz(ctx: Context) {
        const agency = await ctx.db.query.agencies.findFirst({
            where: { id: ctx.config.agencyId },
            columns: { timezone: true },
        });

        // Fatal: no agency means we cannot process any item. Let this throw.
        if (!agency) {
            throw new Error(`Failed to find agency ${ctx.config.agencyId}`);
        }

        this.agencyTz = agency.timezone;
    }

    private async processTripUpdate(ctx: Context, tu: TransformedTripUpdate): Promise<void> {
        if (tu.tripInstanceId === undefined) {
            await this.createTripInstance(
                ctx,
                tu.tripId,
                tu.routeId,
                tu.shapeId,
                tu.startDate,
                tu.startTime,
                tu.state,
            );
        } else {
            const updateResult = await fromAsyncThrowable(
                () =>
                    ctx.db
                        .update(tables.tripInstances)
                        .set({ state: tu.state, lastTripUpdateAt: new Date() })
                        .where(eq(tables.tripInstances.id, tu.tripInstanceId!)),
                (e: unknown) => e,
            )();

            if (updateResult.isErr()) {
                throw updateResult.error;
            }
        }

        if (tu.stopTimeInstancesToUpsert) {
            await upsertMany(
                ctx.db,
                tables.stopTimeRealtimeInstances,
                tu.stopTimeInstancesToUpsert,
                [tables.stopTimeRealtimeInstances.tripInstanceId, tables.stopTimeRealtimeInstances.stopSequence],
                ["id"],
            )
        }
    }

    private async createTripInstance(
        ctx: Context,
        tripId: number,
        routeId: number,
        shapeId: number | null,
        serviceDate: string,
        startTime: string,
        state: TripInstanceState,
    ): Promise<void> {
        const startDatetime = gtfsTimeToDate(serviceDate, startTime, this.agencyTz);

        if (!startDatetime) throw new Error("Failed to compute start datetime");

        await ctx.db.insert(tables.tripInstances).values({
            agencyId: ctx.config.agencyId,
            tripId,
            routeId,
            shapeId: shapeId ?? undefined,
            startDate: serviceDate,
            startTime,
            startDatetime,
            state,
        });
    }
}

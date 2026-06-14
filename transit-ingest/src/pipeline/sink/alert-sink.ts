import { eq } from "drizzle-orm";
import * as tables from "database/models/tables";
import { upsertMany } from "../../db/upsert";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
import type { Sink } from "../core/pipe";
import type { TransformedAlert } from "../transformer/alert-transformer";

export class AlertSink implements Sink<TransformedAlert> {
    async run(ctx: Context, input: AsyncIterable<TransformedAlert>): Promise<void> {
        for await (const alert of input) {
            try {
                await this.upsertAlert(ctx, alert);
            } catch (e) {
                ctx.errors.push(
                    recoverableError(
                        "ALERT_SINK_ERROR",
                        `Failed to upsert alert with hash ${alert.contentHash}`,
                        e,
                    ),
                );
                ctx.skipped++;
            }
        }
    }

    private async upsertAlert(ctx: Context, alert: TransformedAlert): Promise<void> {
        // contentHash is derived from the alert's full content (including
        // informedEntities), so an unchanged alert from the feed produces the
        // same hash and this upsert is effectively a no-op for that row.
        const result = await upsertMany(
            ctx.db,
            tables.alerts,
            [
                {
                    agencyId: alert.agencyId,
                    contentHash: alert.contentHash,
                    cause: alert.cause,
                    effect: alert.effect,
                    severity: alert.severity,
                    headerText: alert.headerText,
                    descriptionText: alert.descriptionText,
                    url: alert.url,
                    activePeriods: alert.activePeriods,
                    // @deprecated kept for debugging — see tables.ts
                    informedEntities: alert.informedEntities,
                    lastSeen: alert.lastSeen,
                },
            ],
            tables.alerts.contentHash,
            ["id"],
        )?.returning({ id: tables.alerts.id });

        if (!result) return;

        const alertId = result[0]!.id;
        await this.upsertAlertEntities(ctx, alertId, alert.informedEntities);
    }

    /**
     * Replace all alert_entities rows for this alert.
     *
     * We delete + reinsert rather than upsert because alert_entities has no
     * natural unique constraint that works with NULLs — Postgres treats
     * NULL <> NULL, so a composite unique constraint on the selector columns
     * wouldn't dedupe rows where any dimension is unspecified. Delete+reinsert
     * is simple, correct, and cheap for a small child table like this.
     */
    private async upsertAlertEntities(
        ctx: Context,
        alertId: number,
        informedEntities: TransformedAlert["informedEntities"],
    ): Promise<void> {
        await ctx.db.delete(tables.alertEntities).where(eq(tables.alertEntities.alertId, alertId));

        if (informedEntities.length === 0) return;

        await ctx.db.insert(tables.alertEntities).values(
            informedEntities.map((ie) => ({
                alertId,
                agencyId: ie.agencyId ?? null,
                routeId: ie.routeId ?? null,
                routeType: ie.routeType ?? null,
                direction: ie.direction ?? null,
                tripInstanceId: ie.tripInstanceId ?? null,
                stopId: ie.stopId ?? null,
            })),
        );
    }
}

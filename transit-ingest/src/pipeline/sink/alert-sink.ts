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
        await upsertMany(
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
                    informedEntities: alert.informedEntities,
                    lastSeen: alert.lastSeen,
                },
            ],
            tables.alerts.contentHash,
            ["id"],
        );
        return;
    }
}

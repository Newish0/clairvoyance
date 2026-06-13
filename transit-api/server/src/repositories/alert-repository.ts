import { Direction, RouteType } from "database/models/enums";
import * as tables from "database/models/tables";
import { and, gt, isNotNull, isNull, or, sql, SQL } from "drizzle-orm";
import { DataRepository } from "./data-repository";
import { EntitySelector } from "database/models/types";
import { PgDialect } from "drizzle-orm/pg-core";

type AffectedEntitySelector = {
    agencyId?: string;
    routeType?: RouteType;
    routeId?: number;
    direction?: Direction;
    stopId?: number;
    tripInstanceId?: number;
};

// All fields that can appear in an EntitySelector, mapped to their context key
const ENTITY_SELECTOR_FIELDS: (keyof EntitySelector)[] = [
    "agencyId",
    "routeId",
    "routeType",
    "direction",
    "tripInstanceId",
    "stopId",
];

export class AlertRepository extends DataRepository {
    // public async findAffectedActiveAlerts(query: AffectedEntitySelector, maxAgeSeconds = 300) {
    //     const now = new Date();
    //     const minDate = new Date(Date.now() - maxAgeSeconds * 1000);

    //     const conditions: ReturnType<typeof sql>[] = [
    //         gte(alerts.lastSeen, minDate),
    //         sql`${alerts.activePeriods} IS NOT NULL`,
    //         sql`${alerts.informedEntities} IS NOT NULL`,
    //     ];

    //     // Active period: at least one period contains "now"
    //     const nowIso = now.toISOString();
    //     conditions.push(
    //         sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${alerts.activePeriods}) AS period WHERE (period->>'start' IS NULL OR period->>'start' <= ${nowIso}) AND (period->>'end' IS NULL OR period->>'end' >= ${nowIso}))`,
    //     );

    //     // Informed entities: at least one element matches ALL provided filters
    //     const entityChecks: ReturnType<typeof sql>[] = [];
    //     if (query.agencyId !== undefined) {
    //         entityChecks.push(
    //             sql`(entity->>'agencyId' = ${query.agencyId} OR entity->>'agencyId' IS NULL OR entity->>'agencyId' = '')`,
    //         );
    //     }
    //     if (query.routeId !== undefined) {
    //         entityChecks.push(
    //             sql`((entity->>'routeId')::int = ${query.routeId} OR entity->>'routeId' IS NULL OR entity->>'routeId' = '')`,
    //         );
    //     }
    //     if (query.routeType !== undefined) {
    //         entityChecks.push(
    //             sql`(entity->>'routeType' = ${query.routeType} OR entity->>'routeType' IS NULL OR entity->>'routeType' = '')`,
    //         );
    //     }
    //     if (query.direction !== undefined) {
    //         entityChecks.push(
    //             sql`(entity->>'direction' = ${query.direction} OR entity->>'direction' IS NULL OR entity->>'direction' = '')`,
    //         );
    //     }
    //     if (query.stopId !== undefined) {
    //         const ids = Array.isArray(query.stopId) ? query.stopId : [query.stopId];
    //         const idChecks: ReturnType<typeof sql>[] = ids.map(
    //             (id) => sql`entity->>'stopId' = ${id}`,
    //         );
    //         idChecks.push(sql`entity->>'stopId' IS NULL`, sql`entity->>'stopId' = ''`);
    //         entityChecks.push(sql`(${sql.join(idChecks, sql` OR `)})`);
    //     }
    //     if (query.tripInstanceId !== undefined) {
    //         entityChecks.push(
    //             sql`(entity->>'tripInstance' = ${query.tripInstanceId} OR entity->>'tripInstance' IS NULL OR entity->>'tripInstance' = '')`,
    //         );
    //     }

    //     if (entityChecks.length > 0) {
    //         conditions.push(
    //             sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${alerts.informedEntities}) AS entity WHERE ${sql.join(entityChecks, sql` AND `)})`,
    //         );
    //     }

    //     return this.db
    //         .select()
    //         .from(alerts)
    //         .where(and(...conditions));
    // }

    /**
     * Generate all non-empty subsets of the fields present in the user context.
     * Each subset represents a valid EntitySelector that could match the user.
     */
    private generateMatchingSelectors(context: AffectedEntitySelector): EntitySelector[] {
        // Only consider fields that are actually present in this context
        const presentFields = ENTITY_SELECTOR_FIELDS.filter(
            (field) => context[field] !== undefined,
        );

        const selectors: EntitySelector[] = [];

        // Iterate over all non-empty subsets using bitmask
        const total = 1 << presentFields.length;
        for (let mask = 1; mask < total; mask++) {
            const selector: EntitySelector = {};
            for (let i = 0; i < presentFields.length; i++) {
                if (mask & (1 << i)) {
                    const field = presentFields[i];
                    (selector as any)[field] = context[field];
                }
            }
            selectors.push(selector);
        }

        return selectors;
    }

    public async findAlertsForEntity(context: AffectedEntitySelector, maxAgeSeconds = 300) {
        // For max age check with minDate and activePeriod checks
        const nowMs = Date.now();
        const minDate = new Date(nowMs - maxAgeSeconds * 1000);
        const nowPosix = Math.floor(nowMs / 1000);

        const selectors = this.generateMatchingSelectors(context);

        // Build: informedEntities @> '[{"field": value}]' OR ... for each selector
        const conditions = selectors.map(
            (selector) =>
                sql`${tables.alerts.informedEntities} @> ${JSON.stringify([selector])}::jsonb`,
        );

        // Combine all conditions with OR
        const whereClause = conditions.reduce((acc, condition) => sql`${acc} OR ${condition}`);

        const query = this.db
            .select()
            .from(tables.alerts)
            .where(sql`(${whereClause})`);

        // const pgDialect = new PgDialect();
        // console.log(pgDialect.sqlToQuery(query.getSQL()));

        return await query;
    }
}

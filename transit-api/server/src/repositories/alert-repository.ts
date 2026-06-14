import { Direction, RouteType } from "database/models/enums";
import * as tables from "database/models/tables";
import { EntitySelector } from "database/models/types";
import * as views from "database/models/views";
import { and, eq, getColumns, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DataRepository } from "./data-repository";

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
    /**
     *
     * @param params Only direction and routeType are optional because they are optional fields on trips and routes
     * @returns
     */
    public async findAlertsForTripInstance({
        tripInstanceId,
        routeId,
        direction,
        routeType,
        agencyId,
        stopIds,
    }: {
        tripInstanceId: number;
        routeId: number;
        direction?: Direction;
        routeType?: RouteType;
        agencyId: string;
        stopIds: number[];
    }) {
        // Build the per-selector AND conditions as a single jsonb_path_exists / EXISTS check.
        // Each element of informedEntities is one selector (one AND-group).
        // A selector matches if every key it specifies (present in the JSON object)
        // matches our values; absent keys are unconstrained.
        return this.db
            .select({
                ...getColumns(views.activeAlerts),
            })
            .from(views.activeAlerts)
            .where(
                sql`
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(${views.activeAlerts.informedEntities}) AS selector
                    WHERE
                        -- Guard: selector must specify at least one dimension
                        (
                            selector ? 'tripInstanceId'
                            OR selector ? 'stopId'
                            OR selector ? 'routeId'
                            OR selector ? 'direction'
                            OR selector ? 'agencyId'
                            OR selector ? 'routeType'
                        )
                        AND (
                            NOT (selector ? 'tripInstanceId')
                            OR (selector->>'tripInstanceId')::int = ${tripInstanceId}
                        )
                       AND (
                            NOT (selector ? 'stopId')
                            OR (selector->>'stopId')::int = ANY(ARRAY[${sql.join(
                                stopIds.map((id) => sql`${id}`),
                                sql`, `,
                            )}]::int[])
                        )
                        AND (
                            NOT (selector ? 'routeId')
                            OR (selector->>'routeId')::int = ${routeId}
                        )
                        AND (
                            NOT (selector ? 'direction')
                            OR ${direction ? sql`selector->>'direction' = ${direction}` : sql`false`}
                        )
                        AND (
                            NOT (selector ? 'agencyId')
                            OR selector->>'agencyId' = ${agencyId}
                        )
                        AND (
                            NOT (selector ? 'routeType')
                            OR ${routeType ? sql`selector->>'routeType' = ${routeType}` : sql`false`}
                        )
                )
            `,
            );
    }

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

    /** @deprecated see tables.ts */
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

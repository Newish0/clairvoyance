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
        return this.db
            .select({
                ...getColumns(views.activeAlerts),
                matchedStopId: tables.alertEntities.stopId,
                matchedRouteId: tables.alertEntities.routeId,
                matchedTripInstanceId: tables.alertEntities.tripInstanceId,
                matchedAgencyId: tables.alertEntities.agencyId,
                matchedRouteType: tables.alertEntities.routeType,
            })
            .from(tables.alertEntities)
            .innerJoin(views.activeAlerts, eq(views.activeAlerts.id, tables.alertEntities.alertId))
            .where(
                and(
                    // Guard against fully-unresolved selectors (all dimensions null).
                    // Without this, a row where every column is NULL would vacuously
                    // satisfy every "OR IS NULL" branch below and match every query.
                    or(
                        isNotNull(tables.alertEntities.tripInstanceId),
                        isNotNull(tables.alertEntities.stopId),
                        isNotNull(tables.alertEntities.routeId),
                        isNotNull(tables.alertEntities.direction),
                        isNotNull(tables.alertEntities.agencyId),
                        isNotNull(tables.alertEntities.routeType),
                    ),
                    // AND-within-selector: every dimension this row specifies (non-null)
                    // must match our trip instance; dimensions left null by the row
                    // are unconstrained (vacuously satisfied).
                    or(
                        eq(tables.alertEntities.tripInstanceId, tripInstanceId),
                        isNull(tables.alertEntities.tripInstanceId),
                    ),
                    or(
                        inArray(tables.alertEntities.stopId, stopIds),
                        isNull(tables.alertEntities.stopId),
                    ),
                    or(
                        eq(tables.alertEntities.routeId, routeId),
                        isNull(tables.alertEntities.routeId),
                    ),
                    direction
                        ? or(
                              eq(tables.alertEntities.direction, direction),
                              isNull(tables.alertEntities.direction),
                          )
                        : undefined,
                    or(
                        eq(tables.alertEntities.agencyId, agencyId),
                        isNull(tables.alertEntities.agencyId),
                    ),
                    routeType
                        ? or(
                              eq(tables.alertEntities.routeType, routeType),
                              isNull(tables.alertEntities.routeType),
                          )
                        : undefined,
                ),
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

import { Direction, RouteType } from "database";
import { DataRepository } from "./data-repository";
import { alerts } from "database";
import { and, gte, sql } from "drizzle-orm";

type AffectedEntitySelector = {
    agencyId?: string;
    routeType?: RouteType;
    routeId?: number;
    direction?: Direction;
    stopId?: string | string[];
    tripInstanceId?: string;
};

export class AlertRepository extends DataRepository {
    public async findAffectedActiveAlerts(query: AffectedEntitySelector, maxAgeSeconds = 300) {
        const now = new Date();
        const minDate = new Date(Date.now() - maxAgeSeconds * 1000);

        const conditions: ReturnType<typeof sql>[] = [
            gte(alerts.lastSeen, minDate),
            sql`${alerts.activePeriods} IS NOT NULL`,
            sql`${alerts.informedEntities} IS NOT NULL`,
        ];

        // Active period: at least one period contains "now"
        const nowIso = now.toISOString();
        conditions.push(
            sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${alerts.activePeriods}) AS period WHERE (period->>'start' IS NULL OR period->>'start' <= ${nowIso}) AND (period->>'end' IS NULL OR period->>'end' >= ${nowIso}))`,
        );

        // Informed entities: at least one element matches ALL provided filters
        const entityChecks: ReturnType<typeof sql>[] = [];
        if (query.agencyId !== undefined) {
            entityChecks.push(
                sql`(entity->>'agencyId' = ${query.agencyId} OR entity->>'agencyId' IS NULL OR entity->>'agencyId' = '')`,
            );
        }
        if (query.routeId !== undefined) {
            entityChecks.push(
                sql`((entity->>'routeId')::int = ${query.routeId} OR entity->>'routeId' IS NULL OR entity->>'routeId' = '')`,
            );
        }
        if (query.routeType !== undefined) {
            entityChecks.push(
                sql`(entity->>'routeType' = ${query.routeType} OR entity->>'routeType' IS NULL OR entity->>'routeType' = '')`,
            );
        }
        if (query.direction !== undefined) {
            entityChecks.push(
                sql`(entity->>'direction' = ${query.direction} OR entity->>'direction' IS NULL OR entity->>'direction' = '')`,
            );
        }
        if (query.stopId !== undefined) {
            const ids = Array.isArray(query.stopId) ? query.stopId : [query.stopId];
            const idChecks: ReturnType<typeof sql>[] = ids.map((id) => sql`entity->>'stopId' = ${id}`);
            idChecks.push(sql`entity->>'stopId' IS NULL`, sql`entity->>'stopId' = ''`);
            entityChecks.push(sql`(${sql.join(idChecks, sql` OR `)})`);
        }
        if (query.tripInstanceId !== undefined) {
            entityChecks.push(
                sql`(entity->>'tripInstance' = ${query.tripInstanceId} OR entity->>'tripInstance' IS NULL OR entity->>'tripInstance' = '')`,
            );
        }

        if (entityChecks.length > 0) {
            conditions.push(
                sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${alerts.informedEntities}) AS entity WHERE ${sql.join(entityChecks, sql` AND `)})`,
            );
        }

        return this.db.select().from(alerts).where(and(...conditions));
    }
}

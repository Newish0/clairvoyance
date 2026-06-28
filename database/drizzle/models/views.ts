import { and, eq, getColumns, gte, isNotNull, lt, sql } from "drizzle-orm";
import { doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import {
    pickupDropOffEnum,
    stopTimeUpdateScheduleRelationshipEnum,
    timepointEnum,
    type AlertStatus,
} from "./enums";
import { schema } from "./schema";
import {
    alerts,
    routes,
    stopTimes,
    tripInstances,
    trips,
    type stopTimeRealtimeInstances,
} from "./tables";

// =========================================================
// VIEWS
// =========================================================

/**
 * This view is used when we have no stopTimeInstances (i.e. no realtime trip updates).
 *
 * Remark:
 * Limit to trip instances starting within [-14 days, +1 month) of now.
 * This bounds the materialized view's size, keeping refreshes more deterministic
 * and avoiding unbounded growth as new trip instances are created.
 */

export const stopTimeStaticInstances = schema
    .materializedView("stop_time_static_instances")
    .as((qb) =>
        qb
            .select({
                // Must explicitly use as "trip_instance_id" and "stop_time_id" to avoid error `column "id" specified more than once`
                tripInstanceId: sql<number>`${tripInstances.id}`.as("trip_instance_id"),
                stopTimeId: sql<number>`${stopTimes.id}`.as("stop_time_id"),

                stopSequence: stopTimes.stopSequence,
                stopId: stopTimes.stopId,
                timepoint: stopTimes.timepoint,
                scheduledArrivalTime: sql<Date>`(${tripInstances.startDatetime} + (
                    ${stopTimes.arrivalTime}::interval - (
                        SELECT ${stopTimes.arrivalTime}::interval
                        FROM ${stopTimes}
                        WHERE ${stopTimes.tripId} = ${tripInstances.tripId}
                        AND ${stopTimes.stopSequence} = 1
                    )
                ))::timestamptz`.as("scheduled_arrival_time"),

                // Subtract first stop's arrival time (not departure) because tripInstances.startDatetime
                // corresponds to when the trip arrives at the first stop, so all times are relative to that
                scheduledDepartureTime: sql<Date>`(${tripInstances.startDatetime} + (
                    ${stopTimes.departureTime}::interval - (
                        SELECT ${stopTimes.arrivalTime}::interval
                        FROM ${stopTimes}
                        WHERE ${stopTimes.tripId} = ${tripInstances.tripId}
                        AND ${stopTimes.stopSequence} = 1
                    )
                ))::timestamptz`.as("scheduled_departure_time"),

                stopHeadsign: stopTimes.stopHeadsign,
                pickupType: stopTimes.pickupType,
                dropOffType: stopTimes.dropOffType,
                shapeDistTraveled: stopTimes.shapeDistTraveled,
            } satisfies Record<
                keyof Omit<
                    typeof stopTimeRealtimeInstances.$inferSelect,
                    | "id"
                    | "lastUpdatedAt"
                    | "predictedArrivalTime"
                    | "predictedDepartureTime"
                    | "predictedArrivalUncertainty"
                    | "predictedDepartureUncertainty"
                    | "scheduleRelationship"
                > &
                    "timepoint",
                any
            >)
            .from(tripInstances)
            .innerJoin(stopTimes, eq(tripInstances.tripId, stopTimes.tripId))
            .where(
                and(
                    gte(tripInstances.startDatetime, sql`now() - interval '14 days'`),
                    lt(tripInstances.startDatetime, sql`now() + interval '1 month'`),
                ),
            ),
    );

/**
 * Merges stopTimeRealtimeInstances with stopTimeStaticInstances.
 * Falls back to static values when no realtime data exists for a stop.
 *
 * Simple LEFT JOIN on (trip_instance_id, stop_id) - predicate-pushable, allowing
 * the planner to filter stop_time_static_instances by stop_id before the join.
 *
 * Branch 2 (rt.stop_id IS NULL -> join on stop_sequence) was dropped because:
 *   - stop_id is NOT NULL on both stop_times and stop_time_realtime_instances
 *   - flex/on-demand service is explicitly out of scope (see table definitions)
 *
 * WARNING: keep Drizzle column definitions in sync with the SQL.
 */
export const stopTimeInstances = schema.view("stop_time_instances", {
    id: integer("id"),
    tripInstanceId: integer("trip_instance_id").notNull(),
    stopTimeId: integer("stop_time_id"),
    stopSequence: integer("stop_sequence").notNull(),
    stopId: integer("stop_id").notNull(),
    timepoint: timepointEnum("timepoint"),
    shapeDistTraveled: doublePrecision("shape_dist_traveled"),
    scheduledArrivalTime: timestamp("scheduled_arrival_time", { withTimezone: true }),
    scheduledDepartureTime: timestamp("scheduled_departure_time", { withTimezone: true }),
    predictedArrivalTime: timestamp("predicted_arrival_time", { withTimezone: true }),
    predictedDepartureTime: timestamp("predicted_departure_time", { withTimezone: true }),
    predictedArrivalUncertainty: integer("predicted_arrival_uncertainty"),
    predictedDepartureUncertainty: integer("predicted_departure_uncertainty"),
    scheduleRelationship: stopTimeUpdateScheduleRelationshipEnum("schedule_relationship"),
    stopHeadsign: text("stop_headsign"),
    pickupType: pickupDropOffEnum("pickup_type"),
    dropOffType: pickupDropOffEnum("drop_off_type"),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
    effectiveTime: timestamp("effective_time", { withTimezone: true }),
}).as(sql`
    SELECT
        rt.id,
        st.trip_instance_id,
        st.stop_time_id,
        st.stop_sequence,
        st.stop_id,
        st.timepoint,
        st.shape_dist_traveled,
        COALESCE(rt.scheduled_arrival_time,   st.scheduled_arrival_time)   AS scheduled_arrival_time,
        COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time) AS scheduled_departure_time,
        rt.predicted_arrival_time,
        rt.predicted_departure_time,
        rt.predicted_arrival_uncertainty,
        rt.predicted_departure_uncertainty,
        rt.schedule_relationship,
        COALESCE(rt.stop_headsign, st.stop_headsign) AS stop_headsign,
        COALESCE(rt.pickup_type,   st.pickup_type)   AS pickup_type,
        COALESCE(rt.drop_off_type, st.drop_off_type) AS drop_off_type,
        rt.last_updated_at,
        COALESCE(
            rt.predicted_departure_time,
            COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time),
            rt.predicted_arrival_time,
            COALESCE(rt.scheduled_arrival_time, st.scheduled_arrival_time)
        ) AS effective_time
    FROM transit.stop_time_static_instances st
    LEFT JOIN transit.stop_time_realtime_instances rt
        ON  rt.trip_instance_id = st.trip_instance_id
        AND rt.stop_id          = st.stop_id
`);

/**
 * View of alerts that are currently relevant - either active or upcoming within the next month.
 *
 * Filters out `INACTIVE` alerts; every row is guaranteed to have `status` of
 * `ACTIVE` or `UPCOMING`.
 *
 * ---
 *
 * ### Status logic
 *
 * **`ACTIVE`** - at least one of the following holds:
 *
 * 1. `activePeriods` is `null` (no timing info) **and** `lastSeen` is within
 *    the last 5 minutes - the feed is still reporting this alert.
 *
 * 2. A **bounded** period (`end` is set) contains `now` - self-describing;
 *    does not require a fresh `lastSeen`.
 *
 * 3. An **open-ended** period (`end` is `null`) contains `now` **and**
 *    `lastSeen` is within the last 5 minutes - open periods need fresh
 *    confirmation that the feed still considers them ongoing.
 *
 * **`UPCOMING`** - none of the above, but some period starts within the next
 * month. Surfaced early so consumers can warn users ahead of time.
 *
 * **`INACTIVE`** - computed internally but filtered out before the view is
 * exposed. Query the `alerts` table directly if you need these.
 *
 * ---
 *
 * ### `lastSeen` semantics
 *
 * `lastSeen` is only consulted when there is no period, or only open-ended
 * periods, covering `now`. A closed period that covers `now` is considered
 * active on its own terms regardless of feed freshness.
 */
export const activeAlerts = schema.view("active_alerts").as((qb) => {
    const withStatus = qb.$with("alerts_with_status").as(
        qb
            .select({
                ...getColumns(alerts),
                status: sql<AlertStatus>`
                        CASE
                            WHEN (
                                ${alerts.activePeriods} IS NULL
                                AND ${alerts.lastSeen} >= now() - interval '5 minutes'
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements(${alerts.activePeriods}) AS period
                                WHERE
                                    (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                    AND (period->>'end' IS NOT NULL AND (period->>'end')::bigint >= extract(epoch FROM now()))
                            )
                            OR (
                                EXISTS (
                                    SELECT 1
                                    FROM jsonb_array_elements(${alerts.activePeriods}) AS period
                                    WHERE
                                        (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                        AND period->>'end' IS NULL
                                )
                                AND ${alerts.lastSeen} >= now() - interval '5 minutes'
                            )
                            THEN 'ACTIVE'::transit.alert_status

                            WHEN EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements(${alerts.activePeriods}) AS period
                                WHERE
                                    (period->>'start')::bigint > extract(epoch FROM now())
                                    AND (period->>'start')::bigint <= extract(epoch FROM now() + interval '1 month')
                            )
                            THEN 'UPCOMING'::transit.alert_status

                            ELSE 'INACTIVE'::transit.alert_status
                        END
                    `.as("status"),
            })
            .from(alerts),
    );

    return qb
        .with(withStatus)
        .select()
        .from(withStatus)
        .where(sql`${withStatus.status} != 'INACTIVE'::transit.alert_status`);
});

/** Aggregate distinct route per stop. */
export const stopRoutes = schema.materializedView("stop_routes").as((qb) =>
    qb
        .select({
            stopId: stopTimes.stopId,
            routes: sql<
                | {
                      id: number;
                      shortName: string | null;
                      color: string | null;
                      textColor: string | null;
                      type: string;
                  }[]
                | null
            >`
                array_agg(
                    DISTINCT jsonb_build_object(
                        'id', ${routes.id},
                        'shortName', ${routes.shortName},
                        'color', ${routes.color},
                        'textColor', ${routes.textColor},
                        'type', ${routes.type}
                    )
                )
            `.as("routes"),
        })
        .from(stopTimes)
        .innerJoin(trips, eq(stopTimes.tripId, trips.id))
        .innerJoin(routes, eq(trips.routeId, routes.id))
        .groupBy(stopTimes.stopId),
);

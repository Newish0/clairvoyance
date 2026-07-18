import { eq, getColumns, sql } from "drizzle-orm";
import { doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import {
    pickupDropOffEnum,
    stopTimeUpdateScheduleRelationshipEnum,
    timepointEnum,
    type AlertStatus,
} from "./enums";
import { schema } from "./schema";
import { alerts, routes, stopTimes, tripInstances, trips } from "./tables";

// =========================================================
// VIEWS
// =========================================================

/**
 * Full computed view of static stop time instances (trip_instances × stop_times).
 * Uses pre-computed relative_arrival_offset/relative_departure_offset on stop_times
 * to avoid correlated subqueries. Covers the full 1-month window.
 * Slower than the materialized active table — use for time-tolerant queries.
 */
export const stopTimeStaticInstances = schema.view("stop_time_static_instances", {
    tripInstanceId: integer("trip_instance_id").notNull(),
    stopTimeId: integer("stop_time_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    stopId: integer("stop_id").notNull(),
    timepoint: timepointEnum("timepoint"),
    scheduledArrivalTime: timestamp("scheduled_arrival_time", { withTimezone: true }),
    scheduledDepartureTime: timestamp("scheduled_departure_time", { withTimezone: true }),
    stopHeadsign: text("stop_headsign"),
    pickupType: pickupDropOffEnum("pickup_type"),
    dropOffType: pickupDropOffEnum("drop_off_type"),
    shapeDistTraveled: doublePrecision("shape_dist_traveled"),
}).as(sql`
    SELECT
        ti.id AS trip_instance_id,
        st.id AS stop_time_id,
        st.stop_sequence,
        st.stop_id,
        st.timepoint,
        (ti.start_datetime + st.relative_arrival_offset)::timestamptz AS scheduled_arrival_time,
        (ti.start_datetime + st.relative_departure_offset)::timestamptz AS scheduled_departure_time,
        st.stop_headsign,
        st.pickup_type,
        st.drop_off_type,
        st.shape_dist_traveled
    FROM transit.trip_instances ti
    INNER JOIN transit.stop_times st ON st.trip_id = ti.trip_id
`);

/**
 * Merges stopTimeRealtimeInstances with stopTimeStaticInstances (computed view).
 * Falls back to static values when no realtime data exists for a stop.
 *
 * Simple LEFT JOIN on (trip_instance_id, stop_id) - predicate-pushable, allowing
 * the planner to filter stop_time_static_instances by stop_id before the join.
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
 * Active-only variant of stopTimeInstances.
 * Pure view — computes static instances on the fly from trip_instances × stop_times
 * with a 4-day rolling window instead of reading from a materialized table.
 *
 * Simple LEFT JOIN on (trip_instance_id, stop_id) - predicate-pushable, allowing
 * the planner to filter by stop_id before the join.
 *
 * WARNING: keep Drizzle column definitions in sync with the SQL.
 */
export const stopTimeInstancesActive = schema.view("stop_time_instances_active", {
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
        static.trip_instance_id,
        static.stop_time_id,
        static.stop_sequence,
        static.stop_id,
        static.timepoint,
        static.shape_dist_traveled,
        COALESCE(rt.scheduled_arrival_time,   static.scheduled_arrival_time)   AS scheduled_arrival_time,
        COALESCE(rt.scheduled_departure_time, static.scheduled_departure_time) AS scheduled_departure_time,
        rt.predicted_arrival_time,
        rt.predicted_departure_time,
        rt.predicted_arrival_uncertainty,
        rt.predicted_departure_uncertainty,
        rt.schedule_relationship,
        COALESCE(rt.stop_headsign, static.stop_headsign) AS stop_headsign,
        COALESCE(rt.pickup_type,   static.pickup_type)   AS pickup_type,
        COALESCE(rt.drop_off_type, static.drop_off_type) AS drop_off_type,
        rt.last_updated_at,
        COALESCE(
            rt.predicted_departure_time,
            COALESCE(rt.scheduled_departure_time, static.scheduled_departure_time),
            rt.predicted_arrival_time,
            COALESCE(rt.scheduled_arrival_time, static.scheduled_arrival_time)
        ) AS effective_time
    FROM (
        SELECT
            ti.id AS trip_instance_id,
            st.id AS stop_time_id,
            st.stop_sequence,
            st.stop_id,
            st.timepoint,
            (ti.start_datetime + st.relative_arrival_offset)::timestamptz AS scheduled_arrival_time,
            (ti.start_datetime + st.relative_departure_offset)::timestamptz AS scheduled_departure_time,
            st.stop_headsign,
            st.pickup_type,
            st.drop_off_type,
            st.shape_dist_traveled
        FROM transit.trip_instances ti
        INNER JOIN transit.stop_times st ON st.trip_id = ti.trip_id
        WHERE ti.start_datetime >= now() - interval '4 days'
          AND ti.start_datetime < now() + interval '4 days'
    ) static
    LEFT JOIN transit.stop_time_realtime_instances rt
        ON  rt.trip_instance_id = static.trip_instance_id
        AND rt.stop_id          = static.stop_id
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

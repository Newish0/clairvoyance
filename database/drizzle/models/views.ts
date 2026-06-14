import { eq, SQL, sql } from "drizzle-orm";
import { schema } from "./schema";
import {
    pickupDropOffEnum,
    stopTimeUpdateScheduleRelationshipEnum,
    timepointEnum,
    type PickupDropOff,
    type StopTimeUpdateScheduleRelationship,
    type Timepoint,
} from "./enums";
import { stopTimes, tripInstances, type stopTimeRealtimeInstances, alerts } from "./tables";
import {
    type AnyPgColumn,
    char,
    doublePrecision,
    index,
    integer,
    jsonb,
    primaryKey,
    serial,
    text,
    timestamp,
    unique,
    varchar,
} from "drizzle-orm/pg-core";

// =========================================================
// HELPER TYPES
// =========================================================

type MergeFieldTypes<T1 extends object, T2 extends object> = {
    [K in keyof T1 | keyof T2]:
        | (K extends keyof T1 ? T1[K] : never)
        | (K extends keyof T2 ? T2[K] : never);
};

type AliasFields<T> = {
    [K in keyof T]: SQL.Aliased<T[K]>;
};

// =========================================================
// VIEWS
// =========================================================

/**
 * This view is used when we have no stopTimeInstances (i.e. no realtime trip updates).
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
            .innerJoin(stopTimes, eq(tripInstances.tripId, stopTimes.tripId)),
    );

/**
 * Merges stopTimeRealtimeInstances with stopTimeStaticInstances.
 * If stopTimeRealtimeInstances exist, use them. Else fall back to stopTimeStaticInstances.
 *
 * Uses UNION ALL of two FULL JOINs because PostgreSQL does not support FULL JOIN with
 * CASE-based join conditions - only simple equality (hash/merge-joinable) conditions are allowed.
 *
 *   Branch 1: rt.stop_id IS NOT NULL -> join on (trip_instance_id, stop_id)
 *   Branch 2: rt.stop_id IS NULL     -> join on (trip_instance_id, stop_sequence)
 *
 * WARNING:
 * When updating SQL, be sure Drizzle and raw SQL is NOT out of sync to avoid type inference problems.
 */
export const stopTimeInstances = schema.view("stop_time_instances", {
    /** `id` is `stopTimeRealtimeInstances.id`; is only on those with `stopTimeRealtimeInstances` */
    id: integer("id"),
    tripInstanceId: integer("trip_instance_id").notNull(),
    stopTimeId: integer("stop_time_id"),
    stopSequence: integer("stop_sequence").notNull(),
    stopId: integer("stop_id"),
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
}).as(sql`
        -- Branch 1: rt.stop_id IS NOT NULL → join on (trip_instance_id, stop_id)
        -- Covers: rt+st matched rows, rt-only ADDED/unmatched rows, and st-only rows
        SELECT
            rt.id,
            COALESCE(rt.trip_instance_id, st.trip_instance_id) AS trip_instance_id,
            COALESCE(rt.stop_time_id,     st.stop_time_id)     AS stop_time_id,
            COALESCE(rt.stop_sequence,    st.stop_sequence)    AS stop_sequence,
            COALESCE(rt.stop_id,          st.stop_id)          AS stop_id,
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
            rt.last_updated_at
        FROM transit.stop_time_realtime_instances rt
        FULL JOIN transit.stop_time_static_instances st
            ON  rt.trip_instance_id = st.trip_instance_id
            AND rt.stop_id          = st.stop_id           
        WHERE rt.stop_id IS NOT NULL                        -- rt rows matched by stop_id
           OR rt.trip_instance_id IS NULL                   -- st-only rows (no rt counterpart)
 
        UNION ALL
 
        -- Branch 2: rt.stop_id IS NULL → join on (trip_instance_id, stop_sequence)
        -- Covers: rt+st matched rows and rt-only rows where stop_id was omitted
        SELECT
            rt.id,
            COALESCE(rt.trip_instance_id, st.trip_instance_id) AS trip_instance_id,
            COALESCE(rt.stop_time_id,     st.stop_time_id)     AS stop_time_id,
            COALESCE(rt.stop_sequence,    st.stop_sequence)    AS stop_sequence,
            COALESCE(rt.stop_id,          st.stop_id)          AS stop_id,
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
            rt.last_updated_at
        FROM transit.stop_time_realtime_instances rt
        FULL JOIN transit.stop_time_static_instances st
            ON  rt.trip_instance_id = st.trip_instance_id
            AND rt.stop_sequence    = st.stop_sequence      
        WHERE rt.stop_id IS NULL                            -- only rt rows without a stop_id
            AND rt.id IS NOT NULL  -- exclude st-only rows (handled by Branch 1)
    `);

/**
 * Alerts that are currently active.
 *
 * "Active" means: at least one of the following holds -
 *
 *   1. activePeriods is null (no time info at all - fall back to lastSeen
 *      to confirm the feed is still reporting this alert), OR
 *
 *   2. some period contains `now` AND has a defined `end`
 *      (bounded period - self-describing, doesn't need lastSeen), OR
 *
 *   3. some period contains `now` AND has end = null (open-ended/ongoing)
 *      AND lastSeen is within the last 5 minutes (need fresh confirmation
 *      the feed still considers this ongoing)
 *
 * In short: lastSeen is only consulted when we have no period, or only
 * open-ended periods, covering `now`. A closed period that covers `now`
 * is active on its own terms regardless of how stale the feed is.
 */
export const activeAlerts = schema.view("active_alerts").as((qb) =>
    qb
        .select()
        .from(alerts)
        .where(
            sql`
                    -- Case 1: no time info at all - rely on lastSeen
                    (
                        ${alerts.activePeriods} IS NULL
                        AND ${alerts.lastSeen} >= now() - interval '5 minutes'
                    )
                    OR
                    -- Case 2: a bounded period covers now - active on its own terms
                    EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(${alerts.activePeriods}) AS period
                        WHERE
                            (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                            AND (period->>'end' IS NOT NULL AND (period->>'end')::bigint >= extract(epoch FROM now()))
                    )
                    OR
                    -- Case 3: an open-ended period covers now - needs a fresh lastSeen
                    (
                        EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(${alerts.activePeriods}) AS period
                            WHERE
                                (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                AND period->>'end' IS NULL
                        )
                        AND ${alerts.lastSeen} >= now() - interval '5 minutes'
                    )
                `,
        ),
);

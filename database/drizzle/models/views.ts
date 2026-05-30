import { eq, SQL, sql } from "drizzle-orm";
import { schema } from "./schema";
import type { PickupDropOff, StopTimeUpdateScheduleRelationship, Timepoint } from "./enums";
import { stopTimes, tripInstances, type stopTimeRealtimeInstances } from "./tables";

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
 * Merges stopTimeRealtimeInstances with stopTimesStaticInstances.
 * If stopTimeRealtimeInstances exist, use them. Else use stopTimesStaticInstances
 *
 * IMPORTANT NOTE:
 * Using mostly raw SQL here because there is a known Drizzle issue when joining views.
 * The problem is that Drizzle's SQL generation doesn't properly qualify column references from views in FULL JOINs.
 */
export const stopTimeInstances = schema.view("stop_time_instances").as((qb) =>
    qb
        .select({
            id: sql<number>`rt.id`.as("id"),
            tripInstanceId: sql<number>`COALESCE(rt.trip_instance_id, st.trip_instance_id)`.as(
                "trip_instance_id",
            ),
            stopTimeId: sql<number>`COALESCE(rt.stop_time_id, st.stop_time_id)`.as("stop_time_id"),
            stopSequence: sql<number>`COALESCE(rt.stop_sequence, st.stop_sequence)`.as(
                "stop_sequence",
            ),
            stopId: sql<number | null>`COALESCE(rt.stop_id, st.stop_id)`.as("stop_id"),
            timepoint: sql<Timepoint | null>`st.timepoint`.as("timepoint"),
            scheduledArrivalTime:
                sql<Date | null>`COALESCE(rt.scheduled_arrival_time, st.scheduled_arrival_time)`.as(
                    "scheduled_arrival_time",
                ),
            scheduledDepartureTime:
                sql<Date | null>`COALESCE(rt.scheduled_departure_time, st.scheduled_departure_time)`.as(
                    "scheduled_departure_time",
                ),
            predictedArrivalTime: sql<Date | null>`rt.predicted_arrival_time`.as(
                "predicted_arrival_time",
            ),
            predictedDepartureTime: sql<Date | null>`rt.predicted_departure_time`.as(
                "predicted_departure_time",
            ),
            predictedArrivalUncertainty: sql<number | null>`rt.predicted_arrival_uncertainty`.as(
                "predicted_arrival_uncertainty",
            ),
            predictedDepartureUncertainty: sql<
                number | null
            >`rt.predicted_departure_uncertainty`.as("predicted_departure_uncertainty"),
            scheduleRelationship:
                sql<StopTimeUpdateScheduleRelationship | null>`rt.schedule_relationship`.as(
                    "schedule_relationship",
                ),
            stopHeadsign: sql<string | null>`COALESCE(rt.stop_headsign, st.stop_headsign)`.as(
                "stop_headsign",
            ),
            pickupType: sql<PickupDropOff | null>`COALESCE(rt.pickup_type, st.pickup_type)`.as(
                "pickup_type",
            ),
            dropOffType: sql<PickupDropOff | null>`COALESCE(rt.drop_off_type, st.drop_off_type)`.as(
                "drop_off_type",
            ),
            lastUpdatedAt: sql<Date | null>`rt.last_updated_at`.as("last_updated_at"),
        } satisfies AliasFields<
            MergeFieldTypes<
                typeof stopTimeRealtimeInstances.$inferSelect,
                typeof stopTimeStaticInstances.$inferSelect
            >
        >)
        .from(sql`transit.stop_time_realtime_instances rt`)
        .fullJoin(
            sql`transit.stop_time_static_instances st`,
            sql`rt.trip_instance_id = st.trip_instance_id AND rt.stop_sequence = st.stop_sequence`,
        ),
);

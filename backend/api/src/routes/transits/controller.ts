import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import pgDb from "clairvoyance-db";
import { and, lte, sql, eq, or, gte, desc, isNotNull, isNull, asc } from "drizzle-orm";

import { stops as stopsTable } from "clairvoyance-db/schemas/stops";
import { stop_times as stopTimesTable } from "clairvoyance-db/schemas/stop_times";
import { routes as routesTable } from "clairvoyance-db/schemas/routes";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { stop_time_updates as stopTimeUpdatesTable } from "clairvoyance-db/schemas/stop_time_updates";

import { stopTimesPTraveled } from "clairvoyance-db/schemas/views/stop_times_p_traveled";
import {
    SECONDS_IN_A_DAY,
    formatDateAsYYYYMMDD,
    getSecondsSinceStartOfDate,
    getSecondsSinceStartOfDay,
} from "@/utils/datetime";
import { union } from "drizzle-orm/pg-core";
import { calendar_dates as calendarDatesTable } from "clairvoyance-db/schemas/calendar_dates";

type NearbyTransit = typeof routesTable.$inferSelect & {
    trips: (typeof tripsTable.$inferSelect & {
        stop_time: typeof stopTimesTable.$inferSelect & {
            p_traveled: number;
            stop: typeof stopsTable.$inferSelect;
            stop_time_update: typeof stopTimeUpdatesTable.$inferSelect | null;
        };
        rtvp: typeof rtvpTable.$inferSelect | null;
    })[];
};

export default function (hono: Hono) {
    hono.get(
        "/nearby",
        zValidator(
            "query",
            z.object({
                lat: z.string(),
                lng: z.string(),
                radius: z.string(),
                time: z.string(), // The datetime of the client
            })
        ),
        async (c) => {
            const { lat, lng, radius, time } = c.req.valid("query");

            const targetLat = parseFloat(lat);
            const targetLng = parseFloat(lng);
            const maxDistanceKm = parseFloat(radius);

            const currentDateTime = new Date(time);
            const currentDateTimeSeconds = getSecondsSinceStartOfDate(currentDateTime, true);
            const currentDateYYYYMMDD = formatDateAsYYYYMMDD(currentDateTime);
            const yesterdayDateYYYYMMDD = formatDateAsYYYYMMDD(
                new Date(currentDateTime.valueOf() - 24 * 60 * 60 * 1000)
            );

            const queryNearbyTransits = async (realtime: boolean) => {
                const finalAndConditions = realtime
                    ? [
                          isNotNull(rtvpTable),
                          gte(rtvpTable.timestamp, sql`NOW() - INTERVAL '1 minute'`),
                          gte(stopTimesPTraveled.p_traveled, rtvpTable.p_traveled),
                      ]
                    : [
                          isNull(rtvpTable),
                          eq(tripsTable.trip_id, stopTimesTable.trip_id),

                          // Get trips that are scheduled for the future
                          // OR scheduled for yesterday but arrived today/future (i.e. operates until today/future)
                          // TODO: Ensure implementations works for timestamps that goes up to 99:99:99 (i.e past 4 days)
                          or(
                              and(
                                  gte(calendarDatesTable.date, parseInt(currentDateYYYYMMDD)),
                                  gte(
                                      sql<number>`MOD(${stopTimesTable.arrival_timestamp}, ${SECONDS_IN_A_DAY})`,
                                      currentDateTimeSeconds
                                  )
                              ),
                              and(
                                  eq(calendarDatesTable.date, parseInt(yesterdayDateYYYYMMDD)),
                                  gte(
                                      stopTimesTable.arrival_timestamp,
                                      currentDateTimeSeconds + SECONDS_IN_A_DAY
                                  )
                              )
                          ),
                      ];

                return await pgDb
                    .selectDistinctOn([
                        tripsTable.route_id,
                        tripsTable.direction_id,
                        tripsTable.shape_id,
                    ])
                    .from(stopsTable)
                    .leftJoin(stopTimesTable, eq(stopTimesTable.stop_id, stopsTable.stop_id))
                    .leftJoin(tripsTable, eq(tripsTable.trip_id, stopTimesTable.trip_id))
                    .leftJoin(routesTable, eq(routesTable.route_id, tripsTable.route_id))
                    .leftJoin(rtvpTable, eq(rtvpTable.trip_id, tripsTable.trip_id))
                    .leftJoin(
                        stopTimesPTraveled,
                        and(
                            eq(stopTimesPTraveled.trip_id, stopTimesTable.trip_id),
                            eq(stopTimesPTraveled.stop_id, stopTimesTable.stop_id)
                        )
                    )
                    .leftJoin(
                        stopTimeUpdatesTable,
                        and(
                            eq(stopTimeUpdatesTable.trip_id, stopTimesTable.trip_id),
                            eq(stopTimeUpdatesTable.stop_id, stopTimesTable.stop_id)
                        )
                    )
                    .leftJoin(
                        calendarDatesTable,
                        eq(calendarDatesTable.service_id, tripsTable.service_id)
                    )
                    .where(
                        and(
                            lte(
                                sql<number>`(6371 * acos(
                                cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                                sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                            ))`,
                                maxDistanceKm
                            ),
                            eq(calendarDatesTable.exception_type, 1),
                            and(...finalAndConditions)
                        )
                    )
                    .orderBy(
                        tripsTable.route_id,
                        tripsTable.direction_id,
                        tripsTable.shape_id,
                        asc(sql<number>`(6371 * acos(
                        cos(radians(${targetLat})) * cos(radians(${stopsTable.stop_lat})) * cos(radians(${stopsTable.stop_lon}) - radians(${targetLng})) +
                        sin(radians(${targetLat})) * sin(radians(${stopsTable.stop_lat}))
                    ))`),
                        asc(calendarDatesTable.date),
                        asc(stopTimesTable.arrival_timestamp)
                    );
            };

            const nearbyTransitsWithRtvpRaw = await queryNearbyTransits(true);
            const nearbyTransitStaticRaw = await queryNearbyTransits(false);

            const nearbyTransitsRawResult = [
                ...nearbyTransitsWithRtvpRaw,
                ...nearbyTransitStaticRaw.filter(
                    (t1) =>
                        !nearbyTransitsWithRtvpRaw.some(
                            (t2) =>
                                t1.trips &&
                                t2.trips &&
                                t1.trips.route_id === t2.trips.route_id &&
                                t1.trips.direction_id === t2.trips.direction_id
                        )
                ),
            ];

            const nearbyTransits: NearbyTransit[] = [];

            // Reformat data
            for (const rawTransit of nearbyTransitsRawResult) {
                const {
                    routes: route,
                    stop_times: stop_time,
                    stop_times_p_traveled,
                    stops: stop,
                    trips: trip,
                    vehicle_position,
                    stop_time_updates: stop_time_update,
                    calendar_dates: calendar_date,
                } = rawTransit;

                if (!route || !trip || !stop_time) continue;

                const nbTrip = {
                    ...trip,
                    rtvp: vehicle_position,
                    stop_time: {
                        ...stop_time,
                        stop,
                        stop_time_update,
                        p_traveled: (stop_times_p_traveled as any)?.p_traveled,
                    },
                    calendar_date,
                };

                const existingNbEntry = nearbyTransits.find((nb) => nb.route_id === route.route_id);
                if (existingNbEntry) {
                    existingNbEntry.trips.push(nbTrip);
                } else {
                    nearbyTransits.push({
                        ...route,
                        trips: [nbTrip],
                    });
                }
            }

            return c.json(nearbyTransits);
        }
    );
}

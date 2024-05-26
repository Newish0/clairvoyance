import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import pgDb from "clairvoyance-db";
import { stops as stopsTable } from "clairvoyance-db/schemas/stops";
import { stop_times as stopTimesTable } from "clairvoyance-db/schemas/stop_times";
import { routes as routesTable } from "clairvoyance-db/schemas/routes";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { stop_time_updates as stopTimeUpdatesTable } from "clairvoyance-db/schemas/stop_time_updates";
import { trip_updates as tripUpdatesTable } from "clairvoyance-db/schemas/trip_updates";
import { and, asc, eq, gt, gte, isNotNull, or, sql } from "drizzle-orm";
import {
    getSecondsSinceStartOfDate,
    formatDateAsYYYYMMDD,
    SECONDS_IN_A_DAY,
    getDateFromYYYYMMDD,
} from "@/utils/datetime";
import { calendar_dates as calendarDatesTable } from "clairvoyance-db/schemas/calendar_dates";

export default function (hono: Hono) {
    // hono.get("/", async (c) => {

    // });

    hono.get(
        "/route/:route_id",
        zValidator(
            "query",
            z.object({
                stop_id: z.string().optional(),
                date: z
                    .string()
                    .regex(/^\d{4}\d{2}\d{2}$/)
                    .optional(), // The date to query for
            })
        ),
        async (c) => {
            const routeId = c.req.param("route_id");
            const { stop_id: stopId, date } = c.req.valid("query");

            const dateAsDateObj = date ? getDateFromYYYYMMDD(date) : null;
            const yesterdayDateAsDateObj =
                dateAsDateObj && new Date(dateAsDateObj.valueOf() - 24 * 60 * 60 * 1000);
            const yesterdayYYYYMMDD =
                yesterdayDateAsDateObj && formatDateAsYYYYMMDD(yesterdayDateAsDateObj);

            const rawResult = await pgDb
                .select()
                .from(stopTimesTable)
                .leftJoin(tripsTable, eq(stopTimesTable.trip_id, tripsTable.trip_id))
                .leftJoin(
                    stopTimeUpdatesTable,
                    and(
                        eq(stopTimeUpdatesTable.trip_id, stopTimesTable.trip_id),
                        eq(stopTimeUpdatesTable.stop_sequence, stopTimesTable.stop_sequence)
                    )
                )
                .leftJoin(
                    calendarDatesTable,
                    eq(calendarDatesTable.service_id, tripsTable.service_id)
                )
                .where(
                    and(
                        eq(tripsTable.route_id, routeId),
                        stopId ? eq(stopTimesTable.stop_id, stopId) : undefined,

                        or(
                            date ? eq(calendarDatesTable.date, parseInt(date)) : undefined,
                            yesterdayYYYYMMDD
                                ? and(
                                      eq(calendarDatesTable.date, parseInt(yesterdayYYYYMMDD)),
                                      gte(stopTimesTable.arrival_timestamp, SECONDS_IN_A_DAY)
                                  )
                                : undefined
                        ),
                        eq(calendarDatesTable.exception_type, 1)
                    )
                )
                .orderBy(asc(calendarDatesTable.date), asc(stopTimesTable.arrival_timestamp));

            const transformedResult = rawResult.map((t) => {
                return {
                    ...t.stop_times,
                    trip: t.trips,
                    stop_time_update: t.stop_time_updates,
                    calender_date: t.calendar_dates,
                };
            });

            return c.json(transformedResult);
        }
    );

    hono.get("/trip/:trip_id", zValidator("query", z.object({})), async (c) => {
        const tripId = c.req.param("trip_id");

        const stopTimes = await pgDb.query.stop_times.findMany({
            where: (stopTimesTable, { eq }) => eq(stopTimesTable.trip_id, tripId),
            orderBy: (stopTimesTable, { asc }) => asc(stopTimesTable.stop_sequence),
            with: {
                stop: true,
            },
        });

        return c.json(stopTimes);
    });
}

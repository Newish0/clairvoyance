import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import { getTrips } from "gtfs";
import pgDb from "@/db";

export default function (hono: Hono) {
    // hono.get("/", async (c) => {

    // });

    hono.get(
        "/route/:route_id",
        zValidator(
            "query",
            z.object({
                stop_id: z.string().optional(),
            })
        ),
        async (c) => {
            const routeId = c.req.param("route_id");
            const { stop_id: stopId } = c.req.valid("query");

            const tripsOfRoute = (
                await pgDb.query.trips.findMany({
                    where: (tripsTable, { eq }) => eq(tripsTable.route_id, routeId),
                    columns: { trip_id: true },
                })
            ).map((trip) => trip.trip_id);

            const stopTimes = await pgDb.query.stop_times.findMany({
                where: (stopTimesTable, { inArray, eq, and }) =>
                    and(
                        inArray(stopTimesTable.trip_id, tripsOfRoute),
                        stopId ? eq(stopTimesTable.stop_id, stopId) : undefined
                    ),
                orderBy: (stopTimesTable, { asc }) => asc(stopTimesTable.arrival_timestamp),
                with: {
                    trip: true,
                    stop_time_update: true,
                },
            });

            return c.json(stopTimes);
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

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import { getTrips } from "gtfs";
import pgDb from "@/db";

export default function (hono: Hono) {
    hono.get("/", async (c) => {
        if (!db.primary) return c.status(500);

        const routes = getTrips(
            {}, // query filters
            [], // return  fields
            [["trip_id", "ASC"]], // sorting
            { db: db.primary }
        );
        return c.json(routes);
    });

    hono.get(
        "/:trip_id",
        zValidator(
            "query",
            z.object({
                with_route: z.string().optional(),
            })
        ),
        async (c) => {
            const trip_id = c.req.param("trip_id");

            const { with_route } = c.req.valid("query");

            const withObj: Record<string, boolean | undefined> = {
                route: with_route === "true" || undefined,
            };

            const trip = await pgDb.query.trips.findFirst({
                where: (trip, { eq }) => eq(trip.trip_id, trip_id),
                with: {
                    ...withObj,
                },
            });

            return c.json(trip);
        }
    );
}

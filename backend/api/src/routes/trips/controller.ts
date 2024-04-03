import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import { getTrips } from "gtfs";

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
}

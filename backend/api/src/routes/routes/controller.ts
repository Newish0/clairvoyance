import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import { getRoutes } from "gtfs";

export default function (hono: Hono) {
    hono.get("/", async (c) => {
        if (!db.primary) return c.status(500);

        const routes = getRoutes(
            {}, // query filters
            [], // return  fields
            [["route_short_name", "ASC"]], // sorting
            { db: db.primary }
        );
        return c.json(routes);
    });
}

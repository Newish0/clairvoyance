import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import { getRoutes } from "gtfs";
import pgDb from "clairvoyance-db";

export default function (hono: Hono) {
    // hono.get("/", async (c) => {
    //     if (!db.primary) return c.status(500);

    //     const routes = getRoutes(
    //         {}, // query filters
    //         [], // return  fields
    //         [["route_short_name", "ASC"]], // sorting
    //         { db: db.primary }
    //     );
    //     return c.json(routes);
    // });

    hono.get("/:route_id", zValidator("query", z.object({})), async (c) => {
        const routeId = c.req.param("route_id");
        const route = await pgDb.query.routes.findFirst({
            where: (routeTable, { eq }) => eq(routeTable.route_id, routeId),
        });
        return c.json(route);
    });
}

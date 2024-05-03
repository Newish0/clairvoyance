import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/services/gtfs-init";
import psDb from "@/db";
import { getShapes } from "gtfs";
import { shapes as shapesTable } from "@/db/schemas/shapes";
import { asc, eq, inArray } from "drizzle-orm";
import { trips as tripsTable } from "@/db/schemas/trips";
import { routes as routesTable } from "@/db/schemas/routes";

export default function (hono: Hono) {
    hono.get(
        "/",
        zValidator(
            "query",
            z.object({
                shape_id: z.string().optional(),
                route_id: z.string().optional(),
            })
        ),
        async (c) => {
            const { shape_id, route_id } = c.req.valid("query");

            let shapes: Array<typeof shapesTable.$inferSelect> = [];

            if (!shape_id && !route_id) {
                return c.status(400);
            } else if (shape_id) {
                shapes = await psDb
                    .select({
                        shape_id: shapesTable.shape_id,
                        shape_pt_sequence: shapesTable.shape_pt_sequence,
                        shape_pt_lat: shapesTable.shape_pt_lat,
                        shape_pt_lon: shapesTable.shape_pt_lon,
                        shape_dist_traveled: shapesTable.shape_dist_traveled,
                    })
                    .from(shapesTable)
                    .where(eq(shapesTable.shape_id, shape_id))
                    .orderBy(asc(shapesTable.shape_pt_sequence));
            } else if (route_id) {
                shapes = await psDb
                    .select({
                        shape_id: shapesTable.shape_id,
                        shape_pt_sequence: shapesTable.shape_pt_sequence,
                        shape_pt_lat: shapesTable.shape_pt_lat,
                        shape_pt_lon: shapesTable.shape_pt_lon,
                        shape_dist_traveled: shapesTable.shape_dist_traveled,
                    })
                    .from(shapesTable)
                    .where(
                        inArray(
                            shapesTable.shape_id,
                            psDb
                                .select({
                                    shape_id: tripsTable.shape_id,
                                })
                                .from(tripsTable)
                                .where(eq(tripsTable.route_id, route_id))
                        )
                    )
                    .orderBy(asc(shapesTable.shape_pt_sequence));
            }

            return c.json(shapes);
        }
    );
}

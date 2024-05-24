import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import psDb from "clairvoyance-db";
import { shapes as shapesTable } from "clairvoyance-db/schemas/shapes";
import { asc, eq, inArray } from "drizzle-orm";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import { routes as routesTable } from "clairvoyance-db/schemas/routes";

export default function (hono: Hono) {
    hono.get(
        "/",
        zValidator(
            "query",
            z.object({
                shape_id: z.string().optional(),
                trip_id: z.string().optional(),
            })
        ),
        async (c) => {
            const { shape_id, trip_id } = c.req.valid("query");

            let shapes: Array<typeof shapesTable.$inferSelect> = [];

            if (!shape_id && !trip_id) {
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
            } else if (trip_id) {
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
                        eq(
                            shapesTable.shape_id,
                            psDb
                                .select({
                                    shape_id: tripsTable.shape_id,
                                })
                                .from(tripsTable)
                                .where(eq(tripsTable.trip_id, trip_id))
                        )
                    )
                    .orderBy(asc(shapesTable.shape_pt_sequence));
            }

            return c.json(shapes);
        }
    );
}

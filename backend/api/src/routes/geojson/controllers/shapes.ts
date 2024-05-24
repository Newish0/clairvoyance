import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export default function (hono: Hono) {
    hono.get(
        "/shapes",
        zValidator(
            "query",
            z.object({
                shape_id: z.string().optional(),
                route_id: z.string().optional(),
            })
        ),
        async (c) => {
            c.status(500);
            return c.json({});
        }
    );
}

import { Hono } from "hono";

export default function (hono: Hono) {
    hono.get("/shapes", async (c) => {
        c.status(500);
        return c.json({});
    });
}

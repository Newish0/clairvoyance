import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getAnyActiveMatchingAlerts } from "@/services/alertsService";

const GetAnyActiveMatchingAlertsParamsSchema = z.intersection(
    z.object({
        routeId: z.string().optional(),
        directionId: z.string().transform(Number).optional(),
        stopIds: z.array(z.string()).optional(),
    }),
    z.union([
        z.object({}), // Empty object for the basic case
        z.object({
            tripId: z.string(),
            startDate: z.string(),
            startTime: z.string(),
        }),
        z.object({
            routeId: z.string(),
            directionId: z.string(),
            startDate: z.string(),
            startTime: z.string(),
        }),
    ])
);

const router = new Hono()
    // GET /alerts/active
    .get("/active", zValidator("query", GetAnyActiveMatchingAlertsParamsSchema), async (c) => {
        const query = c.req.valid("query");
        const alerts = await getAnyActiveMatchingAlerts(query);
        return c.json(alerts);
    });

export default router;

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { findAnyActiveAlertsByEntitySelector } from "@/services/alertsService";

const GetAnyActiveAlertsByEntitySelector = z.object({
    agencyId: z.string().optional(),
    routeType: z.string().transform(Number).optional(),
    routeId: z.string().optional(),
    directionId: z.string().transform(Number).optional(),
    stopIds: z.union([z.array(z.string()), z.string()]).optional(),
    stopId: z.string().optional(),
    tripId: z.string().optional(),
    tripStartDate: z.string().optional(),
    tripStartTime: z.string().optional(),
    tripRouteId: z.string().optional(),
    tripDirectionId: z.string().transform(Number).optional(),
});

const router = new Hono()
    // GET /alerts/active
    .get("/active", zValidator("query", GetAnyActiveAlertsByEntitySelector), async (c) => {
        const query = c.req.valid("query");

        // Combine stopId and stopIds query to reduce code duplication
        const stopIds = new Set([
            ...(query.stopIds
                ? Array.isArray(query.stopIds)
                    ? query.stopIds
                    : [query.stopIds]
                : []),
            ...(query.stopId ? [query.stopId] : []),
        ]);

        const selector = {
            agencyId: query.agencyId,
            routeType: query.routeType,
            routeId: query.routeId,
            directionId: query.directionId,
            stopIds: stopIds.size ? [...stopIds] : undefined,
            trip:
                query.tripId ||
                query.tripStartDate ||
                query.tripStartTime ||
                query.tripRouteId ||
                query.tripDirectionId
                    ? {
                          tripId: query.tripId,
                          startDate: query.tripStartDate,
                          startTime: query.tripStartTime,
                          routeId: query.tripRouteId,
                          directionId: query.tripDirectionId,
                      }
                    : undefined,
        };

        const alerts = await findAnyActiveAlertsByEntitySelector(selector);
        return c.json(alerts);
    });

export default router;

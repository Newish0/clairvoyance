import { Elysia, t } from "elysia";
import {
    createLookupForAlerts,
    findAnyActiveAlertsByEntitySelector,
} from "@/services/alertsService";
import { AlertSchema } from "@/schemas/common-body";

const router = new Elysia()
    // GET /alerts/active
    .get(
        "/alerts/active",
        async ({ query }) => {
            {
                // Combine stopId and stopIds query to reduce code duplication
                const stopIds = new Set([
                    ...(query.stopIds || []),
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
                const lookup = await createLookupForAlerts(alerts);
                return {
                    lookup,
                    alerts,
                };
            }
        },
        {
            query: t.Object({
                agencyId: t.Optional(t.String()),
                routeType: t.Optional(t.Number()),
                routeId: t.Optional(t.String()),
                directionId: t.Optional(t.Number()),
                stopIds: t.Optional(t.Array(t.String())),
                stopId: t.Optional(t.String()),
                tripId: t.Optional(t.String()),
                tripStartDate: t.Optional(t.String()),
                tripStartTime: t.Optional(t.String()),
                tripRouteId: t.Optional(t.String()),
                tripDirectionId: t.Optional(t.Number()),
            }),
            response: t.Object({
                lookup: t.Object({
                    stop_names: t.Optional(t.Record(t.String(), t.Nullable(t.String()))),
                }),
                alerts: t.Array(AlertSchema),
            }),
        }
    );

export default router;

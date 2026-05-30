import { alertRouter } from "./routers/alert";
import { routeRouter } from "./routers/route";
import { shapeRouter } from "./routers/shape";
import { stopRouter } from "./routers/stop";
import { tripInstanceRouter } from "./routers/trip-instance";
import { router } from "./trpc";

export const appRouter = router({
    shape: shapeRouter,
    tripInstance: tripInstanceRouter,
    route: routeRouter,
    stop: stopRouter,
    alert: alertRouter,
});

export type AppRouter = typeof appRouter;

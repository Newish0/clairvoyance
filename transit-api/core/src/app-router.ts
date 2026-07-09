import { alertRouter } from "./routers/alert";
import { offlineSyncRouter } from "./routers/offline-sync";
import { shapeRouter } from "./routers/shape";
import { stopRouter } from "./routers/stop";
import { tripInstanceRouter } from "./routers/trip-instance";
import { router } from "./trpc";

export const appRouter = router({
    shape: shapeRouter,
    tripInstance: tripInstanceRouter,
    stop: stopRouter,
    alert: alertRouter,
    offlineSync: offlineSyncRouter,
});

export type AppRouter = typeof appRouter;

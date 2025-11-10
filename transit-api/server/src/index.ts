import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context";
import { alertRouter } from "./routers/alert";
import { routeRouter } from "./routers/route";
import { shapeRouter } from "./routers/shape";
import { stopRouter } from "./routers/stop";
import { tripInstanceRouter } from "./routers/trip-instance";
import { router } from "./trpc";

const port = Bun.env.PORT || 8000;

const appRouter = router({
    shape: shapeRouter,
    tripInstance: tripInstanceRouter,
    route: routeRouter,
    stop: stopRouter,
    alert: alertRouter,
});

export type AppRouter = typeof appRouter;

const handler = (req: Request) =>
    fetchRequestHandler({
        router: appRouter,
        req,
        endpoint: "/",
        /**
         * @see https://trpc.io/docs/v11/context
         */
        createContext,
        /**
         * @see https://trpc.io/docs/v11/error-handling
         */
        onError({ error }) {
            if (error.code === "INTERNAL_SERVER_ERROR") {
                // send to bug reporting
                console.error("Something went wrong", error);
            }
        },

        responseMeta(opts) {
            return {
                headers: new Headers([
                    ["Access-Control-Allow-Origin", "*"],
                    ["Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"],
                ]),
            };
        },
    });

Bun.serve({
    port,
    fetch: handler,
});

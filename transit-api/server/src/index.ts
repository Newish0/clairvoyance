import { createContext } from "./context";
import { shapeRouter } from "./routers/shape";
import { tripRouter } from "./routers/trip";
import { routeRouter } from "./routers/route";
import { stopRouter } from "./routers/stop";
import { alertRouter } from "./routers/alert";
import { router } from "./trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createHTTPServer } from "@trpc/server/adapters/standalone";

const appRouter = router({
    shape: shapeRouter,
    trip: tripRouter,
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
    port: 8000,
    fetch: handler,
});

// const server = createHTTPServer({
//     router: appRouter,
//     createContext,
// });

// server.listen(3000);

import { createContext } from "./context";
import { shapeRouter } from "./routers/shape";
import { tripRouter } from "./routers/trip";
import { router } from "./trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createHTTPServer } from "@trpc/server/adapters/standalone";

const appRouter = router({
    shape: shapeRouter,
    trip: tripRouter,
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

import { createContext } from "./context";
import { shapeRouter } from "./routers/shape";
import { tripRouter } from "./routers/trip";
import { router } from "./trpc";
import { createHTTPServer } from "@trpc/server/adapters/standalone";

const appRouter = router({
    shape: shapeRouter,
    trip: tripRouter,
});

export type AppRouter = typeof appRouter;

const server = createHTTPServer({
    router: appRouter,
    createContext,
});

server.listen(3000);

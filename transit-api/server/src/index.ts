import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context";
import { appRouter } from "./app-router";

export type { AppRouter } from "./types";

const port = Bun.env.PORT || 8000;

const handler = (req: Request) =>
    fetchRequestHandler({
        router: appRouter,
        req,
        endpoint: "/",
        createContext,
        onError({ error }) {
            if (error.code === "INTERNAL_SERVER_ERROR") {
                console.error("Something went wrong", error);
            }
        },

        responseMeta() {
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
    hostname: "0.0.0.0",
    fetch: handler,
    idleTimeout: 30,
});

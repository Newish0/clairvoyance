import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
    createTRPCClient,
    httpBatchLink,
    httpSubscriptionLink,
    loggerLink,
    splitLink,
    unstable_localLink,
} from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import maplibre from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import superjson from "superjson";
import { appRouter } from "transit-api-core";
import type { AppRouter } from "transit-api-core/types";
import PageLoader from "./components/page-loader.tsx";
import { getDb } from "./offline/db.ts";
import { IdbSource } from "./offline/pmtiles-source";

import "./globals.css";
import reportWebVitals from "./reportWebVitals.ts";

import { routeTree } from "./routeTree.gen";

// Global singleton: Setup maplibre protocol to support pmtiles
export const pmtilesProtocol = new Protocol();
maplibre.addProtocol("pmtiles", pmtilesProtocol.tile);

// Re-register IdbSource-backed PMTiles for previously downloaded offline areas
(async () => {
    try {
        const raw = localStorage.getItem("offline-areas");
        if (!raw) return;
        const areas = JSON.parse(raw);
        for (const area of areas) {
            if (area.tilesUrl && area.state === "downloaded") {
                pmtilesProtocol.add(new PMTiles(new IdbSource(area.tilesUrl)));
            }
        }
    } catch {
        // ponytail: silent - offline areas best-effort on reload
    }
})();

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            networkMode: "always",
        },
        mutations: {
            networkMode: "always",
        },
    },
});

// API URL from environment variable, default to localhost:8000 for local development
// Can be overridden via VITE_API_URL env var (e.g., in Docker build)
const API_URL = import.meta.env.VITE_API_URL || "./api";

export const trpcClient = createTRPCClient<AppRouter>({
    links: [
        loggerLink(),

        splitLink({
            condition: (op) => {
                // Failsafe to disallow downloading offline data from offline data
                if (op.path.startsWith("offlineSync")) return true;

                // offline-mode check: disabled -> always use online link, no PGlite init
                const offlineModeEnabled = localStorage.getItem("offline-mode-enabled") === "true";
                return offlineModeEnabled ? navigator.onLine : true;
            },
            true: splitLink({
                condition: (op) => op.type === "subscription",
                true: httpSubscriptionLink({
                    url: API_URL,
                    transformer: superjson,
                }),
                false: httpBatchLink({
                    url: API_URL,
                    transformer: superjson,
                }),
            }),
            false: unstable_localLink({
                router: appRouter,
                createContext: async () => ({ db: await getDb() }),
                onError: (opts) => {
                    console.error("Error:", opts.error);
                },
                transformer: superjson,
            }),
        }),
    ],
});

export type TrpcRouterOutputs = inferRouterOutputs<AppRouter>;

export const trpcOptions = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
});

// Create a new router instance
const router = createRouter({
    routeTree,
    context: {
        trpcClient,
        trpcOptions,
        queryClient,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <PageLoader />,
    Wrap: function WrapComponent({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <RouterProvider router={router} />
        </StrictMode>,
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

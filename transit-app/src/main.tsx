import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
    createTRPCClient,
    httpBatchLink,
    httpSubscriptionLink,
    loggerLink,
    splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import superjson from "superjson";
import type { AppRouter } from "../../transit-api/server/src/index.ts";

import reportWebVitals from "./reportWebVitals.ts";
import "./globals.css";

import { routeTree } from "./routeTree.gen";
import type { inferRouterOutputs } from "@trpc/server";

export const queryClient = new QueryClient();

// API URL from environment variable, default to localhost:8000 for local development
// Can be overridden via VITE_API_URL env var (e.g., in Docker build)
const API_URL = import.meta.env.VITE_API_URL || "./api";

export const trpcClient = createTRPCClient<AppRouter>({
    links: [
        loggerLink(),
        splitLink({
            // uses the httpSubscriptionLink for subscriptions
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
    ],
});

export type TrpcRouterOutputs = inferRouterOutputs<AppRouter>;

export const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
});

// Create a new router instance
const router = createRouter({
    routeTree,
    context: {
        trpc,
        queryClient,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <div className={`p-2 text-2xl`}>Loading spinner goes here</div>,
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
        </StrictMode>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

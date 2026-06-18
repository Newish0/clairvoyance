import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import type { QueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "transit-api";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { GeolocationProvider } from "@/components/geolocation-provider";
import type { TRPCClient } from "@trpc/client";

export interface RouterAppContext {
    trpcClient: TRPCClient<AppRouter>;
    trpcOptions: TRPCOptionsProxy<AppRouter>;
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
    component: () => (
        <>
            <ThemeProvider defaultTheme="dark" storageKey="transit-app-ui-theme">
                {/* IMPORTANT: Toaster MUST mount outside of GeolocationProvider
                     because geolocation prompt uses Toaster */}
                <Toaster />
                <GeolocationProvider options={{ enableHighAccuracy: true }}>
                    <Outlet />
                </GeolocationProvider>
            </ThemeProvider>

            {import.meta.env.DEV && (
                <TanStackDevtools
                    config={{
                        position: "bottom-right",
                    }}
                    plugins={[
                        {
                            name: "Tanstack Router",
                            render: <TanStackRouterDevtoolsPanel />,
                        },
                        {
                            name: "React Query",
                            render: <ReactQueryDevtoolsPanel />,
                        },
                    ]}
                />
            )}
        </>
    ),
});

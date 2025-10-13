import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import type { QueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../transit-api/server/src/index";

import { ThemeProvider } from "@/components/theme-provider";

export interface RouterAppContext {
    trpc: TRPCOptionsProxy<AppRouter>;
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
    component: () => (
        <>
            <ThemeProvider defaultTheme="dark" storageKey="transit-app-ui-theme">
                <Outlet />
            </ThemeProvider>

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
        </>
    ),
});

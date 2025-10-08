import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import type { QueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../transit-api/server/src/index";

import Header from "../components/Header";

export interface RouterAppContext {
    trpc: TRPCOptionsProxy<AppRouter>;
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
    component: () => (
        <>
            <Header />
            <Outlet />
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
                        render: <ReactQueryDevtools />,
                    },
                ]}
            />
        </>
    ),
});

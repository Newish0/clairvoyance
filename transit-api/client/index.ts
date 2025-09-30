import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/src/index";

const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: "http://localhost:3000",
        }),
    ],
});

trpc.greet.query().then((result) => console.log(result));

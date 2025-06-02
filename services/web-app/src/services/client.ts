// client.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "gtfs-api";
import EndpointEnv from "~/constants/endpoint-env";

export const client = treaty<App>(EndpointEnv.GTFS_API_ENDPOINT);

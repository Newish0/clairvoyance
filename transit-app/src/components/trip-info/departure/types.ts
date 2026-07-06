import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "transit-api-core/types";

export type Departure = inferProcedureOutput<AppRouter["tripInstance"]["getNearbyActive"]>[number];

import { appRouter } from "../app-router";
import type { Context } from "../context";

/**
 * Creates a tRPC caller with the given database context.
 * Use this in integration tests to call procedures directly.
 */
export function createCaller(db: Context["db"]) {
    return appRouter.createCaller({ db });
}

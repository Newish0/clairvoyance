import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { DatabaseManager } from "./database/mongo";

const MONGO_CONNECTION_STRING =
    Bun.env.MONGO_CONNECTION_STRING || "mongodb://localhost:27017?replicaSet=rs0";
const MONGO_DB_NAME = Bun.env.MONGO_DB_NAME || "gtfs_data";

export async function createContext(opts: FetchCreateContextFnOptions) {
    const dbManager = DatabaseManager.getInstance(MONGO_CONNECTION_STRING, MONGO_DB_NAME);
    await dbManager.connect();

    return {
        db: dbManager.db,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

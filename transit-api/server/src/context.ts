import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { DatabaseManager } from "./database/mongo";

const MONGO_CONNECTION_STRING = Bun.env.MONGO_CONNECTION_STRING || "mongodb://localhost:27017";
const MONGO_DB_NAME = Bun.env.MONGO_DB_NAME || "gtfs_data";

export async function createContext(opts: CreateNextContextOptions) {
    const dbManager = DatabaseManager.getInstance(MONGO_CONNECTION_STRING, MONGO_DB_NAME);
    await dbManager.connect();

    return {
        db: dbManager.db,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

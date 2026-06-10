import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getDb } from "./db";

const DATABASE_URL = process.env.DATABASE_URL!;
const db = getDb(DATABASE_URL);

export async function createContext(opts: FetchCreateContextFnOptions) {
    return {
        db,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

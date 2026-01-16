import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { drizzle } from "drizzle-orm/bun-sql";

const DATABASE_URL = Bun.env.DATABASE_URL!;
export async function createContext(opts: FetchCreateContextFnOptions) {
    const db = drizzle(DATABASE_URL);
    return {
        db,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

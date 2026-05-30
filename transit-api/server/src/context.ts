import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/bun-sql";

import { SQL } from "bun";

const DATABASE_URL = process.env.DATABASE_URL!;

export async function createContext(opts: FetchCreateContextFnOptions) {
    const client = new SQL(DATABASE_URL);
    const db = drizzle({
        client,
        schema: {
            ...tables,
            ...views,
        },
        relations: schemaRelations,
    });

    return {
        db,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

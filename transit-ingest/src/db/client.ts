import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { schemaRelations } from "database/models/relations";

export function getDb(url = process.env.DATABASE_URL) {
    if (!url) {
        throw new Error("DATABASE_URL must be provided or set in environment");
    }

    const client = new SQL(url);
    const db = drizzle({ client, schema: { ...tables, ...views }, relations: schemaRelations });

    return db;
}

export type Db = ReturnType<typeof getDb>;

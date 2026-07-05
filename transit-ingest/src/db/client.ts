import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function getDb(url: string): Db {
    if (!url) {
        throw new Error("DATABASE_URL must be provided or set in environment");
    }

    const pool = new Pool({
        connectionString: url,
    });
    const db = drizzle({
        client: pool,
        schema: { ...tables, ...views },
        relations: schemaRelations,
    });

    return db;
}

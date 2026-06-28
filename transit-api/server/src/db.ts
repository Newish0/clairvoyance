import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { schemaRelations } from "database/models/relations";

export function getDb(url: string) {
    if (!url) {
        throw new Error("DATABASE_URL must be provided or set in environment");
    }

    const pool = new Pool({
        connectionString: url,
        options: "-c statement_timeout=15000",
    });
    const db = drizzle({
        client: pool,
        schema: { ...tables, ...views },
        relations: schemaRelations,
    });

    return db;
}

export type Db = ReturnType<typeof getDb>;

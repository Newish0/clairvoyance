import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL!;

export function getDb(url: string = DATABASE_URL): Db {
    if (!url) {
        throw new Error("url must be provided or set in environment");
    }

    const pool = new Pool({
        connectionString: url,
        options: "-c statement_timeout=15000",
    });
    const db = drizzle({
        client: pool,
        relations: schemaRelations,
    });

    return db;
}

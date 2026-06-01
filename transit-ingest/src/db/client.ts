import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as tables from "database/models/tables";
import * as views from "database/models/views";
import { schemaRelations } from "database/models/relations";

const url = process.env.DATABASE_URL;

if (!url) {
    throw new Error("DATABASE_URL must be provided or set in environment");
}

const client = new SQL(url);

export const db = drizzle({ client, schema: { ...tables, ...views }, relations: schemaRelations });

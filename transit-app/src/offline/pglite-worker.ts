import { IdbFs, PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { worker } from "@electric-sql/pglite/worker";
import { getTableName, getTableUniqueName } from "drizzle-orm";
import * as drizzleTables from "database/models/tables";

import migrations from "./migrations.gen.json";

const DATABASE_PERSIST_PATH = "transit-pglite";
const MIGRATIONS_TABLE = "__drizzle_migrations";

interface MigrationRow {
    id: number;
    hash: string;
    timestamp: number;
}

/** Execute migrations */
const migrate = async (pg: PGlite) => {
    await pg.exec(`CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
            id SERIAL PRIMARY KEY,
            hash TEXT UNIQUE NOT NULL,
            timestamp BIGINT NOT NULL
        )`);

    const applied = await pg.query<MigrationRow>(`SELECT hash FROM "${MIGRATIONS_TABLE}"`);
    const appliedHashes = new Set(applied.rows.map((r) => r.hash));

    for (const m of migrations) {
        if (appliedHashes.has(m.id)) continue;
        await pg.exec(m.sql);
        await pg.query(`INSERT INTO "${MIGRATIONS_TABLE}" (hash, timestamp) VALUES ($1, $2)`, [
            m.id,
            Date.now(),
        ]);
    }
};

/** Allow only subset of data -> need not follow foreign key constraints */
const removeFkConstraints = async (pg: PGlite, tables: string[]) => {
    if (tables.length === 0) return;

    const { rows } = await pg.query(
        `
        SELECT format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I;',
            n.nspname,
            c.relname,
            con.conname
        ) AS sql
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname = 'public'
          AND c.relname = ANY($1::text[]);
        `,
        [tables],
    );

    for (const { sql } of rows as { sql: string }[]) {
        await pg.exec(sql);
    }
};

/** Convert SERIAL / IDENTITY columns into plain INTEGER columns */
const removeAutoIncrement = async (pg: PGlite, tables: string[]) => {
    if (tables.length === 0) return;

    // Drop IDENTITY from identity columns
    const { rows: identityRows } = await pg.query(
        `
        SELECT format(
            'ALTER TABLE %I.%I ALTER COLUMN %I DROP IDENTITY IF EXISTS;',
            table_schema,
            table_name,
            column_name
        ) AS sql
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND is_identity = 'YES';
        `,
        [tables],
    );

    for (const { sql } of identityRows as { sql: string }[]) {
        await pg.exec(sql);
    }

    // Drop DEFAULT nextval(...) from serial columns
    const { rows: serialRows } = await pg.query(
        `
        SELECT format(
            'ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT;',
            table_schema,
            table_name,
            column_name
        ) AS sql
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND column_default LIKE 'nextval(%';
        `,
        [tables],
    );

    for (const { sql } of serialRows as { sql: string }[]) {
        await pg.exec(sql);
    }
};

worker({
    async init() {
        const pg = new PGlite({
            fs: new IdbFs(DATABASE_PERSIST_PATH),
            extensions: { postgis },
        });

        console.debug("[pglite worker] init", DATABASE_PERSIST_PATH);

        await migrate(pg);
        console.debug("[pglite worker] migrations applied");

        const tables = Object.values(drizzleTables).map(getTableUniqueName);

        await removeFkConstraints(pg, tables);
        console.debug("[pglite worker] removed fk constraints");

        await removeAutoIncrement(pg, tables);
        console.debug("[pglite worker] removed auto increment");

        return pg;
    },
});

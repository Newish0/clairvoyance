import { IdbFs, PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { worker } from "@electric-sql/pglite/worker";

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

worker({
    async init() {
        const pg = new PGlite({
            fs: new IdbFs(DATABASE_PERSIST_PATH),
            extensions: { postgis },
        });

        console.debug("[pglite worker] init", DATABASE_PERSIST_PATH);

        await migrate(pg);

        console.debug("[pglite worker] migrations applied");

        return pg;
    },
});

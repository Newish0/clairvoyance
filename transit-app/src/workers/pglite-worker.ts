import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { OpfsAhpFS } from "@electric-sql/pglite/opfs-ahp";
import { worker } from "@electric-sql/pglite/worker";

import migrations from "./migrations.gen.json";

const DATABASE_PERSIST_PATH = "./data/transit-pglite";
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

    const applied = await pg.query<MigrationRow>(`SELECT hash FROM "__drizzle_migrations"`);
    const appliedHashes = new Set(applied.rows.map((r) => r.hash));

    for (const m of migrations) {
        if (appliedHashes.has(m.id)) continue;
        await pg.exec(m.sql);
        await pg.query(`INSERT INTO "__drizzle_migrations" (hash, timestamp) VALUES ($1, now())`, [
            m.id,
        ]);
    }
};

worker({
    async init() {
        const pg = new PGlite({
            fs: new OpfsAhpFS(DATABASE_PERSIST_PATH),
            extensions: { postgis },
        });

        await migrate(pg);

        return pg;
    },
});

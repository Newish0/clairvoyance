import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import * as schema from "database";
import path from "node:path";

export interface TestDatabase {
    db: ReturnType<typeof drizzle<typeof schema>>;
    url: string;
    dbName: string;
    teardown: () => Promise<void>;
}

function replaceDbName(urlString: string, newDbName: string): string {
    const url = new URL(urlString);
    url.pathname = `/${newDbName}`;
    return url.toString();
}

/**
 * Creates a temporary PostgreSQL database with a unique name,
 * installs PostGIS, runs all migrations, and returns a drizzle instance.
 *
 * Call `teardown()` to drop the database after tests complete.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
    const databaseUrl = Bun.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL environment variable is required for tests");
    }

    const dbName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const adminUrl = replaceDbName(databaseUrl, "postgres");

    // Create the test database
    const adminSql = new SQL(adminUrl);
    try {
        await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
    } finally {
        adminSql.close();
    }

    const testUrl = replaceDbName(databaseUrl, dbName);

    // Install PostGIS (required by geometry columns in the schema)
    const installSql = new SQL(testUrl);
    await installSql.unsafe("CREATE EXTENSION IF NOT EXISTS postgis");
    installSql.close();

    // Connect via drizzle and run migrations
    const testDb = drizzle(testUrl, { schema });
    const migrationsFolder = path.resolve(
        import.meta.dir,
        "../../../../database/drizzle/migrations",
    );

    await migrate(testDb, { migrationsFolder });

    return {
        db: testDb,
        url: testUrl,
        dbName,
        async teardown() {
            testDb.$client.close();
            const cleanupSql = new SQL(adminUrl);
            try {
                await cleanupSql.unsafe(`
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = '${dbName}'
                    AND pid <> pg_backend_pid()
                `);
                await cleanupSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
            } finally {
                cleanupSql.close();
            }
        },
    };
}

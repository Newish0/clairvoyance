import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "dotenv/config";
import path from "path";

const config = {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
};

const queryClient = postgres({ ...config });
const db = drizzle(queryClient);

export default db;

export const migrateDb = async () => {
    const migrationClient = postgres({
        ...config,
        max: 1,
    });

    await migrate(drizzle(migrationClient), { migrationsFolder: path.resolve("drizzle") });
};

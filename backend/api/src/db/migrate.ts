import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "dotenv/config";

const host = process.env.DB_HOST!;
const port = parseInt(process.env.DB_PORT!);
const user = process.env.DB_USER!;
const password = process.env.DB_PASSWORD!;
const database = process.env.DB_NAME!;

const url = `postgres://${user}:${password}@${host}:${port}/${database}`;
console.log(url);

// for migrations
const migrationClient = postgres(url, {
    max: 1,
});
migrate(drizzle(migrationClient), { migrationsFolder: "drizzle" });

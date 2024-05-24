import "dotenv/config";
import type { Config } from "drizzle-kit";

const DEFAULT_CONFIG = {
    host: "localhost",
    port: "32769",
    user: "postgres",
    password: "postgrespw",
    database: "clairvoyance",
};

export default {
    schema: "./schemas",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        host: process.env.DB_HOST ?? DEFAULT_CONFIG.host,
        port: parseInt(process.env.DB_PORT ?? DEFAULT_CONFIG.port),
        user: process.env.DB_USER ?? DEFAULT_CONFIG.user,
        password: process.env.DB_PASSWORD ?? DEFAULT_CONFIG.password,
        database: process.env.DB_NAME ?? DEFAULT_CONFIG.database,
    },
} satisfies Config;

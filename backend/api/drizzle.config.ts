import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
    schema: "./src/db/schemas",
    out: "./drizzle",
    dialect: "postgresql", 
    dbCredentials: {
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT!),
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!,
    },
} satisfies Config;

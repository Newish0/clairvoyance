import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./migrations",
    schema: "./models/index.ts",
    dialect: "postgresql",
    extensionsFilters: ["postgis"],
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});

import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { extractTiles } from "./vite-plugin-extract-tiles";
import { drizzleMigrations } from "./vite-plugin-migrations";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        extractTiles({
            outputDir: resolve(__dirname, "public"),
            dirName: "pmtiles",
        }),
        drizzleMigrations({
            migrationsDir: resolve(dirname(require.resolve("database")), "migrations"),
            outputPath: resolve(__dirname, "src/offline/migrations.gen.json"),
        }),
        tanstackRouter({ autoCodeSplitting: true }),
        tailwindcss(),
        viteReact({
            babel: {
                plugins: ["babel-plugin-react-compiler"],
            },
        }),
    ],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
    optimizeDeps: {
        exclude: ["@electric-sql/pglite", "@electric-sql/pglite-postgis"],
    },
    build: {
        ssr: false,
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
});

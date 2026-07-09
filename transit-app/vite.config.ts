import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm,data,tar,gz,json}"],
                globIgnores: ["**/*.pmtiles"],
                navigateFallback: "/index.html",
                skipWaiting: true,
                clientsClaim: true,
            },
            manifest: false,
            devOptions: { enabled: false },
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
    worker: {
        format: "es",
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

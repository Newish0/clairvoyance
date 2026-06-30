import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { extractTiles } from "./vite-plugin-extract-tiles";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        extractTiles({
            outputDir: resolve(__dirname, "public"),
            dirName: "pmtiles",
        }),
        tanstackRouter({ autoCodeSplitting: true }),
        tailwindcss(),
        viteReact({
            babel: {
                plugins: ["babel-plugin-react-compiler"],
            },
        }),
    ],
    // test: {
    //     globals: true,
    //     environment: "jsdom",
    // },

    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
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

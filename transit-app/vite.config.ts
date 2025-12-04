import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
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

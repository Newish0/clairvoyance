import { defineConfig } from 'astro/config';
import node from "@astrojs/node";
import path from "path";
import { fileURLToPath } from 'url';
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";


const __dirname = path.dirname(fileURLToPath(import.meta.url));


// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ]
});
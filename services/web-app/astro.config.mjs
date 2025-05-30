// @ts-check
import { defineConfig } from "astro/config";

import solidJs from '@astrojs/solid-js';

import sitemap from '@astrojs/sitemap';

import tailwind from '@astrojs/tailwind';

import node from '@astrojs/node';


// https://astro.build/config
export default defineConfig({
  integrations: [solidJs(), sitemap(), tailwind({
    applyBaseStyles: false
  })],

  // Use deployment site address and base path in production.
  // Otherwise, use the default settings in development.
  ...(import.meta.env.PROD ? {
    site: import.meta.env.SITE,
    base: import.meta.env.BASE,
  } : {}),

  adapter: node({
    mode: 'standalone'
  }),

  vite: {
    ssr: {
      noExternal: true,
    },
  }
});
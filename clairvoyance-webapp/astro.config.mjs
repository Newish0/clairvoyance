// @ts-check
import { defineConfig } from 'astro/config';

import solidJs from '@astrojs/solid-js';

import sitemap from '@astrojs/sitemap';

import tailwind from '@astrojs/tailwind';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  integrations: [solidJs(), sitemap(), tailwind({
    applyBaseStyles: false
  })],

  adapter: node({
    mode: 'standalone'
  }),

  vite: {
    ssr: {
      noExternal: true,
    },
  }
});
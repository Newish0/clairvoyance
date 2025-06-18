// @ts-check
import { defineConfig } from "astro/config";
import solidJs from '@astrojs/solid-js';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
// import AstroPWA from '@vite-pwa/astro';
// import pkgJson from './package.json';



const site = Bun.env.SITE || undefined;
const base = Bun.env.BASE || "/";



// https://astro.build/config
export default defineConfig({
  integrations: [
    solidJs(),
    sitemap(),
    tailwind({
      applyBaseStyles: false
    }),

    // FIXME: Disabled until we figure out why it's breaking client router... (likely to do with caching)
    // AstroPWA({
    //   mode: 'development',
    //   base: '/',
    //   scope: '/',
    //   includeAssets: ['favicon.ico'],
    //   registerType: 'autoUpdate',
    //   manifest: {
    //     name: pkgJson.displayName,
    //     short_name: pkgJson.name,
    //     theme_color: '#ffffff',
    //     icons: [
    //       {
    //         src: 'icon-192.png',
    //         sizes: '192x192',
    //         type: 'image/png',
    //       },
    //       {
    //         src: 'icon-512.png',
    //         sizes: '512x512',
    //         type: 'image/png',
    //       },
    //       // {
    //       //   src: 'icon-512-maskable.png',
    //       //   sizes: '512x512',
    //       //   type: 'image/png',
    //       //   purpose: 'any maskable',
    //       // },
    //     ],
    //     // screenshots: [
    //     //   {
    //     //     src: "img/mobile-screenshot1.png",
    //     //     type: "image/png",
    //     //     sizes: "540x720"
    //     //   },
    //     //   {
    //     //     src: "img/mobile-screenshot2.png",
    //     //     type: "image/png",
    //     //     sizes: "540x720"
    //     //   }
    //     // ],
    //   },
    //   // workbox: {
    //   //   navigateFallback: '/',
    //   //   globPatterns: ['**/*.{css,js,html,svg,png,ico,txt}'],
    //   // },
    //   devOptions: {
    //     enabled: true,
    //     navigateFallbackAllowlist: [/^\/$/],
    //   },
    //   experimental: {
    //     directoryAndTrailingSlashHandler: true,
    //   },
    // })
  ],

  site, base,

  adapter: node({
    mode: 'standalone'
  }),

  vite: {
    ssr: {
      noExternal: true,
    },
  }
});
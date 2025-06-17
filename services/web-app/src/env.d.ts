/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/solid" />
/// <reference types="vite-plugin-pwa/info" />

interface ImportMetaEnv {
    readonly PUBLIC_GTFS_API_ENDPOINT: string;
    readonly GTFS_API_ENDPOINT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

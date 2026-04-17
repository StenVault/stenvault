/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_WS_URL: string;

    readonly VITE_APP_ID: string;
    readonly VITE_TURNSTILE_SITE_KEY: string;
    readonly DEV: boolean;
    readonly MODE: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

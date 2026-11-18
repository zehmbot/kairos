/** Kairos only ever listens on the loopback interface. */
export const HOST = "127.0.0.1";

/** Port of the hub (API + built UI). Override with KAIROS_PORT or --port. */
export const DEFAULT_HUB_PORT = 7340;

/** Port of the Vite dev server used by `npm run dev`. */
export const DEV_WEB_PORT = 7341;

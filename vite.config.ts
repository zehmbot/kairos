/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { DEFAULT_HUB_PORT, DEV_WEB_PORT, HOST } from "./src/shared/ports.ts";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    host: HOST,
    port: DEV_WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": { target: `http://${HOST}:${DEFAULT_HUB_PORT}`, changeOrigin: true },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

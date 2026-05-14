import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackRouter({}), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single copy of React across all chunks — prevents the
    // "Cannot read properties of undefined (reading 'useLayoutEffect')" crash
    // that occurs when the router chunk evaluates before the react chunk.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    port: 3001,
    host: "0.0.0.0",
    proxy: {
      "/rpc": { target: "http://localhost:3000", changeOrigin: true },
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Group the entire React ecosystem (react, react-dom, scheduler,
          // use-sync-external-store) into ONE chunk. Previously "scheduler"
          // wasn't matched and landed in the router chunk, creating a circular
          // chunk dependency that left React undefined at router init time.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-is/") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/")
          ) {
            return "vendor-react";
          }
          // Heavy standalone libs that don't import React themselves
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) {
            return "vendor-recharts";
          }
          if (id.includes("date-fns")) {
            return "vendor-dates";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});

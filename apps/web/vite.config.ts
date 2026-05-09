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
  },
  server: {
    port: 3001,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
              return "vendor-recharts";
            }
            if (id.includes("react-hook-form") || id.includes("@hookform")) {
              return "vendor-forms";
            }
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query")) {
              return "vendor-tanstack-query";
            }
            if (id.includes("@tanstack/react-router") || id.includes("@tanstack/router")) {
              return "vendor-tanstack-router";
            }
            if (id.includes("react-dom") || id.includes("react/") || id.includes("/react.")) {
              return "vendor-react";
            }
            if (id.includes("lucide-react")) {
              return "vendor-lucide";
            }
            if (id.includes("date-fns")) {
              return "vendor-dates";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});

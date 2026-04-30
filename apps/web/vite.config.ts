import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: process.env.VITE_STRICT_PORT === "true",
    proxy: {
      "/api": process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001",
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Local dev-only tool, never exposed beyond localhost/the docker-compose
    // network — Vite's Host-header allowlist (DNS-rebinding protection)
    // would otherwise 403 requests that arrive as e.g. "web:5173" instead
    // of "localhost:5173" (docker-compose service name, other containers).
    allowedHosts: true,
  },
});

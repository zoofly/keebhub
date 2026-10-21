import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite dev` runs the SPA and the Worker (in workerd, with local D1) on one
// port; `vite build` emits dist/client plus the Worker and its wrangler.json.
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // No source maps in production builds.
    sourcemap: false,
  },
});

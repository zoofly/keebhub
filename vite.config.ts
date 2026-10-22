import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { msw } from "msw/vite";
import { defineConfig } from "vite";

// `vite dev` runs the SPA and the Worker (in workerd, with local D1) on one
// port; `vite build` emits dist/client plus the Worker and its wrangler.json.
//
// msw(): serves mockServiceWorker.js in dev and emits it only into builds
// whose client bundle still imports `virtual:msw`. main.tsx guards that import
// with VITE_USE_MOCKS, which is "true" only in .env.development and .env.e2e,
// so a production build (`vite build`) contains neither the mocks nor the
// worker script.
export default defineConfig({
  plugins: [react(), tailwindcss(), msw(), cloudflare()],
  build: {
    // No source maps in production builds.
    sourcemap: false,
  },
});

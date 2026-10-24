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
// with VITE_USE_MOCKS, which only .env.mock sets (`npm run dev:mock`), so no
// build contains the mocks or the worker script (e2e/build-hygiene.spec.ts
// checks).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    msw(),
    cloudflare({
      // Local D1 and other state: .wrangler/state by default. The e2e server
      // (e2e/server.ts) points this at its own throwaway directory.
      persistState: process.env.KEEBHUB_LOCAL_STATE
        ? { path: process.env.KEEBHUB_LOCAL_STATE }
        : true,
    }),
  ],
  build: {
    // No source maps in production builds.
    sourcemap: false,
  },
});

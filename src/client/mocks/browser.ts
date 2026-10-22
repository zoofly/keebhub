// Starts the MSW mocks in the browser (dev and e2e builds only; main.tsx
// imports this behind VITE_USE_MOCKS, so production builds don't contain it).
import { db } from "./db";
import { handlers, setMockLatency } from "./handlers";

declare global {
  interface Window {
    /** Test hooks for the e2e suite. Only present when the mocks are on. */
    __keebhubMocks?: {
      reset: () => void;
      expireSession: () => void;
      failNext: (method: string, path: string, times?: number) => void;
    };
  }
}

export async function startBrowserMocks() {
  const { network } = await import("virtual:msw");
  const quiet = import.meta.env.MODE !== "development";
  network.configure({ handlers, onUnhandledFrame: "bypass", context: { quiet } });
  await network.enable();

  // A little latency so loading states are visible in dev; e2e builds skip it.
  setMockLatency(import.meta.env.MODE === "development" ? 250 : 0);

  window.__keebhubMocks = {
    reset: () => db.reset(),
    expireSession: () => {
      db.state.sessionUserId = null;
      db.save();
    },
    failNext: (method, path, times = 1) => {
      db.state.failNext[`${method.toUpperCase()} ${path}`] = times;
      db.save();
    },
  };
  console.log("[keebhub] API mocked with MSW (src/client/mocks)");
}

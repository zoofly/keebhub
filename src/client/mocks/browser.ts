// Starts the MSW mocks in the browser (`npm run dev:mock` only; main.tsx
// imports this behind VITE_USE_MOCKS, so builds don't contain it).
import { handlers, setMockLatency } from "./handlers";

export async function startBrowserMocks() {
  const { network } = await import("virtual:msw");
  network.configure({ handlers, onUnhandledFrame: "bypass", context: { quiet: false } });
  await network.enable();

  // A little latency so loading states are visible.
  setMockLatency(250);

  console.log("[keebhub] API mocked with MSW (src/client/mocks)");
}

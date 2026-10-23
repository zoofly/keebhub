import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { USE_MOCKS } from "./lib/config";
import { loginPathFor } from "./lib/safeNext";
import { endSession, setUnauthorizedHandler } from "./lib/session";
import { toast } from "./lib/toast";
import { createQueryClient } from "./queryClient";
import { createAppRouter } from "./router";

async function enableMocks() {
  // Statically false in production builds, so Vite drops the mocks and the
  // msw plugin doesn't emit mockServiceWorker.js.
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const { startBrowserMocks } = await import("./mocks/browser");
    await startBrowserMocks();
  }
}

async function start() {
  if (USE_MOCKS) {
    await enableMocks();
  }

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Missing #root element");
  }

  let redirecting = false;
  const queryClient = createQueryClient(() => onUnauthorized());
  const router = createAppRouter(queryClient);

  // A 401 anywhere means the session expired or was revoked: forget all
  // cached data (not just `me`) and go to login, coming back afterwards.
  function onUnauthorized() {
    if (redirecting) {
      return;
    }
    redirecting = true;
    const { pathname, search } = router.state.location;
    toast.info("Your session has ended", "Please log in again.");
    void endSession(queryClient, () =>
      router.navigate(loginPathFor(`${pathname}${search}`), { replace: true }),
    ).finally(() => {
      redirecting = false;
    });
  }
  setUnauthorizedHandler(onUnauthorized);

  createRoot(root).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  );
}

void start();

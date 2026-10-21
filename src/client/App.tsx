import { useEffect, useState } from "react";
import { api } from "./api";

type ApiStatus = "checking" | "ok" | "unavailable";

const statusText: Record<ApiStatus, string> = {
  checking: "Checking the API…",
  ok: "API: ok",
  unavailable: "API: unavailable",
};

export function App() {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    api.api.health
      .$get(undefined, { init: { signal: controller.signal } })
      .then(async (res) => {
        if (res.status !== 200) {
          setStatus("unavailable");
          return;
        }
        const body = await res.json();
        setStatus(body.status === "ok" ? "ok" : "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>keebhub</h1>
      <p>The mechanical keyboard marketplace is being rebuilt on Cloudflare.</p>
      <p role="status">{statusText[status]}</p>
    </main>
  );
}

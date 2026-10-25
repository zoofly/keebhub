import { useQuery } from "@tanstack/react-query";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { isTurnstileKeyUsable } from "../lib/config";
import { configQuery } from "../lib/queries";
import { Button } from "./ui/button";

// Cloudflare Turnstile, rendered explicitly. The public site key comes from
// GET /api/config at runtime; the secret stays a Worker secret (siteverify).
// CSP: script-src and frame-src allow https://challenges.cloudflare.com.

type RenderOptions = {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

export type TurnstileApi = {
  render: (container: HTMLElement, options: RenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Turnstile's "flexible" widget is at least 300px wide. Narrower containers
 * (small phones, and the register card nested in the home page's hero at
 * 360-375px) get the 150px "compact" widget instead, so the page never
 * scrolls sideways.
 */
export const TURNSTILE_FLEXIBLE_MIN_WIDTH = 300;

export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () =>
        window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
      script.onerror = () => {
        script.remove();
        scriptPromise = null;
        reject(new Error("Turnstile failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = {
  /** Clears the token and shows a fresh challenge (tokens are single-use). */
  reset: () => void;
};

type TurnstileProps = {
  /** Called with a token, or with null when it expires or errors. */
  onToken: (token: string | null) => void;
  action: "login" | "register";
  ref?: Ref<TurnstileHandle>;
};

export function Turnstile({ onToken, action, ref }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const config = useQuery(configQuery);
  const siteKey = config.data?.turnstileSiteKey ?? null;
  const usable = siteKey !== null && isTurnstileKeyUsable(siteKey);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
      }
    },
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load after a failure
  useEffect(() => {
    if (!siteKey || !usable) {
      return undefined;
    }
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) {
          return;
        }
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          size:
            container.current.clientWidth >= TURNSTILE_FLEXIBLE_MIN_WIDTH ? "flexible" : "compact",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("failed");
        }
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
      widgetId.current = undefined;
    };
  }, [action, attempt, siteKey, usable]);

  const retry = () => {
    setStatus("loading");
    if (config.isError) {
      void config.refetch();
    }
    setAttempt((n) => n + 1);
  };

  if (config.isSuccess && !usable) {
    return (
      <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink">
        The security check isn't set up on this site yet, so signing in won't work.
      </p>
    );
  }

  return (
    <div className="min-h-[65px]">
      {/* Turnstile renders its own accessible iframe in here. */}
      <div ref={container} className="cf-turnstile" />
      {(status === "loading" || config.isPending) && !config.isError && (
        <p className="text-sm text-muted" role="status">
          Loading the security check…
        </p>
      )}
      {(status === "failed" || config.isError) && (
        <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
          <p className="text-danger">
            The security check couldn't load. Check your connection or content blocker.
          </p>
          <Button size="sm" variant="outline" onClick={retry}>
            Retry check
          </Button>
        </div>
      )}
    </div>
  );
}

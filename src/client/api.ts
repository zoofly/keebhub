import { hc } from "hono/client";
import type { AppType } from "../worker/index";

/** Typed client for the Worker API (same origin). */
export const api = hc<AppType>("/");

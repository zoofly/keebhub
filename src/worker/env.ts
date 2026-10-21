// Hono environment for the Worker. `Env` (the bindings) is generated from
// wrangler.jsonc by `npm run cf-typegen`; never hand-write it.
export type AppEnv = {
  Bindings: Env;
  // Per-request values set by middleware (e.g. the signed-in user, Phase B2).
  Variables: Record<string, never>;
};

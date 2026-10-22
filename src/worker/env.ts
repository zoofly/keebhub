import type { User } from "../shared/schemas";
import type { Session } from "./auth/session";

// Hono environment for the Worker. `Env` (the bindings) is generated from
// wrangler.jsonc by `npm run cf-typegen`; never hand-write it.
export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** The signed-in user, or null (set by middleware/session.ts). */
    user: User | null;
    session: Session | null;
  };
};

/** AppEnv after requireUser: the user and session are known. */
export type AuthedEnv = {
  Bindings: Env;
  Variables: { user: User; session: Session };
};

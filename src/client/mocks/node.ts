// MSW for component tests (Vitest + jsdom).
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

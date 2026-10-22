import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { TurnstileApi } from "../components/Turnstile";
import { loginPathFor } from "../lib/safeNext";
import { endSession, setUnauthorizedHandler } from "../lib/session";
import { db } from "../mocks/db";
import { createQueryClient } from "../queryClient";
import { createRoutes } from "../router";

/** A Turnstile stand-in that hands out a token straight away. */
export function installFakeTurnstile(token = "test-turnstile-token") {
  const fake: TurnstileApi = {
    render: (_el, options) => {
      queueMicrotask(() => options.callback(token));
      return "widget-1";
    },
    reset: () => {},
    remove: () => {},
  };
  window.turnstile = fake;
  return fake;
}

/** Signs a seeded mock user in (kash is id 1, bench is id 2). */
export function signInAs(userId: number) {
  db.state.sessionUserId = userId;
}

/**
 * Renders the whole app (real routes, loaders, query client and 401
 * handling) at `path`, against the MSW handlers.
 */
export function renderApp(path = "/") {
  const onUnauthorized = () => {
    const { pathname, search } = router.state.location;
    void endSession(queryClient, () =>
      router.navigate(loginPathFor(`${pathname}${search}`), { replace: true }),
    );
  };
  const queryClient = createQueryClient(() => onUnauthorized());
  setUnauthorizedHandler(onUnauthorized);
  const router = createMemoryRouter(createRoutes(queryClient), { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, user, router, queryClient };
}

/** Renders a component with just a fresh QueryClient around it. */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = createQueryClient();
  const user = userEvent.setup();
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...view, user, queryClient };
}

import type { QueryClient } from "@tanstack/react-query";
import {
  createBrowserRouter,
  data,
  type LoaderFunctionArgs,
  type RouteObject,
  redirect,
} from "react-router";
import { IdParam } from "../shared/schemas";
import { AppLoading, Layout } from "./components/Layout";
import { meQuery } from "./lib/queries";
import { loginPathFor, safeNextPath } from "./lib/safeNext";
import { RouteErrorPage } from "./routes/error";
import { NotFoundPage } from "./routes/not-found";

// Pages are code-split: each route's module (and the form and validation
// code it pulls in) loads on first visit. The layout, error and 404 pages
// stay in the entry chunk.

const pathOf = (request: Request) => {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
};

/** Pages that need a session: guests go to /login?next=<this page>. */
const requireUser =
  (queryClient: QueryClient) =>
  async ({ request }: LoaderFunctionArgs) => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) {
      throw redirect(loginPathFor(pathOf(request)));
    }
    return null;
  };

/** Login and register: signed-in people go where they were headed. */
const guestOnly =
  (queryClient: QueryClient) =>
  async ({ request }: LoaderFunctionArgs) => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me) {
      const next = safeNextPath(new URL(request.url).searchParams.get("next"));
      throw redirect(next ?? "/market");
    }
    return null;
  };

/** /market/:id with a malformed id ("abc", "0", "1e3") is a 404, not a request. */
const validListingId = ({ params }: LoaderFunctionArgs) => {
  if (!IdParam.safeParse(params.id).success) {
    throw data(null, { status: 404 });
  }
  return null;
};

export function createRoutes(queryClient: QueryClient): RouteObject[] {
  const protect = requireUser(queryClient);
  return [
    {
      Component: Layout,
      HydrateFallback: AppLoading,
      ErrorBoundary: RouteErrorPage,
      // Knowing who's signed in before the first render avoids a flash of
      // guest navigation; failures fall through to "guest".
      loader: async () => {
        await queryClient.ensureQueryData(meQuery).catch(() => null);
        return null;
      },
      children: [
        {
          // Pathless so page errors render inside the layout (nav stays usable).
          ErrorBoundary: RouteErrorPage,
          children: [
            {
              index: true,
              lazy: () => import("./routes/home").then((m) => ({ Component: m.HomePage })),
            },
            {
              path: "about",
              lazy: () => import("./routes/about").then((m) => ({ Component: m.AboutPage })),
            },
            {
              path: "login",
              lazy: () => import("./routes/auth").then((m) => ({ Component: m.LoginPage })),
              loader: guestOnly(queryClient),
            },
            {
              path: "register",
              lazy: () => import("./routes/auth").then((m) => ({ Component: m.RegisterPage })),
              loader: guestOnly(queryClient),
            },
            {
              path: "market",
              lazy: () => import("./routes/market").then((m) => ({ Component: m.MarketPage })),
            },
            {
              path: "market/:id",
              lazy: () => import("./routes/listing").then((m) => ({ Component: m.ListingPage })),
              loader: validListingId,
            },
            {
              path: "market/:id/edit",
              lazy: () => import("./routes/edit").then((m) => ({ Component: m.EditPage })),
              loader: async (args) => {
                validListingId(args);
                return protect(args);
              },
            },
            {
              path: "create",
              lazy: () => import("./routes/create").then((m) => ({ Component: m.CreatePage })),
              loader: protect,
            },
            {
              path: "mylistings",
              lazy: () =>
                import("./routes/mylistings").then((m) => ({ Component: m.MyListingsPage })),
              loader: protect,
            },
            {
              path: "saved",
              lazy: () => import("./routes/saved").then((m) => ({ Component: m.SavedPage })),
              loader: protect,
            },
            {
              path: "profile",
              lazy: () => import("./routes/profile").then((m) => ({ Component: m.ProfilePage })),
              loader: protect,
            },
            // Old (hash-router) paths.
            { path: "home", loader: () => redirect("/") },
            { path: "registration", loader: () => redirect("/register") },
            { path: "user", loader: () => redirect("/profile") },
            { path: "*", Component: NotFoundPage },
          ],
        },
      ],
    },
  ];
}

export function createAppRouter(queryClient: QueryClient) {
  return createBrowserRouter(createRoutes(queryClient));
}

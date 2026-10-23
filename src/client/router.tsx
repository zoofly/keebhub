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
import { AboutPage } from "./routes/about";
import { LoginPage, RegisterPage } from "./routes/auth";
import { CreatePage } from "./routes/create";
import { EditPage } from "./routes/edit";
import { RouteErrorPage } from "./routes/error";
import { HomePage } from "./routes/home";
import { ListingPage } from "./routes/listing";
import { MarketPage } from "./routes/market";
import { MyListingsPage } from "./routes/mylistings";
import { NotFoundPage } from "./routes/not-found";
import { ProfilePage } from "./routes/profile";
import { SavedPage } from "./routes/saved";

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
            { index: true, Component: HomePage },
            { path: "about", Component: AboutPage },
            { path: "login", Component: LoginPage, loader: guestOnly(queryClient) },
            { path: "register", Component: RegisterPage, loader: guestOnly(queryClient) },
            { path: "market", Component: MarketPage },
            { path: "market/:id", Component: ListingPage, loader: validListingId },
            {
              path: "market/:id/edit",
              Component: EditPage,
              loader: async (args) => {
                validListingId(args);
                return protect(args);
              },
            },
            { path: "create", Component: CreatePage, loader: protect },
            { path: "mylistings", Component: MyListingsPage, loader: protect },
            { path: "saved", Component: SavedPage, loader: protect },
            { path: "profile", Component: ProfilePage, loader: protect },
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

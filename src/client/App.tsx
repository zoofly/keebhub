import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import type { createAppRouter } from "./router";

type AppRouter = ReturnType<typeof createAppRouter>;

export function App({ queryClient, router }: { queryClient: QueryClient; router: AppRouter }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

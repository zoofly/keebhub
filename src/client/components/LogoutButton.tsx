import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout } from "../api";
import { endSession } from "../lib/session";
import { toast } from "../lib/toast";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    meta: { skipAuthRedirect: true },
    // Forget the session locally even if the request failed (e.g. offline).
    onSettled: async (_data, error) => {
      await endSession(queryClient, () => navigate("/", { replace: true }));
      if (error) {
        toast.error(
          "Logged out on this device",
          "We couldn't reach the server to end the session.",
        );
      } else {
        toast.success("You've logged out.");
      }
    },
  });
}

export function LogoutButton({ className }: { className?: string }) {
  const { mutate, isPending } = useLogout();
  return (
    <button type="button" className={className} onClick={() => mutate()} disabled={isPending}>
      {isPending ? "Logging out…" : "Log out"}
    </button>
  );
}

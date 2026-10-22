import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { savedIdsQuery, useMe, useToggleSaved } from "../lib/queries";
import { loginPathFor } from "../lib/safeNext";
import { toast } from "../lib/toast";
import { HeartIcon } from "./Icons";
import { buttonVariants } from "./ui/button";

/**
 * Save / unsave toggle (aria-pressed). Guests get a link to log in and come
 * back. Repeated clicks are safe: the API's PUT and DELETE are idempotent.
 */
export function SaveButton({ postingId, title }: { postingId: number; title: string }) {
  const me = useMe();
  const location = useLocation();
  const saved = useQuery({ ...savedIdsQuery, enabled: Boolean(me) });
  const toggle = useToggleSaved();

  if (!me) {
    return (
      <Link
        to={loginPathFor(`${location.pathname}${location.search}`)}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label={`Log in to save ${title}`}
      >
        <HeartIcon filled={false} />
        Log in to save
      </Link>
    );
  }

  const isSaved = saved.data?.has(postingId) ?? false;
  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={`${isSaved ? "Saved" : "Save"} ${title}`}
      disabled={saved.isPending}
      onClick={() =>
        toggle.toggle(postingId, {
          onError: (saving) =>
            toast.error(
              saving ? "Couldn't save that listing" : "Couldn't remove it from Saved",
              "Please try again.",
            ),
        })
      }
      className={cn(
        buttonVariants({ variant: isSaved ? "outline" : "ghost", size: "sm" }),
        isSaved && "border-primary bg-primary-soft",
      )}
    >
      <HeartIcon filled={isSaved} />
      {isSaved ? "Saved" : "Save"}
    </button>
  );
}

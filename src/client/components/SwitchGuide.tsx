import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import type { Switch, SwitchType } from "../../shared/schemas";
import { cn } from "../lib/cn";
import { loadErrorMessage } from "../lib/errors";
import { switchesQuery } from "../lib/queries";
import { ListingImage } from "./ListingImage";
import { StatusMessage } from "./StatusMessage";
import { Skeleton } from "./ui/skeleton";

const TYPE_LABEL: Record<SwitchType, string> = {
  linear: "Linear",
  tactile: "Tactile",
  clicky: "Clicky",
};

const TYPE_HINT: Record<SwitchType, string> = {
  linear: "Smooth all the way down",
  tactile: "A bump you can feel",
  clicky: "A bump and a click",
};

type Filter = SwitchType | "all";
const FILTERS: Filter[] = ["all", "linear", "tactile", "clicky"];

function SwitchCard({ item }: { item: Switch }) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      {item.imageUrl && <ListingImage src={item.imageUrl} alt={`${item.name} switch`} />}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 id={titleId} className="text-2xl">
          {item.name}
        </h3>
        <dl className="flex flex-wrap gap-2 text-sm">
          <div className="rounded-full bg-primary-soft px-3 py-1">
            <dt className="inline font-semibold after:content-[':_']">Type</dt>
            <dd className="inline">{TYPE_LABEL[item.type]}</dd>
          </div>
          <div className="rounded-full bg-primary-soft px-3 py-1">
            <dt className="inline font-semibold after:content-[':_']">Maker</dt>
            <dd className="inline">{item.manufacturer}</dd>
          </div>
        </dl>
        <p className="text-muted">{item.description || TYPE_HINT[item.type]}</p>
      </div>
    </article>
  );
}

/** The switch catalog with a type filter, ported from the legacy SwitchList. */
export function SwitchGuide() {
  const result = useQuery(switchesQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const items = (result.data ?? []).filter((item) => filter === "all" || item.type === filter);

  let content: ReactNode;
  if (result.isPending) {
    content = (
      <div>
        <p role="status" className="sr-only">
          Loading switches…
        </p>
        <div
          aria-hidden="true"
          className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-5"
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-36" />
          ))}
        </div>
      </div>
    );
  } else if (result.isError) {
    content = (
      <StatusMessage
        variant="error"
        title="Switches didn't load"
        onRetry={() => void result.refetch()}
      >
        {loadErrorMessage(result.error, "the switch guide")}
      </StatusMessage>
    );
  } else if ((result.data ?? []).length === 0) {
    content = (
      <StatusMessage title="No switches yet">
        Check back soon for a guide to popular switches.
      </StatusMessage>
    );
  } else {
    content = (
      <>
        <fieldset className="mb-5">
          <legend className="sr-only">Filter switches by type</legend>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "min-h-11 rounded-full border px-4 font-semibold",
                  filter === value
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-primary hover:bg-primary-soft",
                )}
              >
                {value === "all" ? "All" : TYPE_LABEL[value]}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="sr-only" aria-live="polite">
          Showing {items.length} switches.
        </p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-5">
          {items.map((item) => (
            <li key={item.id} className="flex">
              <SwitchCard item={item} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-labelledby="switches-heading" className="mt-12">
      <h2 id="switches-heading" className="text-3xl">
        Switch guide
      </h2>
      <p className="mt-1 mb-5 text-lg text-muted">
        A quick reference for popular mechanical keyboard switches.
      </p>
      {content}
    </section>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { HABIT_FILTERS, type HabitStatusFilter } from "@/config/habits";

/**
 * Filter and search for the habit list.
 *
 * State lives in the URL, exactly as the task, project and goal filters do, so
 * a filtered view is shareable, survives a refresh and works with the back
 * button — and the filtering happens in PostgreSQL, not in the browser.
 */
export function HabitFilterBar({
  status,
  search,
  counts,
}: {
  status: HabitStatusFilter;
  search: string | null;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const apply = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `/app/habits?${query}` : "/app/habits"));
  };

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if ((search ?? "") === searchValue) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: searchValue || null }), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const hasFilters = status !== "ACTIVE" || Boolean(search);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending || undefined}>
      <div
        role="radiogroup"
        aria-label="Filter habits by status"
        className="inline-flex flex-wrap rounded-[var(--radius-control)] border border-line bg-base p-0.5"
      >
        {HABIT_FILTERS.map((option) => {
          const active = status === option.value;
          const count = counts[option.value];

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => apply({ status: option.value === "ACTIVE" ? null : option.value })}
              className={
                "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors " +
                (active ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink")
              }
            >
              {option.label}
              {count !== undefined && count > 0 && (
                <span className="tnum text-[0.6875rem] text-ink-faint">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <label className="relative">
        <span className="sr-only">Search habits</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search habits…"
          className="h-8 w-44 rounded-[var(--radius-control)] border border-line bg-base pl-8 pr-2.5 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 sm:w-56"
        />
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchValue("");
            startTransition(() => router.replace("/app/habits"));
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.75rem] text-ink-faint transition-colors hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { PROJECT_FILTERS, PROJECT_SORTS, type ProjectSort, type ProjectStatusFilter } from "@/config/projects";
import { cn } from "@/lib/cn";

/**
 * Filter, search and sort for the project list.
 *
 * State lives in the URL, exactly as the task filters do, so a filtered view
 * is shareable, survives a refresh and works with the back button — and the
 * filtering itself happens in PostgreSQL rather than in the browser.
 */
const SELECT_CLASS = cn(
  "h-8 cursor-pointer appearance-none rounded-[var(--radius-control)] border border-line bg-base",
  "pl-2.5 pr-7 text-[0.8125rem] text-ink transition-colors hover:border-line-strong",
  "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25",
  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2.5%204.5%206%208l3.5-3.5%22%20fill%3D%22none%22%20stroke%3D%22%238b93a1%22%20stroke-width%3D%221.4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')]",
  "bg-[length:12px_12px] bg-[position:right_0.5rem_center] bg-no-repeat",
);

export function ProjectFilterBar({
  status,
  sort,
  search,
  counts,
}: {
  status: ProjectStatusFilter;
  sort: ProjectSort;
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
    startTransition(() => router.replace(query ? `/app/projects?${query}` : "/app/projects"));
  };

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if ((search ?? "") === searchValue) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: searchValue || null }), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const hasFilters = status !== "ACTIVE" || Boolean(search) || sort !== "urgency";

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending || undefined}>
      <div
        role="radiogroup"
        aria-label="Filter projects by status"
        className="inline-flex flex-wrap rounded-[var(--radius-control)] border border-line bg-base p-0.5"
      >
        {PROJECT_FILTERS.map((option) => {
          const active = status === option.value;
          const count = counts[option.value];

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => apply({ status: option.value === "ACTIVE" ? null : option.value })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                active ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
              )}
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
        <span className="sr-only">Search projects</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search projects…"
          className="h-8 w-44 rounded-[var(--radius-control)] border border-line bg-base pl-8 pr-2.5 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 sm:w-56"
        />
      </label>

      <label className="sr-only" htmlFor="project-sort">
        Sort projects
      </label>
      <select
        id="project-sort"
        value={sort}
        onChange={(event) => apply({ sort: event.target.value === "urgency" ? null : event.target.value })}
        className={SELECT_CLASS}
      >
        {PROJECT_SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchValue("");
            startTransition(() => router.replace("/app/projects"));
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

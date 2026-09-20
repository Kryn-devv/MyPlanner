"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import { cn } from "@/lib/cn";
import type { CategoryView, TaskStatusFilter } from "@/lib/tasks/queries";

/**
 * Filter controls for the task list.
 *
 * State lives in the URL rather than in component state, so a filtered view is
 * shareable, survives a refresh and works with the back button. Changing a
 * filter re-runs the server component's query — the filtering is done in
 * PostgreSQL, not by shipping every task to the browser.
 */
export interface TaskFiltersProps {
  categories: readonly CategoryView[];
  status: TaskStatusFilter;
  categoryId: string | null;
  priority: string | null;
  search: string | null;
}

/**
 * Native select chrome renders a dark arrow that disappears against this
 * theme, so the arrow is drawn as an inline SVG background instead.
 */
const FILTER_SELECT_CLASS = cn(
  "h-8 cursor-pointer appearance-none rounded-[var(--radius-control)] border border-line bg-base",
  "pl-2.5 pr-7 text-[0.8125rem] text-ink transition-colors hover:border-line-strong",
  "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25",
  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2.5%204.5%206%208l3.5-3.5%22%20fill%3D%22none%22%20stroke%3D%22%238b93a1%22%20stroke-width%3D%221.4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')]",
  "bg-[length:12px_12px] bg-[position:right_0.5rem_center] bg-no-repeat",
);

const STATUS_OPTIONS: readonly { value: TaskStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Done" },
  { value: "all", label: "All" },
];

export function TaskFilters({ categories, status, categoryId, priority, search }: TaskFiltersProps) {
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
    startTransition(() => router.replace(query ? `/app/tasks?${query}` : "/app/tasks"));
  };

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if ((search ?? "") === searchValue) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: searchValue || null }), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const hasFilters = status !== "open" || categoryId !== null || priority !== null || Boolean(search);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending || undefined}>
      {/* Status: a real radio group, so arrow keys move between options. */}
      <div
        role="radiogroup"
        aria-label="Filter by status"
        className="inline-flex rounded-[var(--radius-control)] border border-line bg-base p-0.5"
      >
        {STATUS_OPTIONS.map((option) => {
          const active = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => apply({ status: option.value === "open" ? null : option.value })}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                active ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="relative">
        <span className="sr-only">Search tasks</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search…"
          className="h-8 w-40 rounded-[var(--radius-control)] border border-line bg-base pl-8 pr-2.5 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 sm:w-52"
        />
      </label>

      <label className="sr-only" htmlFor="filter-category">
        Filter by category
      </label>
      <select
        id="filter-category"
        value={categoryId ?? ""}
        onChange={(event) => apply({ category: event.target.value || null })}
        className={FILTER_SELECT_CLASS}
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-priority">
        Filter by priority
      </label>
      <select
        id="filter-priority"
        value={priority ?? ""}
        onChange={(event) => apply({ priority: event.target.value || null })}
        className={FILTER_SELECT_CLASS}
      >
        <option value="">Any priority</option>
        {PRIORITIES.map((value) => (
          <option key={value} value={value}>
            {PRIORITY_CONFIG[value].label}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchValue("");
            startTransition(() => router.replace("/app/tasks"));
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

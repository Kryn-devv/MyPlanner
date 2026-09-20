"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useTransition } from "react";
import {
  CALENDAR_COMPLETION_FILTERS,
  CALENDAR_KINDS,
  CALENDAR_KIND_CONFIG,
  DEFAULT_COMPLETION_FILTER,
  type CalendarCompletionFilter,
  type CalendarItemKind,
} from "@/config/calendar";
import { cn } from "@/lib/cn";

/**
 * Which sources the calendar draws, and whether finished work is drawn at all.
 *
 * The selection lives in the URL as a comma-separated `kinds` list and is
 * applied in the query layer — an unticked kind is never read from the
 * database, rather than read and then hidden.
 *
 * Deliberately no per-kind counts: an unticked kind is not queried, so its
 * count would always read zero, which says "nothing this month" rather than
 * "not shown". The header counts what is actually on screen instead.
 */
export function CalendarFilterBar({
  kinds,
  show,
}: {
  kinds: readonly CalendarItemKind[];
  show: CalendarCompletionFilter;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const apply = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `/app/calendar?${query}` : "/app/calendar"));
  };

  // An empty selection is the URL's way of saying "no filter", which is the
  // same thing as every kind being on.
  const isOn = (kind: CalendarItemKind) => kinds.length === 0 || kinds.includes(kind);

  const toggle = (kind: CalendarItemKind) => {
    const current = kinds.length === 0 ? [...CALENDAR_KINDS] : [...kinds];
    const next = current.includes(kind)
      ? current.filter((entry) => entry !== kind)
      : [...current, kind];

    // Turning the last one off would leave an empty calendar with no way to
    // tell it apart from a quiet week, so it clears back to everything.
    if (next.length === 0 || next.length === CALENDAR_KINDS.length) {
      apply({ kinds: null });
      return;
    }
    apply({ kinds: CALENDAR_KINDS.filter((entry) => next.includes(entry)).join(",") });
  };

  const filtered = kinds.length > 0 || show !== DEFAULT_COMPLETION_FILTER;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending || undefined}>
      <div
        role="group"
        aria-label="Show on the calendar"
        className="inline-flex flex-wrap rounded-[var(--radius-control)] border border-line bg-base p-0.5"
      >
        {CALENDAR_KINDS.map((kind) => {
          const config = CALENDAR_KIND_CONFIG[kind];
          const active = isOn(kind);

          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(kind)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                active ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? config.dotClass : "bg-line-strong",
                )}
              />
              {config.plural}
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor="calendar-show">
        Show completed work
      </label>
      <select
        id="calendar-show"
        value={show}
        onChange={(event) =>
          apply({
            show: event.target.value === DEFAULT_COMPLETION_FILTER ? null : event.target.value,
          })
        }
        className="h-8 cursor-pointer rounded-[var(--radius-control)] border border-line bg-base px-2.5 text-[0.8125rem] text-ink transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
      >
        {CALENDAR_COMPLETION_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {filtered && (
        <button
          type="button"
          onClick={() => apply({ kinds: null, show: null })}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.75rem] text-ink-faint transition-colors hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}

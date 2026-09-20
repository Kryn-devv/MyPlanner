"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import { CALENDAR_VIEWS, type CalendarView } from "@/config/calendar";
import type { LocalDate } from "@/lib/datetime";
import { formatRangeLabel, normalizeAnchor, shiftAnchor } from "@/lib/calendar/range";
import { cn } from "@/lib/cn";

/**
 * Range navigation and the view switcher.
 *
 * All of it is URL state, exactly as the task, project and goal filters are:
 * a calendar someone is looking at is a link they can send, a page that
 * survives a refresh and a back button that goes back a month. The anchor is
 * normalised before it is written, so the URL can never describe a range
 * different from the one on screen.
 */
export function CalendarToolbar({
  view,
  anchor,
  today,
}: {
  view: CalendarView;
  anchor: LocalDate;
  today: LocalDate;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const go = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `/app/calendar?${query}` : "/app/calendar"));
  };

  const step = (delta: number) => {
    go({ date: shiftAnchor(view, anchor, delta) });
  };

  // Switching view keeps the day being looked at, re-anchored to what the new
  // view is made of — jumping from a week in March to today would be a
  // surprise, not a convenience.
  const switchTo = (next: CalendarView) => {
    const nextAnchor = normalizeAnchor(next, anchor);
    go({
      view: next === "month" ? null : next,
      date: nextAnchor === normalizeAnchor(next, today) ? null : nextAnchor,
    });
  };

  const showingToday = anchor === normalizeAnchor(view, today);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      aria-busy={isPending || undefined}
    >
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-base">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={`Previous ${view}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-l-[var(--radius-control)] text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={`Next ${view}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-r-[var(--radius-control)] border-l border-line text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => go({ date: null })}
          disabled={showingToday}
          className={cn(
            "h-8 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[0.8125rem] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            showingToday
              ? "cursor-default text-ink-faint"
              : "text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          Today
        </button>

        {/* aria-live so that stepping through months announces where you
            landed — the label is the only thing that changes. */}
        <p aria-live="polite" className="text-[0.9375rem] font-medium text-ink">
          {formatRangeLabel(view, anchor)}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Calendar view"
        className="inline-flex rounded-[var(--radius-control)] border border-line bg-base p-0.5"
      >
        {CALENDAR_VIEWS.map((option) => {
          const active = view === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.hint}
              onClick={() => switchTo(option.value)}
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
    </div>
  );
}

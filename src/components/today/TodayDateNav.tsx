"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import { MAX_DAY_OFFSET, TODAY_DATE_PARAM } from "@/config/today";
import { addDays, daysBetween, type LocalDate } from "@/lib/datetime";
import { cn } from "@/lib/cn";

/**
 * Previous day · Today · Next day, plus the way through to the calendar.
 *
 * The day lives in the URL, so a day is a link that can be sent and survives a
 * refresh. Stepping between days pushes history rather than replacing it —
 * moving to another day is a navigation, and the back button should return to
 * the day you came from rather than leaving the page. Today itself carries no
 * parameter at all: `/app/today` always means *now*, whenever it is opened,
 * which is what makes it a safe thing to bookmark.
 *
 * Date arithmetic goes through the app's pure `addDays`, never through
 * `Date` — a day is a calendar day, and doing this with timestamps is what
 * makes "yesterday" land on the wrong date for half the world.
 */
export function TodayDateNav({
  selectedDate,
  today,
}: {
  selectedDate: LocalDate;
  today: LocalDate;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const go = (date: LocalDate) => {
    const params = new URLSearchParams(searchParams.toString());
    // Today is the default, so it is expressed by the absence of a parameter
    // rather than by pinning the date it happens to be right now.
    if (date === today) params.delete(TODAY_DATE_PARAM);
    else params.set(TODAY_DATE_PARAM, date);

    const query = params.toString();
    startTransition(() => router.push(query ? `/app/today?${query}` : "/app/today"));
  };

  const offset = daysBetween(selectedDate, today);
  const isToday = selectedDate === today;
  const canGoBack = offset > -MAX_DAY_OFFSET;
  const canGoForward = offset < MAX_DAY_OFFSET;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending || undefined}>
      <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-base">
        <button
          type="button"
          onClick={() => go(addDays(selectedDate, -1))}
          disabled={!canGoBack}
          aria-label="Previous day"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-l-[var(--radius-control)] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            canGoBack
              ? "text-ink-muted hover:bg-white/[0.05] hover:text-ink"
              : "cursor-default text-ink-faint/50",
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go(addDays(selectedDate, 1))}
          disabled={!canGoForward}
          aria-label="Next day"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-r-[var(--radius-control)] border-l border-line transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            canGoForward
              ? "text-ink-muted hover:bg-white/[0.05] hover:text-ink"
              : "cursor-default text-ink-faint/50",
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => go(today)}
        disabled={isToday}
        className={cn(
          "h-8 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[0.8125rem] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          isToday
            ? "cursor-default text-ink-faint"
            : "text-ink-muted hover:border-line-strong hover:text-ink",
        )}
      >
        Today
      </button>

      {/* The calendar answers "when?"; this page answers "what now?". The link
          hands the same day over rather than rendering a second calendar. */}
      <Link
        href={{ pathname: "/app/calendar", query: { view: "day", date: selectedDate } }}
        className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-line bg-base px-3 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Calendar
      </Link>
    </div>
  );
}

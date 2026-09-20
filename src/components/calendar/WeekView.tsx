import { WEEKDAYS_SHORT, partsOf, type LocalDate } from "@/lib/datetime";
import { toCalendarDays } from "@/lib/calendar/items";
import { eachDay } from "@/lib/calendar/range";
import type { CalendarItem, CalendarRange } from "@/lib/calendar/types";
import { cn } from "@/lib/cn";
import { CalendarItemChip } from "./CalendarItemChip";
import { CalendarItemRow } from "./CalendarItemRow";
import { DayLink } from "./DayLink";

/**
 * Seven days side by side.
 *
 * Two layouts of the same data rather than one that compromises: seven
 * columns where there is width for them, and a stacked list below `md`, where
 * a seven-column grid would be seven unreadable slivers. Only one is in the
 * accessibility tree at a time, so nothing is announced twice.
 */
export function WeekView({
  range,
  items,
  today,
  query,
}: {
  range: CalendarRange;
  items: readonly CalendarItem[];
  today: LocalDate;
  query: Record<string, string>;
}) {
  const days = toCalendarDays(eachDay(range), items);

  return (
    <>
      <div
        // Only one of the two layouts is ever displayed, and `display: none`
        // already removes the other from the accessibility tree — marking
        // either `aria-hidden` would leave one breakpoint with no content at
        // all for assistive technology.
        className="hidden overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel md:grid md:grid-cols-7"
      >
        {days.map((day) => {
          const { day: dayOfMonth, weekday } = partsOf(day.date);
          const isToday = day.date === today;

          return (
            <div key={day.date} className="min-h-[12rem] border-r border-line p-1.5 last:border-r-0">
              <div className="mb-2 flex items-center gap-1.5 px-1">
                <span className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                  {WEEKDAYS_SHORT[weekday]}
                </span>
                <span
                  className={cn(
                    "tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.75rem]",
                    isToday ? "bg-accent font-semibold text-white" : "text-ink-muted",
                  )}
                >
                  {dayOfMonth}
                </span>
              </div>

              {day.items.length === 0 ? (
                <p className="px-1 text-[0.6875rem] text-ink-faint">—</p>
              ) : (
                <ul className="space-y-0.5">
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <CalendarItemChip item={item} today={today} compact />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-4 md:hidden">
        {days.map((day) => (
          <section key={day.date} aria-labelledby={`week-${day.date}`}>
            <h2 id={`week-${day.date}`} className="mb-2 flex items-baseline gap-2">
              <DayLink
                date={day.date}
                query={query}
                className={cn(
                  "text-[0.8125rem] font-medium transition-colors hover:text-ink",
                  day.date === today ? "text-accent-strong" : "text-ink",
                )}
              >
                {WEEKDAYS_SHORT[partsOf(day.date).weekday]} {partsOf(day.date).day}
              </DayLink>
              {day.date === today && (
                <span className="text-[0.6875rem] uppercase tracking-wide text-accent-strong">
                  Today
                </span>
              )}
            </h2>

            {day.items.length === 0 ? (
              <p className="text-[0.75rem] text-ink-faint">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-1.5">
                {day.items.map((item) => (
                  <li key={item.id}>
                    <CalendarItemRow item={item} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

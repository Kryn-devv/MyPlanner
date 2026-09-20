import { MONTH_CELL_VISIBLE_ITEMS } from "@/config/calendar";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, partsOf, type LocalDate } from "@/lib/datetime";
import { groupItemsByDate } from "@/lib/calendar/items";
import { getWeekdayOrder } from "@/lib/calendar/range";
import type { CalendarItem, MonthGrid } from "@/lib/calendar/types";
import { cn } from "@/lib/cn";
import { CalendarItemChip } from "./CalendarItemChip";
import { DayLink } from "./DayLink";

/**
 * The month grid.
 *
 * Always six rows, so stepping between months does not resize the page. Cells
 * outside the month are dimmed rather than blanked — the items on them are
 * real, and hiding them would make the first and last weeks of a month lie.
 *
 * A cell shows a bounded number of items and then a link to that day, rather
 * than growing without limit and pushing the rest of the grid off screen.
 */
export function MonthView({
  grid,
  items,
  today,
  query,
}: {
  grid: MonthGrid;
  items: readonly CalendarItem[];
  today: LocalDate;
  query: Record<string, string>;
}) {
  const byDate = groupItemsByDate(items);
  const headings = getWeekdayOrder();

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel">
      <div className="grid grid-cols-7 border-b border-line">
        {headings.map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-2 text-center text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint"
          >
            {/* Abbreviated on small screens, where seven full names will not
                fit; the accessible name stays the full weekday either way. */}
            <abbr title={WEEKDAYS_LONG[weekday]} className="no-underline">
              <span className="sm:hidden">{WEEKDAYS_SHORT[weekday]?.charAt(0)}</span>
              <span className="hidden sm:inline">{WEEKDAYS_SHORT[weekday]}</span>
            </abbr>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.weeks.flat().map((cell) => {
          const dayItems = byDate.get(cell.date) ?? [];
          const visible = dayItems.slice(0, MONTH_CELL_VISIBLE_ITEMS);
          const hidden = dayItems.length - visible.length;
          const isToday = cell.date === today;
          const { day } = partsOf(cell.date);

          return (
            <div
              key={cell.date}
              className={cn(
                "min-h-[5.5rem] border-b border-r border-line p-1 last:border-r-0 sm:min-h-[7rem]",
                !cell.inMonth && "bg-white/[0.015]",
              )}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <DayLink
                  date={cell.date}
                  query={query}
                  className={cn(
                    "tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.75rem] transition-colors",
                    isToday
                      ? "bg-accent font-semibold text-white"
                      : cell.inMonth
                        ? "text-ink-muted hover:text-ink"
                        : "text-ink-faint hover:text-ink-muted",
                  )}
                >
                  {day}
                </DayLink>
                {dayItems.length > 0 && (
                  <span className="tnum text-[0.625rem] text-ink-faint" aria-hidden="true">
                    {dayItems.length}
                  </span>
                )}
              </div>

              {visible.length > 0 && (
                <ul className="space-y-0.5">
                  {visible.map((item) => (
                    <li key={item.id}>
                      <CalendarItemChip item={item} today={today} compact />
                    </li>
                  ))}
                </ul>
              )}

              {hidden > 0 && (
                <DayLink
                  date={cell.date}
                  query={query}
                  className="mt-0.5 block px-1.5 text-[0.6875rem] text-ink-faint transition-colors hover:text-ink"
                >
                  +{hidden} more
                </DayLink>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

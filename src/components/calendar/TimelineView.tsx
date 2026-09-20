import { CalendarRange as CalendarRangeIcon } from "lucide-react";
import { formatRelativeDay, formatLongDate, type LocalDate } from "@/lib/datetime";
import { toOccupiedDays } from "@/lib/calendar/items";
import { formatSpan } from "@/lib/calendar/range";
import type { CalendarItem, CalendarRange } from "@/lib/calendar/types";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { CalendarItemRow } from "./CalendarItemRow";

/**
 * Everything ahead, in order.
 *
 * Unlike the grids, this drops days with nothing on them — a timeline of empty
 * days is a calendar with extra steps. It is still bounded: the range comes
 * from the view, not from "the rest of time".
 */
export function TimelineView({
  range,
  items,
  today,
}: {
  range: CalendarRange;
  items: readonly CalendarItem[];
  today: LocalDate;
}) {
  const days = toOccupiedDays(items);

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRangeIcon />}
        title="Nothing scheduled in this window"
        description={`No task, milestone, project or goal carries a date between ${formatSpan(range)}.`}
      />
    );
  }

  return (
    <ol className="max-w-3xl space-y-6">
      {days.map((day) => {
        const isToday = day.date === today;
        const isPast = day.date < today;

        return (
          <li key={day.date} className="relative pl-6">
            {/* The rail: decorative, so it is hidden from assistive tech —
                the heading below already says which day this is. */}
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[3px] top-6 w-px bg-line"
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full",
                isToday ? "bg-accent" : isPast ? "bg-line-strong" : "bg-ink-faint",
              )}
            />

            <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span
                className={cn(
                  "text-[0.875rem] font-medium",
                  isToday ? "text-accent-strong" : "text-ink",
                )}
              >
                {formatRelativeDay(day.date, today)}
              </span>
              <span className="text-[0.75rem] text-ink-faint">{formatLongDate(day.date)}</span>
            </h2>

            <ul className="space-y-1.5">
              {day.items.map((item) => (
                <li key={item.id}>
                  <CalendarItemRow item={item} today={today} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

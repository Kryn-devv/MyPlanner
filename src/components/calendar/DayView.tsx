import { CalendarClock } from "lucide-react";
import { formatLongDate, formatRelativeDay, type LocalDate } from "@/lib/datetime";
import { sortCalendarItems } from "@/lib/calendar/items";
import type { CalendarItem } from "@/lib/calendar/types";
import { EmptyState } from "@/components/ui/States";
import { CalendarItemRow } from "./CalendarItemRow";

/**
 * One day in full.
 *
 * Split into what happens at a time and what is simply due that day, because
 * those are different kinds of commitment and mixing them makes the timed ones
 * harder to find. Hours with nothing in them are not drawn: a column of twenty
 * empty rows is noise, not information.
 */
export function DayView({
  date,
  items,
  today,
}: {
  date: LocalDate;
  items: readonly CalendarItem[];
  today: LocalDate;
}) {
  const sorted = sortCalendarItems(items);
  const timed = sorted.filter((item) => item.time !== null);
  const allDay = sorted.filter((item) => item.time === null);

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title={`Nothing on ${formatRelativeDay(date, today).toLowerCase()}`}
        description={`${formatLongDate(date)} is clear. Dates set on tasks, milestones, projects and goals appear here.`}
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {timed.length > 0 && (
        <section aria-labelledby="day-timed">
          <h2 id="day-timed" className="eyebrow mb-2">
            At a time
          </h2>
          <ul className="space-y-1.5">
            {timed.map((item) => (
              <li key={item.id}>
                <CalendarItemRow item={item} today={today} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {allDay.length > 0 && (
        <section aria-labelledby="day-allday">
          <h2 id="day-allday" className="eyebrow mb-2">
            Due that day
          </h2>
          <ul className="space-y-1.5">
            {allDay.map((item) => (
              <li key={item.id}>
                <CalendarItemRow item={item} today={today} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

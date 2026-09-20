import type { Metadata } from "next";
import {
  CALENDAR_KINDS,
  DEFAULT_CALENDAR_VIEW,
  DEFAULT_COMPLETION_FILTER,
  isCalendarKind,
  isCalendarView,
  isCompletionFilter,
  type CalendarCompletionFilter,
  type CalendarItemKind,
  type CalendarView,
} from "@/config/calendar";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday, isLocalDate, type LocalDate } from "@/lib/datetime";
import { summarise } from "@/lib/calendar/items";
import { getCalendarItems } from "@/lib/calendar/queries";
import { getMonthGrid, getViewRange, normalizeAnchor } from "@/lib/calendar/range";
import { PageHeader } from "@/components/layout/PageHeader";
import { CalendarFilterBar } from "@/components/calendar/CalendarFilterBar";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { DayView } from "@/components/calendar/DayView";
import { MonthView } from "@/components/calendar/MonthView";
import { TimelineView } from "@/components/calendar/TimelineView";
import { WeekView } from "@/components/calendar/WeekView";

export const metadata: Metadata = { title: "Calendar" };

/**
 * The calendar.
 *
 * A view over work that already exists. Every item on this page was read from
 * a task, milestone, project or goal's own date column; nothing here is
 * stored, and there is no calendar record to fall out of step with the records
 * it describes. Rescheduling therefore happens where a date lives — on the
 * task or the project — and this page stays read-only.
 *
 * View, range and filters all live in the URL, so a calendar is a link.
 * Every parameter is validated here and falls back to a default rather than
 * reaching the query layer: `date` in particular comes from a URL and is
 * checked as a real calendar day (`2026-02-31` is not one) before it is used
 * to build a range.
 */
function parseView(value: string | undefined): CalendarView {
  return isCalendarView(value) ? value : DEFAULT_CALENDAR_VIEW;
}

function parseShow(value: string | undefined): CalendarCompletionFilter {
  return isCompletionFilter(value) ? value : DEFAULT_COMPLETION_FILTER;
}

function parseDate(value: string | undefined, today: LocalDate): LocalDate {
  return isLocalDate(value) ? value : today;
}

/** `"task,goal"` → the kinds, in config order. Unknown names are dropped. */
function parseKinds(value: string | undefined): CalendarItemKind[] {
  if (!value) return [];
  const requested = new Set(value.split(",").map((entry) => entry.trim()).filter(isCalendarKind));
  const kinds = CALENDAR_KINDS.filter((kind) => requested.has(kind));
  // Every kind selected is the same as none selected: no filter.
  return kinds.length === CALENDAR_KINDS.length ? [] : kinds;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const single = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = getLocalToday(user.timezone);
  const view = parseView(single("view"));
  const anchor = normalizeAnchor(view, parseDate(single("date"), today));
  const kinds = parseKinds(single("kinds"));
  const show = parseShow(single("show"));

  const range = getViewRange(view, anchor);
  const items = await getCalendarItems(user.id, range, { kinds, show });
  const summary = summarise(items);

  // Carried into day links so a jump from the month grid keeps the filters
  // that produced it.
  const query: Record<string, string> = {};
  if (kinds.length > 0) query.kinds = kinds.join(",");
  if (show !== DEFAULT_COMPLETION_FILTER) query.show = show;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Everything with a date"
        title="Calendar"
        description={
          summary.total > 0 ? (
            <span className="tnum">
              {summary.total} {summary.total === 1 ? "item" : "items"} · {summary.open} open
            </span>
          ) : (
            "Dates set on tasks, milestones, projects and goals show up here."
          )
        }
      />

      <CalendarToolbar view={view} anchor={anchor} today={today} />
      <CalendarFilterBar kinds={kinds} show={show} />

      {view === "month" && (
        <MonthView grid={getMonthGrid(anchor)} items={items} today={today} query={query} />
      )}
      {view === "week" && (
        <WeekView range={range} items={items} today={today} query={query} />
      )}
      {view === "day" && <DayView date={anchor} items={items} today={today} />}
      {view === "timeline" && <TimelineView range={range} items={items} today={today} />}
    </div>
  );
}

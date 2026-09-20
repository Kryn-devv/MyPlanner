import {
  MAX_RANGE_DAYS,
  TIMELINE_DAYS,
  WEEK_STARTS_ON,
  type CalendarView,
} from "@/config/calendar";
import {
  MONTHS_LONG,
  MONTHS_SHORT,
  addDays,
  daysBetween,
  partsOf,
  type LocalDate,
} from "@/lib/datetime";
import type { CalendarRange, MonthCell, MonthGrid } from "./types";

/**
 * Calendar arithmetic.
 *
 * Every function here is pure and works on `"YYYY-MM-DD"` strings. Nothing
 * touches `Date.now()`, the server's timezone or `Intl`: the same anchor must
 * produce byte-identical output on the server and in the browser, or the grid
 * hydrates differently from how it rendered. That is the same rule the
 * relative-date labels follow, for the same reason.
 */

const DAYS_IN_WEEK = 7;
/** Six rows always, so the grid does not change height between months. */
const MONTH_GRID_WEEKS = 6;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function makeDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, "0")}-${pad(month + 1)}-${pad(day)}`;
}

/** Days in a month, `month` being 0-based. Handles February correctly. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = partsOf(date);
  return makeDate(year, month, 1);
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = partsOf(date);
  return makeDate(year, month, daysInMonth(year, month));
}

/**
 * Shifts by whole months, clamping the day rather than rolling over.
 *
 * `Date.setUTCMonth` turns 31 January + 1 month into 3 March, which would make
 * "next month" skip February entirely for anyone viewing it on the 31st.
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = partsOf(date);
  const total = year * 12 + month + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return makeDate(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
}

/** The Monday on or before `date` — `WEEK_STARTS_ON` is fixed, not locale-derived. */
export function startOfWeek(date: LocalDate): LocalDate {
  const { weekday } = partsOf(date);
  const offset = (weekday - WEEK_STARTS_ON + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return addDays(date, -offset);
}

export function endOfWeek(date: LocalDate): LocalDate {
  return addDays(startOfWeek(date), DAYS_IN_WEEK - 1);
}

/** The seven days of the week containing `date`, in order. */
export function getWeekDays(date: LocalDate): LocalDate[] {
  const start = startOfWeek(date);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index));
}

/**
 * The weekday column headings, rotated to match `WEEK_STARTS_ON`.
 * Indices into the Sunday-first tables the date layer already exposes.
 */
export function getWeekdayOrder(): number[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => (WEEK_STARTS_ON + index) % DAYS_IN_WEEK);
}

/**
 * The six-by-seven month grid, including the adjacent-month days that fill the
 * first and last rows.
 */
export function getMonthGrid(anchor: LocalDate): MonthGrid {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const { month } = partsOf(first);

  const weeks: MonthCell[][] = [];
  for (let week = 0; week < MONTH_GRID_WEEKS; week += 1) {
    const cells: MonthCell[] = [];
    for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
      const date = addDays(gridStart, week * DAYS_IN_WEEK + day);
      cells.push({ date, inMonth: partsOf(date).month === month });
    }
    weeks.push(cells);
  }

  const lastWeek = weeks[MONTH_GRID_WEEKS - 1];
  const lastCell = lastWeek?.[DAYS_IN_WEEK - 1];

  return {
    anchor: first,
    // The range covers the *grid*, not the month: the leading and trailing
    // cells show real items, so the query has to reach them.
    range: { start: gridStart, end: lastCell?.date ?? endOfMonth(anchor) },
    weeks,
  };
}

/**
 * The inclusive day span a view needs to fetch.
 *
 * Bounded by construction — there is no view that asks for "everything".
 * The timeline looks `TIMELINE_DAYS` ahead from its anchor and no further.
 */
export function getViewRange(view: CalendarView, anchor: LocalDate): CalendarRange {
  switch (view) {
    case "month":
      return getMonthGrid(anchor).range;
    case "week":
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case "day":
      return { start: anchor, end: anchor };
    case "timeline":
      return { start: anchor, end: addDays(anchor, TIMELINE_DAYS - 1) };
  }
}

/** How far one press of "previous"/"next" moves, per view. */
export function shiftAnchor(view: CalendarView, anchor: LocalDate, delta: number): LocalDate {
  switch (view) {
    case "month":
      return addMonths(startOfMonth(anchor), delta);
    case "week":
      return addDays(startOfWeek(anchor), delta * DAYS_IN_WEEK);
    case "day":
      return addDays(anchor, delta);
    case "timeline":
      return addDays(anchor, delta * TIMELINE_DAYS);
  }
}

/**
 * Normalises an anchor so the URL and the rendered range always agree — a
 * month view anchored mid-month is stored as the 1st, a week as its Monday.
 */
export function normalizeAnchor(view: CalendarView, anchor: LocalDate): LocalDate {
  switch (view) {
    case "month":
      return startOfMonth(anchor);
    case "week":
      return startOfWeek(anchor);
    case "day":
    case "timeline":
      return anchor;
  }
}

/** True when `date` falls inside the inclusive range. */
export function isWithinRange(date: LocalDate, range: CalendarRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Inclusive length in days. */
export function rangeLength(range: CalendarRange): number {
  return daysBetween(range.end, range.start) + 1;
}

/**
 * The guard rail the query layer applies before it reaches PostgreSQL.
 *
 * Views only ever produce small ranges, but the anchor comes from the URL, so
 * an unbounded or inverted range has to be impossible rather than unlikely.
 */
export function isQueryableRange(range: CalendarRange): boolean {
  if (range.end < range.start) return false;
  return rangeLength(range) <= MAX_RANGE_DAYS;
}

/**
 * The heading above the grid: "September 2026", "14 – 20 Sep 2026",
 * "Sunday · 20 September". Built from the fixed month tables, never `Intl`.
 */
export function formatRangeLabel(view: CalendarView, anchor: LocalDate): string {
  const { year, month, day } = partsOf(anchor);

  if (view === "month") return `${MONTHS_LONG[month]} ${year}`;
  if (view === "day") return `${day} ${MONTHS_LONG[month]} ${year}`;

  const range = getViewRange(view, anchor);
  return formatSpan(range);
}

/** "14 – 20 Sep 2026", collapsing the parts both ends share. */
export function formatSpan(range: CalendarRange): string {
  const from = partsOf(range.start);
  const to = partsOf(range.end);

  if (from.year !== to.year) {
    return `${from.day} ${MONTHS_SHORT[from.month]} ${from.year} – ${to.day} ${MONTHS_SHORT[to.month]} ${to.year}`;
  }
  if (from.month !== to.month) {
    return `${from.day} ${MONTHS_SHORT[from.month]} – ${to.day} ${MONTHS_SHORT[to.month]} ${to.year}`;
  }
  if (from.day === to.day) {
    return `${from.day} ${MONTHS_SHORT[from.month]} ${from.year}`;
  }
  return `${from.day} – ${to.day} ${MONTHS_SHORT[to.month]} ${to.year}`;
}

/** Every day in the range, in order. Used by the week and timeline views. */
export function eachDay(range: CalendarRange): LocalDate[] {
  const length = Math.max(0, rangeLength(range));
  return Array.from({ length }, (_, index) => addDays(range.start, index));
}

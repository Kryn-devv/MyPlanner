import { CALENDAR_KINDS, type CalendarItemKind } from "@/config/calendar";
import { getPriorityConfig } from "@/config/priorities";
import type { LocalDate } from "@/lib/datetime";
import type { CalendarDay, CalendarItem } from "./types";

/**
 * Ordering, grouping and counting for calendar items.
 *
 * Pure: these take items and give back items. Nothing here reads a clock or a
 * database, so a day's ordering is a property of the data alone and is fully
 * testable without either.
 */

/**
 * Within a single day, bigger commitments read first.
 * A goal's target date is the headline; a task is the detail underneath it.
 */
const KIND_RANK: Record<CalendarItemKind, number> = {
  goal: 0,
  project: 1,
  milestone: 2,
  task: 3,
};

/**
 * Orders one day's items the way someone reads a day:
 *
 *  1. anything with a clock time, earliest first — those are commitments at a
 *     moment, and all-day items are not;
 *  2. outstanding work before finished work;
 *  3. the larger commitment first (goal, project, milestone, task);
 *  4. more urgent first;
 *  5. title, purely so the order is total and therefore stable — two items
 *     that tie on everything else must not swap between renders.
 */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;

  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  }

  if (a.completed !== b.completed) return a.completed ? 1 : -1;

  const rankDelta = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rankDelta !== 0) return rankDelta;

  const weight = (item: CalendarItem): number =>
    item.priority ? getPriorityConfig(item.priority).weight : -1;
  const weightDelta = weight(b) - weight(a);
  if (weightDelta !== 0) return weightDelta;

  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortCalendarItems(items: readonly CalendarItem[]): CalendarItem[] {
  return [...items].sort(compareCalendarItems);
}

/** Items keyed by the day they fall on, each day's list already ordered. */
export function groupItemsByDate(
  items: readonly CalendarItem[],
): Map<LocalDate, CalendarItem[]> {
  const grouped = new Map<LocalDate, CalendarItem[]>();
  for (const item of sortCalendarItems(items)) {
    const bucket = grouped.get(item.date);
    if (bucket) bucket.push(item);
    else grouped.set(item.date, [item]);
  }
  return grouped;
}

/**
 * One entry per day in `dates`, including days with nothing on them.
 *
 * The views need the empty days: a week grid with Wednesday missing is not a
 * week grid.
 */
export function toCalendarDays(
  dates: readonly LocalDate[],
  items: readonly CalendarItem[],
): CalendarDay[] {
  const grouped = groupItemsByDate(items);
  return dates.map((date) => ({ date, items: grouped.get(date) ?? [] }));
}

/** Days that actually carry something, in order. The timeline skips the rest. */
export function toOccupiedDays(items: readonly CalendarItem[]): CalendarDay[] {
  return [...groupItemsByDate(items)].map(([date, dayItems]) => ({ date, items: dayItems }));
}

export function filterByKinds(
  items: readonly CalendarItem[],
  kinds: readonly CalendarItemKind[],
): CalendarItem[] {
  // An empty selection means "no filter applied", not "show nothing" — the
  // filter bar clears back to this state.
  if (kinds.length === 0 || kinds.length === CALENDAR_KINDS.length) return [...items];
  return items.filter((item) => kinds.includes(item.kind));
}

export type KindCounts = Record<CalendarItemKind, number>;

export function countByKind(items: readonly CalendarItem[]): KindCounts {
  const counts: KindCounts = { task: 0, milestone: 0, project: 0, goal: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

export interface CalendarSummary {
  readonly total: number;
  readonly open: number;
  readonly completed: number;
  readonly byKind: KindCounts;
}

export function summarise(items: readonly CalendarItem[]): CalendarSummary {
  const completed = items.reduce((total, item) => total + (item.completed ? 1 : 0), 0);
  return {
    total: items.length,
    open: items.length - completed,
    completed,
    byKind: countByKind(items),
  };
}

/**
 * Overdue is a question about *now*, so `today` is always passed in rather
 * than read from a clock here — and completed work is never overdue however
 * long ago its date was.
 */
export function isItemOverdue(item: CalendarItem, today: LocalDate): boolean {
  if (item.completed) return false;
  // A start date passing is not a failure; only a deadline can be missed.
  if (item.anchor !== "due") return false;
  return item.date < today;
}

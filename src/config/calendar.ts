import { CalendarDays, CheckSquare, Flag, FolderKanban, Target, type LucideIcon } from "lucide-react";

/**
 * Calendar presentation and rules.
 *
 * The calendar is a *view*, not a store. There is no calendar table and no
 * calendar record: every dot on the grid is an existing task, milestone,
 * project or goal, read through its own date column. This file therefore holds
 * only presentation and URL vocabulary — nothing here describes data.
 *
 * It lives in `src/config` rather than beside the queries because client
 * components need these values, and the query layer is `server-only`.
 */

/** Which of the four surfaces is being rendered. */
export type CalendarView = "month" | "week" | "day" | "timeline";

export const CALENDAR_VIEWS: readonly { value: CalendarView; label: string; hint: string }[] = [
  { value: "month", label: "Month", hint: "A whole month at a glance" },
  { value: "week", label: "Week", hint: "Seven days side by side" },
  { value: "day", label: "Day", hint: "One day, hour by hour" },
  { value: "timeline", label: "Timeline", hint: "Everything ahead in order" },
];

export const DEFAULT_CALENDAR_VIEW: CalendarView = "month";

export function isCalendarView(value: unknown): value is CalendarView {
  return CALENDAR_VIEWS.some((view) => view.value === value);
}

/**
 * What kind of record a calendar item came from.
 *
 * This is the *source* of the date, not a category of event. Nothing can
 * appear on the calendar that is not one of these four.
 */
export type CalendarItemKind = "task" | "milestone" | "project" | "goal";

/**
 * Which date column on that record put the item on this day.
 *
 * A project with both a start and a due date legitimately appears twice — as
 * two different facts about the same project, not as two projects.
 */
export type CalendarAnchor = "start" | "due";

export interface CalendarKindConfig {
  readonly value: CalendarItemKind;
  readonly label: string;
  readonly plural: string;
  readonly icon: LucideIcon;
  /** Non-colour cue, so kind never depends on colour perception (WCAG 1.4.1). */
  readonly glyph: string;
  readonly dotClass: string;
  readonly badgeClass: string;
  readonly textClass: string;
}

export const CALENDAR_KIND_CONFIG: Record<CalendarItemKind, CalendarKindConfig> = {
  task: {
    value: "task",
    label: "Task",
    plural: "Tasks",
    icon: CheckSquare,
    glyph: "□",
    dotClass: "bg-sky-400",
    badgeClass: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    textClass: "text-sky-300",
  },
  milestone: {
    value: "milestone",
    label: "Milestone",
    plural: "Milestones",
    icon: Flag,
    glyph: "◆",
    dotClass: "bg-violet-400",
    badgeClass: "border-violet-400/25 bg-violet-400/10 text-violet-300",
    textClass: "text-violet-300",
  },
  project: {
    value: "project",
    label: "Project",
    plural: "Projects",
    icon: FolderKanban,
    glyph: "◈",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    textClass: "text-amber-300",
  },
  goal: {
    value: "goal",
    label: "Goal",
    plural: "Goals",
    icon: Target,
    glyph: "◎",
    dotClass: "bg-emerald-400",
    badgeClass: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    textClass: "text-emerald-300",
  },
};

export const CALENDAR_KINDS: readonly CalendarItemKind[] = ["task", "milestone", "project", "goal"];

export function isCalendarKind(value: unknown): value is CalendarItemKind {
  return typeof value === "string" && (CALENDAR_KINDS as readonly string[]).includes(value);
}

/** How the item is labelled on the grid: "Due" is implicit, "Starts" is not. */
export const CALENDAR_ANCHOR_LABEL: Record<CalendarAnchor, string> = {
  start: "Starts",
  due: "Due",
};

/** Whether completed work is drawn at all. State lives in the URL as `show`. */
export type CalendarCompletionFilter = "all" | "open";

export const CALENDAR_COMPLETION_FILTERS: readonly {
  value: CalendarCompletionFilter;
  label: string;
}[] = [
  { value: "all", label: "Everything" },
  { value: "open", label: "Open only" },
];

export const DEFAULT_COMPLETION_FILTER: CalendarCompletionFilter = "all";

export function isCompletionFilter(value: unknown): value is CalendarCompletionFilter {
  return value === "all" || value === "open";
}

/**
 * Weeks start on Monday.
 *
 * Fixed rather than locale-derived on purpose: a locale-dependent grid renders
 * differently on the server and in the browser and produces a hydration
 * mismatch, exactly as locale-dependent date *text* did in Phase 1.
 */
export const WEEK_STARTS_ON = 1;

/** How far ahead the timeline reaches. Bounded, like every other range. */
export const TIMELINE_DAYS = 30;

/** Guard rail on the query layer: no request may span more than a year. */
export const MAX_RANGE_DAYS = 400;

/** Items drawn on a month cell before it collapses into "+N more". */
export const MONTH_CELL_VISIBLE_ITEMS = 3;

export const CALENDAR_ICON: LucideIcon = CalendarDays;

/**
 * Hard cap on rows read per source per request.
 *
 * The date range already bounds the query; this bounds the pathological case
 * of a single day carrying thousands of tasks, so one row of the grid can
 * never become an unbounded read.
 */
export const MAX_ITEMS_PER_KIND = 500;

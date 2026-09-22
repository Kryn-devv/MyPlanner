import type { HabitFrequency, HabitStatus } from "@/generated/prisma/enums";
import type { StatusConfig } from "./projects";

/**
 * Habit presentation and rules.
 *
 * Mirrors src/config/goals.ts on purpose — habits sit beside goals and projects
 * in the sidebar, and a second vocabulary for the same ideas would be noise.
 * Every status and frequency carries a glyph and a text label as well as a
 * colour, so nothing here depends on colour perception (WCAG 1.4.1).
 *
 * In `src/config` because client components need these values and the habit
 * query layer is `server-only`.
 */

export const HABIT_STATUS_CONFIG: Record<HabitStatus, StatusConfig<HabitStatus>> = {
  ACTIVE: {
    value: "ACTIVE",
    label: "Active",
    glyph: "◎",
    badgeClass: "border-accent/25 bg-accent/10 text-accent-strong",
    textClass: "text-accent-strong",
  },
  PAUSED: {
    value: "PAUSED",
    label: "Paused",
    glyph: "‖",
    badgeClass: "border-caution/25 bg-caution/10 text-caution",
    textClass: "text-caution",
  },
  ARCHIVED: {
    value: "ARCHIVED",
    label: "Archived",
    glyph: "▤",
    badgeClass: "border-line-strong bg-white/[0.03] text-ink-faint",
    textClass: "text-ink-faint",
  },
};

export const HABIT_STATUSES: readonly HabitStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

export type HabitStatusFilter = "ACTIVE" | "PAUSED" | "ARCHIVED" | "ALL";

export const HABIT_FILTERS: readonly { value: HabitStatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "ALL", label: "All" },
];

export interface FrequencyConfig {
  readonly value: HabitFrequency;
  readonly label: string;
  readonly hint: string;
}

export const HABIT_FREQUENCY_CONFIG: Record<HabitFrequency, FrequencyConfig> = {
  DAILY: { value: "DAILY", label: "Every day", hint: "Due every single day." },
  WEEKDAYS: {
    value: "WEEKDAYS",
    label: "Chosen days",
    hint: "Due on the weekdays you pick — the others are not misses.",
  },
  WEEKLY: {
    value: "WEEKLY",
    label: "Times per week",
    hint: "A number of times each Monday–Sunday week, on any days.",
  },
};

export const HABIT_FREQUENCIES: readonly HabitFrequency[] = ["DAILY", "WEEKDAYS", "WEEKLY"];

/**
 * Weekday numbering follows the date layer: 0 = Sunday … 6 = Saturday, which
 * is what `partsOf().weekday` returns. Presented Monday-first, as the calendar
 * is (`WEEK_STARTS_ON`), so the pickers and the grid agree.
 */
export const WEEKDAY_OPTIONS: readonly { value: number; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
];

export const MAX_HABIT_NAME_LENGTH = 120;
export const MAX_HABIT_DESCRIPTION_LENGTH = 2000;

/** Modest by default: a habit is small and frequent, a task is neither. */
export const DEFAULT_HABIT_XP = 10;

export const MIN_WEEKLY_TARGET = 1;
export const MAX_WEEKLY_TARGET = 7;

/**
 * How far back the streak and history reads look.
 *
 * Streaks are derived on read from completion dates rather than cached, so the
 * read has to be bounded somewhere. A year covers any streak a person is likely
 * to hold and every history view the UI draws; a longer run is reported as
 * "365+" rather than loading an unbounded table.
 */
export const HABIT_HISTORY_DAYS = 366;

/** How many weeks the detail page's history grid shows. */
export const HISTORY_GRID_WEEKS = 12;

/** Recent completions listed on the detail page before it stops. */
export const RECENT_COMPLETIONS_LIMIT = 10;

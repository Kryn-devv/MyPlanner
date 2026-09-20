import type { GoalStatus } from "@/generated/prisma/enums";
import type { StatusConfig } from "./projects";

/**
 * Goal presentation and rules.
 *
 * Mirrors src/config/projects.ts on purpose — goals and projects are read side
 * by side, and inventing a second vocabulary for the same ideas would be noise.
 * Every status carries a glyph and a text label as well as a colour, so status
 * never depends on colour perception (WCAG 1.4.1).
 */

export const GOAL_STATUS_CONFIG: Record<GoalStatus, StatusConfig<GoalStatus>> = {
  ACTIVE: {
    value: "ACTIVE",
    label: "Active",
    glyph: "◎",
    badgeClass: "border-accent/25 bg-accent/10 text-accent-strong",
    textClass: "text-accent-strong",
  },
  COMPLETED: {
    value: "COMPLETED",
    label: "Achieved",
    glyph: "✓",
    badgeClass: "border-positive/25 bg-positive/10 text-positive",
    textClass: "text-positive",
  },
  ARCHIVED: {
    value: "ARCHIVED",
    label: "Archived",
    glyph: "▤",
    badgeClass: "border-line-strong bg-white/[0.03] text-ink-faint",
    textClass: "text-ink-faint",
  },
};

export const GOAL_STATUSES: readonly GoalStatus[] = ["ACTIVE", "COMPLETED", "ARCHIVED"];

export type GoalStatusFilter = "ACTIVE" | "COMPLETED" | "ARCHIVED" | "ALL" | "OVERDUE";

export const GOAL_FILTERS: readonly { value: GoalStatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "COMPLETED", label: "Achieved" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "ALL", label: "All" },
];

export type GoalSort = "urgency" | "updated" | "name" | "priority";

export const GOAL_SORTS: readonly { value: GoalSort; label: string }[] = [
  { value: "urgency", label: "Target date" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "priority", label: "Priority" },
];

/**
 * Sentinel for "projects with no goal", which a null id cannot express in a
 * URL or a `<select>`.
 *
 * Lives here rather than beside the goal queries because client components need
 * it, and those queries are `server-only` — importing the value from there
 * would drag the whole server module into the browser bundle.
 */
export const NO_GOAL = "none";

/**
 * How near a target date has to be for a goal to read as "due soon".
 *
 * A fixed, documented window rather than a judgement about urgency: the app has
 * no way to know how much work a goal really needs, so anything cleverer would
 * be a guess dressed up as advice.
 */
export const GOAL_DUE_SOON_DAYS = 7;

export const MAX_GOAL_TITLE_LENGTH = 120;
export const MAX_GOAL_DESCRIPTION_LENGTH = 2000;

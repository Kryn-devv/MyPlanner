import type { MilestoneStatus, ProjectStatus } from "@/generated/prisma/enums";

/**
 * Presentation for project and milestone lifecycle states.
 *
 * Every state carries a text label and a distinct glyph alongside its colour,
 * for the same reason priorities do: status must never be communicated by
 * colour alone (WCAG 1.4.1).
 */
export interface StatusConfig<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly glyph: string;
  readonly badgeClass: string;
  readonly textClass: string;
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, StatusConfig<ProjectStatus>> = {
  ACTIVE: {
    value: "ACTIVE",
    label: "Active",
    glyph: "◈",
    badgeClass: "border-accent/25 bg-accent/10 text-accent-strong",
    textClass: "text-accent-strong",
  },
  COMPLETED: {
    value: "COMPLETED",
    label: "Completed",
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

export const PROJECT_STATUSES: readonly ProjectStatus[] = ["ACTIVE", "COMPLETED", "ARCHIVED"];

export const MILESTONE_STATUS_CONFIG: Record<MilestoneStatus, StatusConfig<MilestoneStatus>> = {
  PENDING: {
    value: "PENDING",
    label: "Pending",
    glyph: "○",
    badgeClass: "border-line-strong bg-white/[0.03] text-ink-muted",
    textClass: "text-ink-muted",
  },
  COMPLETED: {
    value: "COMPLETED",
    label: "Completed",
    glyph: "✓",
    badgeClass: "border-positive/25 bg-positive/10 text-positive",
    textClass: "text-positive",
  },
};

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = ["PENDING", "COMPLETED"];

/**
 * Which projects the list shows. `ALL` deliberately still excludes nothing —
 * archived projects are the reason the filter exists.
 */
export type ProjectStatusFilter = "ACTIVE" | "COMPLETED" | "ARCHIVED" | "ALL" | "OVERDUE";

export const PROJECT_FILTERS: readonly { value: ProjectStatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "ALL", label: "All" },
];

export type ProjectSort = "urgency" | "updated" | "name" | "priority";

export const PROJECT_SORTS: readonly { value: ProjectSort; label: string }[] = [
  { value: "urgency", label: "Due date" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "priority", label: "Priority" },
];

export const MAX_PROJECT_NAME_LENGTH = 100;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2000;
export const MAX_MILESTONE_TITLE_LENGTH = 120;
export const MAX_MILESTONE_DESCRIPTION_LENGTH = 1000;
/** A project needing more than this many checkpoints wants sub-projects. */
export const MAX_MILESTONES_PER_PROJECT = 50;

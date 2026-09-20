import { daysBetween, type LocalDate } from "@/lib/datetime";
import type { MilestoneStatus, ProjectStatus } from "@/generated/prisma/enums";

/**
 * Progress and overdue rules.
 *
 * Pure functions over plain counts, with no database and no clock of their
 * own, so every edge case is testable directly. The counts themselves are
 * produced by aggregate queries — the UI never receives a task array merely to
 * compute "how many are done".
 *
 * Progress is always *derived*. It is never stored, because a stored
 * percentage is a second source of truth that goes stale the moment a task
 * moves. Status, by contrast, is always explicit: see the note on
 * `ProjectStatus` in the Prisma schema.
 */

export interface TaskCounts {
  readonly total: number;
  readonly completed: number;
}

export interface Progress {
  readonly total: number;
  readonly completed: number;
  /** 0–100, rounded. Zero when there is nothing to measure. */
  readonly percent: number;
  /** True when there are no tasks at all — the UI must say so rather than showing 0%. */
  readonly isEmpty: boolean;
  /** True when every task is done. False for an empty set: nothing is not everything. */
  readonly isComplete: boolean;
}

export function calculateProgress(counts: TaskCounts): Progress {
  const total = Math.max(0, Math.floor(counts.total) || 0);
  // Completed can never exceed the total, however the counts were produced.
  const completed = Math.min(total, Math.max(0, Math.floor(counts.completed) || 0));

  const isEmpty = total === 0;

  return {
    total,
    completed,
    // An empty set is 0%, but `isEmpty` is what the UI should branch on:
    // rendering a bare "0%" for a project with no tasks reads as failure.
    percent: isEmpty ? 0 : Math.round((completed / total) * 100),
    isEmpty,
    isComplete: !isEmpty && completed === total,
  };
}

/**
 * Whether a project's deadline has passed.
 *
 * A finished or archived project is never overdue — it is not waiting on
 * anything. `today` is the user's own calendar day, resolved by the caller
 * through their timezone, so this never consults a server clock.
 */
export function isProjectOverdue(
  project: { status: ProjectStatus; dueDate: LocalDate | null },
  today: LocalDate,
): boolean {
  if (project.status !== "ACTIVE") return false;
  if (!project.dueDate) return false;
  return daysBetween(project.dueDate, today) < 0;
}

/** Same rule for milestones: a completed checkpoint cannot be late. */
export function isMilestoneOverdue(
  milestone: { status: MilestoneStatus; dueDate: LocalDate | null },
  today: LocalDate,
): boolean {
  if (milestone.status !== "PENDING") return false;
  if (!milestone.dueDate) return false;
  return daysBetween(milestone.dueDate, today) < 0;
}

/**
 * Whether the UI may offer "all done — complete this?".
 *
 * Only a suggestion. Nothing here mutates status; the user decides, which is
 * the whole point of keeping status explicit.
 */
export function suggestsCompletion(
  progress: Progress,
  status: ProjectStatus | MilestoneStatus,
): boolean {
  return status !== "COMPLETED" && status !== "ARCHIVED" && progress.isComplete;
}

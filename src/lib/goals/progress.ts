import { daysBetween, type LocalDate } from "@/lib/datetime";
import { GOAL_DUE_SOON_DAYS } from "@/config/goals";
import { calculateProgress, type Progress, type TaskCounts } from "@/lib/projects/progress";
import type { GoalStatus } from "@/generated/prisma/enums";

/**
 * Goal progress and target-date rules.
 *
 * Pure functions over plain counts, with no database and no clock of their own.
 *
 * The progress metric is deliberately **tasks, pooled across the goal's
 * projects** — not the average of its projects' percentages. Averaging treats a
 * two-task project and a fifty-task project as equal contributors, so finishing
 * something trivial can move a goal further than finishing something hard.
 * Pooling counts the work that actually exists:
 *
 *     Project A   8/10 tasks
 *     Project B   2/20 tasks
 *     pooled   -> 10/30 = 33%     (averaged would claim 45%)
 *
 * Pooling is also the version a person can check by hand, which matters more
 * for a number that is supposed to tell you where you stand.
 */

/** Why a goal's progress bar is empty — the two cases mean different things. */
export type GoalProgressState = "no-projects" | "no-tasks" | "in-progress" | "complete";

export interface GoalProgress extends Progress {
  readonly projectCount: number;
  readonly state: GoalProgressState;
}

export function calculateGoalProgress(counts: TaskCounts, projectCount: number): GoalProgress {
  const progress = calculateProgress(counts);
  const projects = Math.max(0, Math.floor(projectCount) || 0);

  // "No projects connected" and "connected, but nothing to do yet" are
  // different situations needing different words. Neither is 0% of anything,
  // and showing 0% for either reads as failure rather than as emptiness.
  const state: GoalProgressState =
    projects === 0
      ? "no-projects"
      : progress.isEmpty
        ? "no-tasks"
        : progress.isComplete
          ? "complete"
          : "in-progress";

  return { ...progress, projectCount: projects, state };
}

// ---------------------------------------------------------------------------
// Target dates
// ---------------------------------------------------------------------------

/** How a goal stands relative to its target date. */
export type GoalTimingState = "none" | "overdue" | "due-today" | "due-soon" | "on-track";

export interface GoalTiming {
  readonly state: GoalTimingState;
  /** Positive when the target is ahead, negative when it has passed. */
  readonly daysRemaining: number | null;
  /** Ready-to-render, deterministic — no locale data involved. */
  readonly label: string;
}

/**
 * Where a goal sits against its target.
 *
 * Only live goals can be late: something achieved or put away is not waiting on
 * anything. `today` is the user's own calendar day, resolved by the caller
 * through their timezone, so this never consults a server clock.
 */
export function getGoalTiming(
  goal: { status: GoalStatus; targetDate: LocalDate | null },
  today: LocalDate,
): GoalTiming {
  if (!goal.targetDate || goal.status !== "ACTIVE") {
    return { state: "none", daysRemaining: null, label: "" };
  }

  const daysRemaining = daysBetween(goal.targetDate, today);

  if (daysRemaining < 0) {
    const late = Math.abs(daysRemaining);
    return {
      state: "overdue",
      daysRemaining,
      label: `Overdue by ${late} ${late === 1 ? "day" : "days"}`,
    };
  }

  if (daysRemaining === 0) {
    return { state: "due-today", daysRemaining, label: "Due today" };
  }

  const state: GoalTimingState = daysRemaining <= GOAL_DUE_SOON_DAYS ? "due-soon" : "on-track";
  return {
    state,
    daysRemaining,
    label: `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`,
  };
}

export function isGoalOverdue(
  goal: { status: GoalStatus; targetDate: LocalDate | null },
  today: LocalDate,
): boolean {
  return getGoalTiming(goal, today).state === "overdue";
}

/**
 * Whether the UI may offer "all the work is done — call this achieved?".
 *
 * Only a suggestion. Nothing here mutates status: a goal is a statement about
 * intent, and only the person who set it can say it has been met.
 */
export function suggestsGoalCompletion(progress: GoalProgress, status: GoalStatus): boolean {
  return status === "ACTIVE" && progress.state === "complete";
}

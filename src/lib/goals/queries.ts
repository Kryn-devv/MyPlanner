import "server-only";

import type { GoalSort, GoalStatusFilter } from "@/config/goals";
import { getPriorityConfig } from "@/config/priorities";
import { dbDateToLocalDate, getLocalToday, localDateToDbDate, type LocalDate } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { getProjects, type ProjectSummaryView } from "@/lib/projects/queries";
import type { GoalStatus, Priority } from "@/generated/prisma/enums";
import {
  calculateGoalProgress,
  getGoalTiming,
  type GoalProgress,
  type GoalTiming,
} from "./progress";

/**
 * Goal read models.
 *
 * Two rules shape this file, inherited from the project queries:
 *
 *  - Counting happens in the *database*. A goal's progress pools the tasks
 *    across all of its projects; pulling those tasks into Node to count them
 *    would make a goal list cost O(all tasks the user has ever created). One
 *    grouped query returns the counts for every goal at once.
 *  - Everything returned is plain and serialisable — dates are `YYYY-MM-DD`
 *    strings — because server components hand these straight to client ones.
 */

export interface GoalView {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: GoalStatus;
  readonly priority: Priority;
  readonly startDate: LocalDate | null;
  readonly targetDate: LocalDate | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface GoalSummaryView extends GoalView {
  readonly progress: GoalProgress;
  readonly timing: GoalTiming;
  readonly isOverdue: boolean;
}

const GOAL_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  targetDate: true,
  completedAt: true,
  archivedAt: true,
  updatedAt: true,
  createdAt: true,
} as const;

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: Priority;
  startDate: Date | null;
  targetDate: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

function toGoalView(row: GoalRow): GoalView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    startDate: dbDateToLocalDate(row.startDate),
    targetDate: dbDateToLocalDate(row.targetDate),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

interface GoalCounts {
  total: number;
  completed: number;
  overdue: number;
  projectCount: number;
}

/**
 * Task and project counts per goal, for any number of goals, in three queries.
 *
 * Tasks reach their goal only through their project — the single path the
 * hierarchy defines — so the counts are produced by grouping tasks per project
 * and folding those projects into their goals. Three grouped queries total,
 * regardless of how many goals or projects are involved; the obvious
 * alternative, a query per goal, is the N+1 this exists to avoid. No task row
 * ever crosses the wire.
 *
 * Projects are counted separately rather than inferred from the task grouping:
 * a goal with projects but no tasks contributes nothing to that grouping and
 * would otherwise be indistinguishable from a goal with no projects at all —
 * two states the UI has to describe differently.
 */
async function countByGoal(
  userId: string,
  goalIds: readonly string[],
  today: LocalDate,
): Promise<Map<string, GoalCounts>> {
  const counts = new Map<string, GoalCounts>();
  if (goalIds.length === 0) return counts;

  const ids = [...goalIds];
  for (const id of ids) counts.set(id, { total: 0, completed: 0, overdue: 0, projectCount: 0 });

  const projects = await prisma.project.findMany({
    where: { userId, goalId: { in: ids } },
    select: { id: true, goalId: true },
  });

  for (const project of projects) {
    const entry = project.goalId ? counts.get(project.goalId) : undefined;
    if (entry) entry.projectCount += 1;
  }

  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return counts;

  const goalByProject = new Map(projects.map((p) => [p.id, p.goalId as string]));

  const [grouped, overdueGrouped] = await Promise.all([
    prisma.task.groupBy({
      by: ["projectId", "completed"],
      where: { userId, projectId: { in: projectIds } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        userId,
        completed: false,
        dueDate: { lt: localDateToDbDate(today) },
        projectId: { in: projectIds },
      },
      _count: { _all: true },
    }),
  ]);

  for (const row of grouped) {
    const goalId = row.projectId ? goalByProject.get(row.projectId) : undefined;
    const entry = goalId ? counts.get(goalId) : undefined;
    if (!entry) continue;
    entry.total += row._count._all;
    if (row.completed) entry.completed += row._count._all;
  }

  for (const row of overdueGrouped) {
    const goalId = row.projectId ? goalByProject.get(row.projectId) : undefined;
    const entry = goalId ? counts.get(goalId) : undefined;
    if (entry) entry.overdue += row._count._all;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Goal list
// ---------------------------------------------------------------------------

export interface GoalListFilters {
  readonly status?: GoalStatusFilter;
  readonly search?: string | null;
  readonly sort?: GoalSort;
}

function statusWhere(filter: GoalStatusFilter, today: LocalDate) {
  switch (filter) {
    case "ALL":
      return {};
    case "OVERDUE":
      // Only live goals can be late, and the cutoff is the user's own day.
      return { status: "ACTIVE" as const, targetDate: { lt: localDateToDbDate(today) } };
    default:
      return { status: filter };
  }
}

export async function getGoals(
  userId: string,
  timezone: string,
  filters: GoalListFilters = {},
  now: Date = new Date(),
): Promise<GoalSummaryView[]> {
  const { status = "ACTIVE", search = null, sort = "urgency" } = filters;
  const today = getLocalToday(timezone, now);

  const rows = await prisma.goal.findMany({
    where: {
      userId,
      ...statusWhere(status, today),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: GOAL_SELECT,
    orderBy: [{ targetDate: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  const counts = await countByGoal(userId, rows.map((r) => r.id), today);

  const summaries = rows.map((row): GoalSummaryView => {
    const view = toGoalView(row);
    const entry = counts.get(row.id) ?? { total: 0, completed: 0, overdue: 0, projectCount: 0 };
    const timing = getGoalTiming(view, today);

    return {
      ...view,
      progress: calculateGoalProgress(entry, entry.projectCount),
      timing,
      isOverdue: timing.state === "overdue",
    };
  });

  return sortGoals(summaries, sort);
}

/**
 * Ordering.
 *
 * Done in JS because "urgency" mixes a nullable date with an enum weight, and
 * the list is capped at 200. No option invents a subjective ranking: each sorts
 * on exactly the field it names, with a stable tiebreak.
 */
function sortGoals(goals: GoalSummaryView[], sort: GoalSort): GoalSummaryView[] {
  const byTitle = (a: GoalSummaryView, b: GoalSummaryView) => a.title.localeCompare(b.title, "en");

  switch (sort) {
    case "name":
      return [...goals].sort(byTitle);

    case "updated":
      return [...goals].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      );

    case "priority":
      return [...goals].sort((a, b) => {
        const delta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
        return delta !== 0 ? delta : byTitle(a, b);
      });

    case "urgency":
    default:
      return [...goals].sort((a, b) => {
        // Overdue first, then soonest target, then undated, then priority.
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.targetDate !== b.targetDate) {
          if (a.targetDate === null) return 1;
          if (b.targetDate === null) return -1;
          return a.targetDate < b.targetDate ? -1 : 1;
        }
        const delta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
        return delta !== 0 ? delta : byTitle(a, b);
      });
  }
}

/** Counts per status, for the filter bar. One grouped query. */
export async function getGoalStatusCounts(
  userId: string,
): Promise<Record<GoalStatus, number> & { ALL: number }> {
  const grouped = await prisma.goal.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  const counts = { ACTIVE: 0, COMPLETED: 0, ARCHIVED: 0, ALL: 0 };
  for (const row of grouped) {
    counts[row.status] = row._count._all;
    counts.ALL += row._count._all;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Goal detail
// ---------------------------------------------------------------------------

export interface GoalDetail {
  readonly goal: GoalSummaryView;
  readonly projects: readonly ProjectSummaryView[];
  readonly today: LocalDate;
  readonly stats: {
    readonly totalTasks: number;
    readonly completedTasks: number;
    readonly remainingTasks: number;
    readonly overdueTasks: number;
    readonly activeProjects: number;
    readonly completedProjects: number;
  };
}

/**
 * Everything the goal detail page renders, in one call.
 *
 * Returns `null` rather than throwing when the goal is not the caller's — the
 * page turns that into a 404, so a probe cannot tell "not yours" from "does not
 * exist".
 */
export async function getGoalDetail(
  userId: string,
  goalId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<GoalDetail | null> {
  const today = getLocalToday(timezone, now);

  const row = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: GOAL_SELECT,
  });
  if (!row) return null;

  const [counts, projects] = await Promise.all([
    countByGoal(userId, [goalId], today),
    // Reuses the project list query so a project reads identically here and on
    // the projects page — same progress, same overdue rule, same shape.
    getProjects(userId, timezone, { status: "ALL", goalId }, now),
  ]);

  const entry = counts.get(goalId) ?? { total: 0, completed: 0, overdue: 0, projectCount: 0 };
  const view = toGoalView(row);
  const timing = getGoalTiming(view, today);

  return {
    goal: {
      ...view,
      progress: calculateGoalProgress(entry, projects.length),
      timing,
      isOverdue: timing.state === "overdue",
    },
    projects,
    today,
    stats: {
      totalTasks: entry.total,
      completedTasks: entry.completed,
      remainingTasks: Math.max(0, entry.total - entry.completed),
      overdueTasks: entry.overdue,
      activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
      completedProjects: projects.filter((p) => p.status === "COMPLETED").length,
    },
  };
}

// ---------------------------------------------------------------------------
// Pickers and dashboard
// ---------------------------------------------------------------------------

export interface GoalOption {
  readonly id: string;
  readonly title: string;
  readonly status: GoalStatus;
}

/**
 * Selectable goals for the project form and filters.
 *
 * Archived goals are excluded: filing new work under something explicitly put
 * away is almost never intended. A project already attached to an archived goal
 * keeps that attachment — this only governs the picker.
 */
export async function getGoalOptions(userId: string): Promise<GoalOption[]> {
  return prisma.goal.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, status: true },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });
}

/** A small set of live goals for the dashboard panel. */
export async function getActiveGoalsForDashboard(
  userId: string,
  timezone: string,
  limit = 3,
  now: Date = new Date(),
): Promise<GoalSummaryView[]> {
  const goals = await getGoals(userId, timezone, { status: "ACTIVE", sort: "urgency" }, now);
  return goals.slice(0, limit);
}

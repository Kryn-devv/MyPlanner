import "server-only";

import type { ProjectSort, ProjectStatusFilter } from "@/config/projects";
import { NO_GOAL } from "@/config/goals";
import { dbDateToLocalDate, getLocalToday, localDateToDbDate, type LocalDate } from "@/lib/datetime";
import { getPriorityConfig } from "@/config/priorities";
import { prisma } from "@/lib/prisma";
import { getTasks, type TaskView } from "@/lib/tasks/queries";
import type { MilestoneStatus, Priority, ProjectStatus } from "@/generated/prisma/enums";
import { calculateProgress, isMilestoneOverdue, isProjectOverdue, type Progress } from "./progress";

/**
 * Project read models.
 *
 * Two rules shape this file:
 *
 *  - Progress is computed by the *database*. Counting completed tasks by
 *    pulling every task into Node would turn a project list into an O(tasks)
 *    payload; one `groupBy` returns the counts for every project at once, so
 *    the page cost does not grow with how much work the user has recorded.
 *  - Everything returned is plain and serialisable — dates are `YYYY-MM-DD`
 *    strings — because server components hand these straight to client ones.
 */

/** Just enough goal identity to render a breadcrumb on a project. */
export interface ProjectGoalRef {
  readonly id: string;
  readonly title: string;
  readonly status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
}

export interface ProjectView {
  readonly id: string;
  readonly goalId: string | null;
  readonly goal: ProjectGoalRef | null;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
  readonly status: ProjectStatus;
  readonly priority: Priority;
  readonly startDate: LocalDate | null;
  readonly dueDate: LocalDate | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface ProjectSummaryView extends ProjectView {
  readonly progress: Progress;
  readonly milestoneCount: number;
  readonly completedMilestoneCount: number;
  readonly isOverdue: boolean;
}

export interface MilestoneView {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: LocalDate | null;
  readonly status: MilestoneStatus;
  readonly position: number;
  readonly completedAt: string | null;
  readonly progress: Progress;
  readonly isOverdue: boolean;
}

const PROJECT_SELECT = {
  id: true,
  goalId: true,
  // Selected rather than joined wholesale: a project shows its goal's title,
  // never its description or dates.
  goal: { select: { id: true, title: true, status: true } },
  name: true,
  description: true,
  color: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  completedAt: true,
  archivedAt: true,
  updatedAt: true,
  createdAt: true,
} as const;

type ProjectRow = {
  id: string;
  goalId: string | null;
  goal: { id: string; title: string; status: "ACTIVE" | "COMPLETED" | "ARCHIVED" } | null;
  name: string;
  description: string | null;
  color: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

function toProjectView(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    goalId: row.goalId,
    goal: row.goal,
    name: row.name,
    description: row.description,
    color: row.color,
    status: row.status,
    priority: row.priority,
    startDate: dbDateToLocalDate(row.startDate),
    dueDate: dbDateToLocalDate(row.dueDate),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/**
 * Task counts per project, for many projects, in one query.
 *
 * Grouping by `(projectId, completed)` gives both the total and the completed
 * count without a second round trip and without loading a single task row.
 */
async function countTasksByProject(
  userId: string,
  projectIds: readonly string[],
): Promise<Map<string, { total: number; completed: number }>> {
  const counts = new Map<string, { total: number; completed: number }>();
  if (projectIds.length === 0) return counts;

  const grouped = await prisma.task.groupBy({
    by: ["projectId", "completed"],
    where: { userId, projectId: { in: [...projectIds] } },
    _count: { _all: true },
  });

  for (const row of grouped) {
    if (!row.projectId) continue;
    const entry = counts.get(row.projectId) ?? { total: 0, completed: 0 };
    entry.total += row._count._all;
    if (row.completed) entry.completed += row._count._all;
    counts.set(row.projectId, entry);
  }

  return counts;
}

/** The same trick, keyed by milestone, scoped to a single project. */
async function countTasksByMilestone(
  userId: string,
  projectId: string,
): Promise<Map<string, { total: number; completed: number }>> {
  const grouped = await prisma.task.groupBy({
    by: ["milestoneId", "completed"],
    where: { userId, projectId, milestoneId: { not: null } },
    _count: { _all: true },
  });

  const counts = new Map<string, { total: number; completed: number }>();
  for (const row of grouped) {
    if (!row.milestoneId) continue;
    const entry = counts.get(row.milestoneId) ?? { total: 0, completed: 0 };
    entry.total += row._count._all;
    if (row.completed) entry.completed += row._count._all;
    counts.set(row.milestoneId, entry);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------

export interface ProjectListFilters {
  readonly status?: ProjectStatusFilter;
  readonly search?: string | null;
  readonly sort?: ProjectSort;
  /** A goal id, or the literal "none" for projects not under any goal. */
  readonly goalId?: string | null;
}

/** Translates a UI filter into a WHERE clause. */
function statusWhere(filter: ProjectStatusFilter, today: LocalDate) {
  switch (filter) {
    case "ALL":
      return {};
    case "OVERDUE":
      // Only active work can be late, and the cutoff is the user's own day.
      return { status: "ACTIVE" as const, dueDate: { lt: localDateToDbDate(today) } };
    default:
      return { status: filter };
  }
}

export async function getProjects(
  userId: string,
  timezone: string,
  filters: ProjectListFilters = {},
  now: Date = new Date(),
): Promise<ProjectSummaryView[]> {
  const { status = "ACTIVE", search = null, sort = "urgency", goalId = null } = filters;
  const today = getLocalToday(timezone, now);

  const rows = await prisma.project.findMany({
    where: {
      userId,
      ...statusWhere(status, today),
      ...(goalId ? (goalId === NO_GOAL ? { goalId: null } : { goalId }) : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      ...PROJECT_SELECT,
      // One aggregate per project, resolved by the database.
      _count: { select: { milestones: true } },
      milestones: { where: { status: "COMPLETED" }, select: { id: true } },
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  const counts = await countTasksByProject(userId, rows.map((r) => r.id));

  const summaries = rows.map((row): ProjectSummaryView => {
    const view = toProjectView(row);
    return {
      ...view,
      progress: calculateProgress(counts.get(row.id) ?? { total: 0, completed: 0 }),
      milestoneCount: row._count.milestones,
      completedMilestoneCount: row.milestones.length,
      isOverdue: isProjectOverdue(view, today),
    };
  });

  return sortProjects(summaries, sort);
}

/**
 * Ordering.
 *
 * Done in JS because "urgency" mixes a nullable date with an enum weight, and
 * the list is capped at 200 — expressing it in SQL would cost more clarity
 * than it saves. No ordering invents a subjective "best project": each option
 * sorts on exactly the field it names, with a stable tiebreak.
 */
function sortProjects(projects: ProjectSummaryView[], sort: ProjectSort): ProjectSummaryView[] {
  const byName = (a: ProjectSummaryView, b: ProjectSummaryView) =>
    a.name.localeCompare(b.name, "en");

  switch (sort) {
    case "name":
      return [...projects].sort(byName);

    case "updated":
      return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

    case "priority":
      return [...projects].sort((a, b) => {
        const delta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
        return delta !== 0 ? delta : byName(a, b);
      });

    case "urgency":
    default:
      return [...projects].sort((a, b) => {
        // Overdue first, then soonest deadline, then undated, then priority.
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.dueDate !== b.dueDate) {
          if (a.dueDate === null) return 1;
          if (b.dueDate === null) return -1;
          return a.dueDate < b.dueDate ? -1 : 1;
        }
        const delta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
        return delta !== 0 ? delta : byName(a, b);
      });
  }
}

/** Counts per status, for the filter bar. One grouped query. */
export async function getProjectStatusCounts(
  userId: string,
): Promise<Record<ProjectStatus, number> & { ALL: number }> {
  const grouped = await prisma.project.groupBy({
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
// Project detail
// ---------------------------------------------------------------------------

export type ProjectTaskFilter = "all" | "open" | "completed" | "overdue";

export interface ProjectDetail {
  readonly project: ProjectSummaryView;
  readonly milestones: readonly MilestoneView[];
  readonly tasks: readonly TaskView[];
  /** Tasks in the project that are not filed under any milestone. */
  readonly unassignedTasks: readonly TaskView[];
  readonly today: LocalDate;
  readonly stats: {
    readonly totalTasks: number;
    readonly completedTasks: number;
    readonly overdueTasks: number;
    readonly totalXpAvailable: number;
    readonly estimatedMinutesRemaining: number;
  };
}

/**
 * Everything the project detail page renders, in one call.
 *
 * Returns `null` rather than throwing when the project is not the caller's —
 * the page turns that into a 404, so a probe cannot distinguish "not yours"
 * from "does not exist".
 */
export async function getProjectDetail(
  userId: string,
  projectId: string,
  timezone: string,
  filter: ProjectTaskFilter = "all",
  now: Date = new Date(),
): Promise<ProjectDetail | null> {
  const today = getLocalToday(timezone, now);

  const row = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      ...PROJECT_SELECT,
      _count: { select: { milestones: true } },
      milestones: {
        select: {
          id: true,
          projectId: true,
          title: true,
          description: true,
          dueDate: true,
          status: true,
          position: true,
          completedAt: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!row) return null;

  const [milestoneCounts, projectCounts, tasks] = await Promise.all([
    countTasksByMilestone(userId, projectId),
    countTasksByProject(userId, [projectId]),
    // The task list itself is bounded and already scoped by userId.
    getTasks(userId, { status: filter === "completed" ? "completed" : "all", projectId }),
  ]);

  const view = toProjectView(row);
  const progress = calculateProgress(projectCounts.get(projectId) ?? { total: 0, completed: 0 });

  const milestones: MilestoneView[] = row.milestones.map((m) => {
    const milestoneView = {
      id: m.id,
      projectId: m.projectId,
      title: m.title,
      description: m.description,
      dueDate: dbDateToLocalDate(m.dueDate),
      status: m.status,
      position: m.position,
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    };
    return {
      ...milestoneView,
      progress: calculateProgress(milestoneCounts.get(m.id) ?? { total: 0, completed: 0 }),
      isOverdue: isMilestoneOverdue(milestoneView, today),
    };
  });

  const visibleTasks = applyProjectTaskFilter(tasks, filter, today);

  return {
    project: {
      ...view,
      progress,
      milestoneCount: row._count.milestones,
      completedMilestoneCount: milestones.filter((m) => m.status === "COMPLETED").length,
      isOverdue: isProjectOverdue(view, today),
    },
    milestones,
    tasks: visibleTasks,
    unassignedTasks: visibleTasks.filter((t) => t.milestoneId === null),
    today,
    stats: {
      totalTasks: progress.total,
      completedTasks: progress.completed,
      overdueTasks: tasks.filter((t) => !t.completed && t.dueDate !== null && t.dueDate < today).length,
      totalXpAvailable: tasks.filter((t) => !t.completed).reduce((sum, t) => sum + t.xpReward, 0),
      estimatedMinutesRemaining: tasks
        .filter((t) => !t.completed)
        .reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0),
    },
  };
}

function applyProjectTaskFilter(
  tasks: readonly TaskView[],
  filter: ProjectTaskFilter,
  today: LocalDate,
): TaskView[] {
  switch (filter) {
    case "open":
      return tasks.filter((t) => !t.completed);
    case "completed":
      return tasks.filter((t) => t.completed);
    case "overdue":
      return tasks.filter((t) => !t.completed && t.dueDate !== null && t.dueDate < today);
    case "all":
    default:
      return [...tasks];
  }
}

// ---------------------------------------------------------------------------
// Pickers and dashboard
// ---------------------------------------------------------------------------

/** Project + milestone options for the task form. */
export interface ProjectOption {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly status: ProjectStatus;
  readonly milestones: readonly { id: string; title: string }[];
}

/**
 * Selectable projects, with their milestones.
 *
 * Archived projects are excluded: filing new work into something explicitly
 * put away is almost never intended. A task already assigned to an archived
 * project keeps that assignment — this only governs the picker.
 */
export async function getProjectOptions(userId: string): Promise<ProjectOption[]> {
  const rows = await prisma.project.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      color: true,
      status: true,
      milestones: {
        select: { id: true, title: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return rows;
}

/** A small set of live projects for the dashboard panel. */
export async function getActiveProjectsForDashboard(
  userId: string,
  timezone: string,
  limit = 3,
  now: Date = new Date(),
): Promise<ProjectSummaryView[]> {
  const projects = await getProjects(userId, timezone, { status: "ACTIVE", sort: "urgency" }, now);
  return projects.slice(0, limit);
}

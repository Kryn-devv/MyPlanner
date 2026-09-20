import "server-only";

import {
  MAX_ITEMS_PER_KIND,
  type CalendarCompletionFilter,
  type CalendarItemKind,
} from "@/config/calendar";
import { dbDateToLocalDate, localDateToDbDate } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { isQueryableRange } from "./range";
import { sortCalendarItems } from "./items";
import type { CalendarItem, CalendarRange } from "./types";

/**
 * The calendar's read layer.
 *
 * There is no calendar table to read. Each of the four queries below goes
 * straight at the record that already owns the date — `Task.dueDate`,
 * `Milestone.dueDate`, `Project.startDate`/`dueDate`,
 * `Goal.startDate`/`targetDate` — and the rows are projected into
 * `CalendarItem` on the way out. Nothing is written, cached or materialised,
 * so the calendar cannot disagree with the task list: they are reading the
 * same columns.
 *
 * Three rules hold for every query here:
 *
 *  - **Bounded.** Every query carries an inclusive `dueDate`/`startDate`
 *    window plus a row cap. There is no code path that reads a user's whole
 *    history to filter it down afterwards.
 *  - **Ownership in the WHERE clause.** `userId` comes from the caller, which
 *    got it from the session. Milestones have no `userId` of their own, so
 *    they are filtered through `project: { userId }` — still in SQL, still
 *    never in memory.
 *  - **Selected, not loaded.** Each query names the handful of columns the
 *    grid draws.
 */

export interface CalendarFilters {
  /** Which sources to read at all. An excluded kind is never queried. */
  readonly kinds?: readonly CalendarItemKind[];
  /** `"open"` drops finished work in SQL rather than after the fact. */
  readonly show?: CalendarCompletionFilter;
}

function wants(kind: CalendarItemKind, kinds: readonly CalendarItemKind[] | undefined): boolean {
  if (!kinds || kinds.length === 0) return true;
  return kinds.includes(kind);
}

/** The inclusive `@db.Date` window shared by every query below. */
function dateWindow(range: CalendarRange) {
  return {
    gte: localDateToDbDate(range.start),
    lte: localDateToDbDate(range.end),
  };
}

function makeId(kind: CalendarItemKind, anchor: "start" | "due", sourceId: string): string {
  return `${kind}:${anchor}:${sourceId}`;
}

/**
 * Every dated record in `range` that belongs to `userId`, as calendar items.
 *
 * Returns `[]` rather than throwing for a range the guard rail rejects: the
 * anchor comes from a URL, and a malformed one is a view that shows nothing,
 * not a 500.
 */
export async function getCalendarItems(
  userId: string,
  range: CalendarRange,
  filters: CalendarFilters = {},
): Promise<CalendarItem[]> {
  if (!isQueryableRange(range)) return [];

  const { kinds, show = "all" } = filters;
  const openOnly = show === "open";
  const window = dateWindow(range);

  const [tasks, milestones, projects, goals] = await Promise.all([
    wants("task", kinds)
      ? prisma.task.findMany({
          where: {
            userId,
            dueDate: window,
            ...(openOnly ? { completed: false } : {}),
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            dueTime: true,
            completed: true,
            priority: true,
            projectId: true,
            project: { select: { name: true, color: true } },
          },
          orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }],
          take: MAX_ITEMS_PER_KIND,
        })
      : [],

    wants("milestone", kinds)
      ? prisma.milestone.findMany({
          where: {
            // A milestone carries no userId — ownership is the project's, and
            // this relation filter resolves it in SQL, not afterwards.
            project: { userId },
            dueDate: window,
            ...(openOnly ? { status: "PENDING" as const } : {}),
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            projectId: true,
            project: { select: { name: true, color: true } },
          },
          orderBy: [{ dueDate: "asc" }],
          take: MAX_ITEMS_PER_KIND,
        })
      : [],

    wants("project", kinds)
      ? prisma.project.findMany({
          where: {
            userId,
            // A project can land in the window by either of its two dates.
            OR: [{ startDate: window }, { dueDate: window }],
            ...(openOnly ? { status: "ACTIVE" as const } : {}),
          },
          select: {
            id: true,
            name: true,
            color: true,
            startDate: true,
            dueDate: true,
            status: true,
            priority: true,
            goal: { select: { title: true } },
          },
          orderBy: [{ dueDate: "asc" }],
          take: MAX_ITEMS_PER_KIND,
        })
      : [],

    wants("goal", kinds)
      ? prisma.goal.findMany({
          where: {
            userId,
            OR: [{ startDate: window }, { targetDate: window }],
            ...(openOnly ? { status: "ACTIVE" as const } : {}),
          },
          select: {
            id: true,
            title: true,
            startDate: true,
            targetDate: true,
            status: true,
            priority: true,
          },
          orderBy: [{ targetDate: "asc" }],
          take: MAX_ITEMS_PER_KIND,
        })
      : [],
  ]);

  const items: CalendarItem[] = [];

  for (const task of tasks) {
    const date = dbDateToLocalDate(task.dueDate);
    if (!date) continue;
    items.push({
      id: makeId("task", "due", task.id),
      kind: "task",
      anchor: "due",
      sourceId: task.id,
      title: task.title,
      date,
      time: task.dueTime,
      completed: task.completed,
      priority: task.priority,
      color: task.project?.color ?? null,
      context: task.project?.name ?? null,
      // Tasks have no page of their own; the project they belong to is where
      // they are read and edited. Loose tasks go to the list.
      href: task.projectId ? `/app/projects/${task.projectId}` : "/app/tasks?status=all",
    });
  }

  for (const milestone of milestones) {
    const date = dbDateToLocalDate(milestone.dueDate);
    if (!date) continue;
    items.push({
      id: makeId("milestone", "due", milestone.id),
      kind: "milestone",
      anchor: "due",
      sourceId: milestone.id,
      title: milestone.title,
      date,
      time: null,
      completed: milestone.status === "COMPLETED",
      priority: null,
      color: milestone.project.color,
      context: milestone.project.name,
      href: `/app/projects/${milestone.projectId}`,
    });
  }

  for (const project of projects) {
    // `status` is explicit state on the record. A date in the past never
    // implies completion here, exactly as it never does anywhere else.
    const completed = project.status === "COMPLETED";
    const href = `/app/projects/${project.id}`;

    const start = dbDateToLocalDate(project.startDate);
    // The OR above matches a project if *either* date is in the window, so
    // each date is re-checked before it becomes an item on the grid.
    if (start && start >= range.start && start <= range.end) {
      items.push({
        id: makeId("project", "start", project.id),
        kind: "project",
        anchor: "start",
        sourceId: project.id,
        title: project.name,
        date: start,
        time: null,
        completed,
        priority: project.priority,
        color: project.color,
        context: project.goal?.title ?? null,
        href,
      });
    }

    const due = dbDateToLocalDate(project.dueDate);
    if (due && due >= range.start && due <= range.end) {
      items.push({
        id: makeId("project", "due", project.id),
        kind: "project",
        anchor: "due",
        sourceId: project.id,
        title: project.name,
        date: due,
        time: null,
        completed,
        priority: project.priority,
        color: project.color,
        context: project.goal?.title ?? null,
        href,
      });
    }
  }

  for (const goal of goals) {
    const completed = goal.status === "COMPLETED";
    const href = `/app/goals/${goal.id}`;

    const start = dbDateToLocalDate(goal.startDate);
    if (start && start >= range.start && start <= range.end) {
      items.push({
        id: makeId("goal", "start", goal.id),
        kind: "goal",
        anchor: "start",
        sourceId: goal.id,
        title: goal.title,
        date: start,
        time: null,
        completed,
        priority: goal.priority,
        color: null,
        context: null,
        href,
      });
    }

    const target = dbDateToLocalDate(goal.targetDate);
    if (target && target >= range.start && target <= range.end) {
      items.push({
        id: makeId("goal", "due", goal.id),
        kind: "goal",
        anchor: "due",
        sourceId: goal.id,
        title: goal.title,
        date: target,
        time: null,
        completed,
        priority: goal.priority,
        color: null,
        context: null,
        href,
      });
    }
  }

  return sortCalendarItems(items);
}

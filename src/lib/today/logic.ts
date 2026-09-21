import { getPriorityConfig } from "@/config/priorities";
import type { LocalDate } from "@/lib/datetime";
import type { DayContext, DayGoalFocus, TaskBucket, TodayTask } from "./types";

/**
 * The rules behind the Today page.
 *
 * Everything here is pure: it takes tasks and two dates and gives back an
 * answer. No clock is read, no database is touched, no timezone is resolved —
 * the caller resolves "today" once, through the existing date layer, and
 * passes it in. That is what makes a historical day deterministic: the page
 * renders the same way for a given day whenever you look at it.
 */

/**
 * Which section a task belongs to. Precedence matters and is deliberate:
 *
 *  1. **Unscheduled** — no date, so it belongs to no day. It is never overdue;
 *     a task you never committed to a day cannot be late.
 *  2. **This day** — the day being viewed wins over everything else, so a task
 *     can never appear twice on one page. Completion state does not matter
 *     here: a day's work includes what you finished.
 *  3. **Overdue** — outstanding and past its deadline *as of the real current
 *     date*. Never relative to the selected day, so browsing to next week can
 *     never label a future task late.
 *  4. **Upcoming** — after the day being viewed *and* not already behind us.
 *     Both halves are needed: reviewing last Tuesday, work from last
 *     Wednesday comes after the day on screen but is not "coming up".
 *  5. **Other** — everything the day on screen has no claim on: work finished
 *     on some other past day, and days that fall between now and a future day
 *     being planned. Those days have pages of their own.
 */
export function classifyTask(task: TodayTask, context: DayContext): TaskBucket {
  const { today, selectedDate } = context;

  if (task.dueDate === null) return "unscheduled";
  if (task.dueDate === selectedDate) return "day";
  if (!task.completed && task.dueDate < today) return "overdue";
  if (task.dueDate > selectedDate && task.dueDate >= today) return "upcoming";
  return "other";
}

/** `true` when the task is outstanding and its deadline has already passed. */
export function isTaskOverdue(
  task: Pick<TodayTask, "completed" | "dueDate">,
  today: LocalDate,
): boolean {
  if (task.completed || task.dueDate === null) return false;
  return task.dueDate < today;
}

/**
 * A total order over tasks, so the same set always renders the same way.
 *
 * Reading order, and why:
 *
 *  1. outstanding work before finished work — finished work is history;
 *  2. the oldest deadline first, undated last — within one day this is a
 *     no-op, and across the overdue list it puts the longest-ignored task on
 *     top;
 *  3. anything with a clock time before all-day work, earliest first — a
 *     commitment at 09:00 outranks one that is merely due that day;
 *  4. more urgent first;
 *  5. oldest first, then id — not a preference, just a tie-break that makes
 *     the order total. Two tasks that match on everything above must not swap
 *     places between two renders of the same data.
 */
export function compareTodayTasks(a: TodayTask, b: TodayTask): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }

  if (a.dueTime !== b.dueTime) {
    if (a.dueTime === null) return 1;
    if (b.dueTime === null) return -1;
    return a.dueTime < b.dueTime ? -1 : 1;
  }

  const weightDelta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
  if (weightDelta !== 0) return weightDelta;

  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortTodayTasks(tasks: readonly TodayTask[]): TodayTask[] {
  return [...tasks].sort(compareTodayTasks);
}

/** A day's work, split the way the page renders it. */
export interface DaySections {
  readonly timed: readonly TodayTask[];
  readonly allDay: readonly TodayTask[];
  readonly completed: readonly TodayTask[];
}

/**
 * Splits one day's tasks into the three sections.
 *
 * Completed work is pulled out first rather than left to sort to the bottom:
 * it is a record of the day, not a queue, and leaving it interleaved makes the
 * remaining work harder to see.
 */
export function splitDaySections(tasks: readonly TodayTask[]): DaySections {
  const sorted = sortTodayTasks(tasks);
  const open = sorted.filter((task) => !task.completed);

  return {
    timed: open.filter((task) => task.dueTime !== null),
    allDay: open.filter((task) => task.dueTime === null),
    completed: sorted.filter((task) => task.completed),
  };
}

export interface DayProgress {
  /** Tasks dated this day — completed or not. Nothing else counts. */
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  /** Whole percent, 0 when there is nothing scheduled. */
  readonly percent: number;
  readonly isEmpty: boolean;
  readonly isComplete: boolean;
}

/**
 * Progress for the day being viewed.
 *
 * The denominator is this day's tasks and nothing else. Overdue work from
 * previous days is counted separately and unscheduled work is not counted at
 * all — folding either into the day's total would mean the bar moved without
 * the day's plan changing.
 */
export function calculateDailyProgress(tasks: readonly TodayTask[]): DayProgress {
  const total = tasks.length;
  const completed = tasks.reduce((count, task) => count + (task.completed ? 1 : 0), 0);

  return {
    total,
    completed,
    remaining: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isEmpty: total === 0,
    isComplete: total > 0 && completed === total,
  };
}

export interface Workload {
  /** Sum of every estimate on the day, in minutes. */
  readonly planned: number;
  readonly completed: number;
  readonly remaining: number;
  /** How many of the day's tasks carry an estimate at all. */
  readonly estimated: number;
  /** …and how many do not, so the figure is never passed off as complete. */
  readonly unestimated: number;
  readonly isEmpty: boolean;
}

/**
 * Estimated workload for a day.
 *
 * Estimates only. The app has no time tracking, so nothing here is a claim
 * about time actually spent, and the UI says so. Tasks with no estimate
 * contribute nothing and are counted separately rather than being guessed at.
 */
export function calculateWorkload(tasks: readonly TodayTask[]): Workload {
  let planned = 0;
  let completed = 0;
  let estimated = 0;

  for (const task of tasks) {
    const minutes = task.estimatedMinutes;
    if (minutes === null || minutes <= 0) continue;
    estimated += 1;
    planned += minutes;
    if (task.completed) completed += minutes;
  }

  return {
    planned,
    completed,
    remaining: planned - completed,
    estimated,
    unestimated: tasks.length - estimated,
    isEmpty: planned === 0,
  };
}

/**
 * Splits a mixed set of tasks into the page's sections in one pass.
 *
 * The query layer fetches each section separately, so this exists for the
 * tests and for any caller holding an unsorted mixture — it is the executable
 * statement of "a task appears in exactly one place".
 */
export function bucketTasks(
  tasks: readonly TodayTask[],
  context: DayContext,
): Record<TaskBucket, TodayTask[]> {
  const buckets: Record<TaskBucket, TodayTask[]> = {
    unscheduled: [],
    day: [],
    overdue: [],
    upcoming: [],
    other: [],
  };

  for (const task of tasks) buckets[classifyTask(task, context)].push(task);
  for (const key of Object.keys(buckets) as TaskBucket[]) {
    buckets[key] = sortTodayTasks(buckets[key]);
  }
  return buckets;
}

/**
 * The distinct goals a day's work serves.
 *
 * One line for the whole day rather than a breadcrumb on every row. A task
 * row already links to its project, and the project page states its goal; a
 * "Goal → Project → Milestone → Task" trail repeated down a list is the
 * verbosity that makes a day harder to read, not easier. What is worth saying
 * once is what the day is *for*.
 *
 * Ordered by how much of the day each goal accounts for, then by title so the
 * order is total.
 */
export function deriveDayFocus(tasks: readonly TodayTask[]): DayGoalFocus[] {
  const counts = new Map<string, DayGoalFocus>();

  for (const task of tasks) {
    const goal = task.project?.goal;
    if (!goal) continue;
    const existing = counts.get(goal.id);
    counts.set(goal.id, {
      id: goal.id,
      title: goal.title,
      taskCount: (existing?.taskCount ?? 0) + 1,
    });
  }

  return [...counts.values()].sort((a, b) => {
    if (a.taskCount !== b.taskCount) return b.taskCount - a.taskCount;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** How the selected day relates to now — the page says which it is showing. */
export type DayRelation = "today" | "past" | "future";

export function getDayRelation(context: DayContext): DayRelation {
  if (context.selectedDate === context.today) return "today";
  return context.selectedDate < context.today ? "past" : "future";
}

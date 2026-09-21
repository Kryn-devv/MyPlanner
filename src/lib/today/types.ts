import type { TaskView } from "@/lib/tasks/queries";

/**
 * The read model the Today page works in.
 *
 * `TodayTask` is an application-level DTO over the existing `Task` row — there
 * is no daily-plan table, no schedule entry and no copy of a task anywhere.
 * A day is a *query*, not a record: the task's own `dueDate` decides which day
 * it belongs to, and changing that date is the only thing that moves it.
 *
 * It is a structural superset of `TaskView` rather than a parallel type, which
 * is the point: the Today page hands these straight to the existing
 * `TaskList`, so task completion, the optimistic tick, the XP toast, the edit
 * dialog and the delete confirmation are the ones that already ship — not
 * second copies of them.
 *
 * It adds exactly two things the task list does not need: the owning project
 * carries its goal, so the page can say what a day is in service of without a
 * query per row, and each task carries `isOverdue`, which is a statement about
 * *now* rather than about the day being viewed.
 */
export interface TodayGoalRef {
  readonly id: string;
  readonly title: string;
}

export interface TodayProjectRef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly goal: TodayGoalRef | null;
}

export interface TodayMilestoneRef {
  readonly id: string;
  readonly title: string;
}

export interface TodayTask extends TaskView {
  /** Narrower than `TaskView["project"]`: it also carries the goal. */
  readonly project: TodayProjectRef | null;
  readonly milestone: TodayMilestoneRef | null;
  /**
   * Outstanding and past its deadline **as of the real current date** — never
   * relative to whichever day is being viewed. A task dated tomorrow is never
   * overdue, whatever day the page is showing.
   */
  readonly isOverdue: boolean;
}

/**
 * Which section of the page a task belongs to.
 *
 * `other` is a real answer, not a failure: a task completed on some other past
 * day is neither this day's work nor outstanding, and putting it anywhere
 * would be a lie about the day being viewed.
 */
export type TaskBucket = "unscheduled" | "day" | "overdue" | "upcoming" | "other";

/** The two dates every classification is made against. */
export interface DayContext {
  /** The user's real current date, in their timezone. Fixes "overdue". */
  readonly today: string;
  /** The day being viewed. Defaults to `today`; set from the URL. */
  readonly selectedDate: string;
}

/**
 * The distinct goals a day's work serves.
 *
 * Derived per render from the tasks already loaded — it is a fact about a set
 * of tasks, not a record of anything.
 */
export interface DayGoalFocus {
  readonly id: string;
  readonly title: string;
  readonly taskCount: number;
}

import type { Priority } from "@/generated/prisma/enums";
import type { CalendarAnchor, CalendarItemKind } from "@/config/calendar";
import type { LocalDate } from "@/lib/datetime";

/**
 * The normalised shape every calendar surface renders.
 *
 * `CalendarItem` is an *application-level DTO*, deliberately not a Prisma
 * model and not a database table. Nothing is ever written in this shape;
 * it exists only for the few milliseconds between reading the existing
 * tasks, milestones, projects and goals and handing them to a view.
 *
 * That distinction is the whole design of this phase. A `CalendarEvent` table
 * would mean a task's due date lived in two places, and the day one of them
 * was updated without the other, the calendar would start lying. Here, the
 * date columns on the real records remain the only source of truth, and the
 * calendar cannot drift from them because it holds nothing of its own.
 */
export interface CalendarItem {
  /**
   * Stable within a render, synthetic by construction: `kind:anchor:sourceId`.
   * A project with a start and a due date yields two items that differ only in
   * their anchor, so the source id alone would not be unique.
   */
  readonly id: string;
  readonly kind: CalendarItemKind;
  /** Which date column on the source record placed this item on this day. */
  readonly anchor: CalendarAnchor;
  /** The real record's id — what a link navigates to. */
  readonly sourceId: string;
  readonly title: string;
  readonly date: LocalDate;
  /** Wall-clock `"HH:mm"`. Only tasks carry one; everything else is all-day. */
  readonly time: string | null;
  /**
   * Whether the underlying record is done. Derived from the record's own
   * explicit state (`Task.completed`, `Milestone.status`, `Project.status`,
   * `Goal.status`) — never inferred from the date having passed.
   */
  readonly completed: boolean;
  readonly priority: Priority | null;
  /** Accent token from the owning project, when there is one. */
  readonly color: string | null;
  /** One line of provenance: the project or goal this sits under. */
  readonly context: string | null;
  /** Where clicking goes. Always the real record, never a calendar record. */
  readonly href: string;
}

/** An inclusive span of calendar days. Every query is bounded by one. */
export interface CalendarRange {
  readonly start: LocalDate;
  readonly end: LocalDate;
}

/** One cell of the month grid. */
export interface MonthCell {
  readonly date: LocalDate;
  /** False for the leading and trailing days borrowed from adjacent months. */
  readonly inMonth: boolean;
}

export interface MonthGrid {
  readonly anchor: LocalDate;
  readonly range: CalendarRange;
  /** Always six rows of seven, so the grid never changes height. */
  readonly weeks: readonly (readonly MonthCell[])[];
}

/** Items for one day, already sorted. Used by week, day and timeline. */
export interface CalendarDay {
  readonly date: LocalDate;
  readonly items: readonly CalendarItem[];
}

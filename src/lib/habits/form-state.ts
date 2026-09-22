import type { FieldErrors } from "@/lib/validation/result";

/**
 * Shared state shape for the habit forms and actions.
 *
 * Separate from `actions.ts` for the same reason the task, project, goal and
 * focus equivalents are: a `"use server"` module may only export async
 * functions, so the initial-state constant cannot sit beside the actions.
 */
export interface HabitFormState {
  readonly status: "idle" | "success" | "error";
  readonly errors?: FieldErrors;
  readonly message?: string;
  /** Set on a successful create so the caller can navigate to the new record. */
  readonly createdId?: string;
  /** Set by completion and undo so the UI can report the XP that moved. */
  readonly outcome?: {
    readonly changed: boolean;
    readonly xpDelta: number;
    readonly level: number;
    readonly leveledUp: boolean;
  };
}

export const IDLE_HABIT_FORM_STATE: HabitFormState = { status: "idle" };

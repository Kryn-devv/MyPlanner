import type { FieldErrors } from "@/lib/validation/result";

/**
 * Shared state shape for the goal forms.
 *
 * Separate from `actions.ts` for the same reason the task and project
 * equivalents are: a `"use server"` module may only export async functions, so
 * the initial-state constant below cannot sit beside the actions using it.
 */
export interface GoalFormState {
  readonly status: "idle" | "success" | "error";
  readonly errors?: FieldErrors;
  readonly message?: string;
  /** Set on a successful create so the caller can navigate to the new record. */
  readonly createdId?: string;
}

export const IDLE_GOAL_FORM_STATE: GoalFormState = { status: "idle" };

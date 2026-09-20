import type { FieldErrors } from "@/lib/validation/result";

/**
 * Shared state shape for project and milestone forms.
 *
 * Separate from `actions.ts` for the same reason the task equivalent is: a
 * `"use server"` module may only export async functions, so the initial-state
 * constant below cannot sit beside the actions that consume it.
 */
export interface ProjectFormState {
  readonly status: "idle" | "success" | "error";
  readonly errors?: FieldErrors;
  readonly message?: string;
  /** Set on a successful create so the caller can navigate to the new record. */
  readonly createdId?: string;
}

export const IDLE_PROJECT_FORM_STATE: ProjectFormState = { status: "idle" };

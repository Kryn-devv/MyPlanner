import type { FieldErrors } from "@/lib/validation/result";

/**
 * Shared state shape for the task forms.
 *
 * Deliberately a separate module from `actions.ts`: a `"use server"` file may
 * only export async functions, so the initial-state constant below cannot live
 * beside the actions that consume it.
 */
export interface TaskFormState {
  readonly status: "idle" | "success" | "error";
  readonly errors?: FieldErrors;
  readonly message?: string;
  /** Present after a completion toggle so the UI can celebrate XP and level-ups. */
  readonly outcome?: {
    readonly xpDelta: number;
    readonly level: number;
    readonly leveledUp: boolean;
  };
}

export const IDLE_TASK_FORM_STATE: TaskFormState = { status: "idle" };

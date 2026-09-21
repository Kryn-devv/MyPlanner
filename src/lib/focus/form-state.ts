import type { FocusSessionStatus } from "@/generated/prisma/enums";

/**
 * Serialisable results for the focus actions.
 *
 * In their own module because a `"use server"` file may export only async
 * functions — the same reason the task, project and goal form states live
 * apart from their actions.
 */

export interface FocusConflict {
  readonly sessionId: string;
  readonly taskTitle: string | null;
}

export type FocusActionState =
  | { readonly status: "idle" }
  | {
      readonly status: "success";
      readonly sessionId: string;
      readonly sessionStatus: FocusSessionStatus;
      readonly message?: string;
    }
  | {
      readonly status: "completed";
      readonly sessionId: string;
      readonly trackedSeconds: number;
      /** True when the session was too short to record and was discarded. */
      readonly discarded: boolean;
    }
  | {
      /** A live session already exists; the caller decides what to do. */
      readonly status: "conflict";
      readonly conflict: FocusConflict;
      readonly message: string;
    }
  | { readonly status: "error"; readonly message: string };

export const IDLE_FOCUS_STATE: FocusActionState = { status: "idle" };

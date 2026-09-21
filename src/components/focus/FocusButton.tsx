"use client";

import Link from "next/link";
import { Timer } from "lucide-react";
import { DEFAULT_TARGET_MINUTES } from "@/config/focus";
import { cn } from "@/lib/cn";
import { useFocus } from "./FocusProvider";

/**
 * "Focus on this task", wherever a task is listed.
 *
 * Three states, and the third is the point: when this task is already the one
 * in focus the button stops offering to start anything and becomes a way back
 * to the session. Starting a second session on the same task would be a
 * mis-click with a record attached.
 *
 * All it does is call the shared action — there is no focus logic here, and no
 * second copy of it in Today or on a project page.
 */
export function FocusButton({
  taskId,
  taskTitle,
  completed = false,
  targetMinutes = DEFAULT_TARGET_MINUTES,
  className,
}: {
  taskId: string;
  taskTitle: string;
  completed?: boolean;
  targetMinutes?: number | null;
  className?: string;
}) {
  const { activeTaskId, start, isPending } = useFocus();

  // Finished work does not need a timer pointed at it.
  if (completed) return null;

  const isCurrent = activeTaskId === taskId;

  const shared = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    className,
  );

  if (isCurrent) {
    return (
      <Link href="/app/focus" className={cn(shared, "border-accent/30 bg-accent/10 text-accent-strong")}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
        In focus
        <span className="sr-only"> — open focus mode</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      // Disabled while a request is in flight, so an impatient double click
      // cannot fire two starts. The database would refuse the second anyway.
      disabled={isPending}
      onClick={() => start({ taskId, taskTitle, targetMinutes })}
      aria-label={`Start a focus session on “${taskTitle}”`}
      className={cn(
        shared,
        "border-line bg-white/[0.02] text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-50",
      )}
    >
      <Timer className="h-2.5 w-2.5" aria-hidden="true" />
      Focus
    </button>
  );
}

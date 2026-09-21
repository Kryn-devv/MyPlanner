"use client";

import Link from "next/link";
import { CheckCircle2, Pause, Play, X } from "lucide-react";
import { useEffect } from "react";
import { STALE_SESSION_HOURS } from "@/config/focus";
import { formatTrackedTime } from "@/lib/focus/duration";
import type { ActiveFocusSession } from "@/lib/focus/queries";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { FocusTimer } from "./FocusTimer";
import { useFocus } from "./FocusProvider";

/**
 * Focus mode.
 *
 * The task, where it sits, the clock, and two buttons. Everything else is
 * secondary and looks it. A page whose job is to reduce what you are thinking
 * about should not itself be a dashboard.
 *
 * Shortcuts mirror the buttons — space to pause or resume, Enter to finish,
 * Escape to leave — and every one of them stands down while you are typing or
 * a dialog is open, exactly as the existing N/P/G shortcuts do.
 */
export function FocusSessionView({
  session,
  startedAgo,
}: {
  session: ActiveFocusSession;
  /** Hours since the session began, computed on the server for the notice. */
  startedAgo: number;
}) {
  const { pause, resume, complete, cancel, isPending } = useFocus();
  const running = session.status === "RUNNING";
  const task = session.task;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Held keys must not fire repeatedly: one press is one action, and
      // "complete" cannot be taken back.
      if (event.repeat) return;
      // Nothing while a request is in flight, so a shortcut cannot race the
      // button that is already doing the same thing.
      if (isPending) return;

      const target = event.target as HTMLElement | null;
      // Links are in this list for the same reason buttons are: Enter on a
      // focused link is that link's activation, and stealing it would both
      // navigate and end the session.
      const isInteractive =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target?.tagName ?? "");
      if (isInteractive) return;
      if (document.querySelector("dialog[open]")) return;

      if (event.key === " ") {
        event.preventDefault();
        running ? pause() : resume();
      } else if (event.key === "Enter") {
        event.preventDefault();
        complete();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [complete, isPending, pause, resume, running]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-16rem)] max-w-xl flex-col items-center justify-center gap-8 py-8 text-center">
      <div className="space-y-2">
        <p className="eyebrow text-ink-faint">{running ? "Focusing" : "Paused"}</p>

        <h1 className="text-balance text-xl font-medium leading-snug text-ink sm:text-2xl">
          {task ? task.title : <span className="italic text-ink-muted">Deleted task</span>}
        </h1>

        {task && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-faint">
            {task.project && (
              <Link
                href={`/app/projects/${task.project.id}`}
                className="transition-colors hover:text-ink"
              >
                {task.project.name}
              </Link>
            )}
            {task.milestone && (
              <>
                <span aria-hidden="true">·</span>
                <span>{task.milestone.title}</span>
              </>
            )}
            {task.goal && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href={`/app/goals/${task.goal.id}`}
                  className="transition-colors hover:text-ink"
                >
                  {task.goal.title}
                </Link>
              </>
            )}
          </p>
        )}

        {!task && (
          <p className="text-[0.8125rem] text-ink-faint">
            The task this session was started on has since been deleted. The time is still yours.
          </p>
        )}
      </div>

      {startedAgo >= STALE_SESSION_HOURS && (
        // Nothing is discarded automatically — a long session may be exactly
        // right. This only makes sure it is not a surprise.
        <p className="rounded-[var(--radius-card)] border border-caution/25 bg-caution/5 px-3 py-2 text-[0.8125rem] text-caution">
          This session started {formatTrackedTime(Math.round(startedAgo * 3600))} ago. Finish it if
          that is right, or discard it if you forgot it was running.
        </p>
      )}

      <FocusTimer
        timing={{
          status: session.status,
          accumulatedSeconds: session.accumulatedSeconds,
          segmentStartedAt: session.segmentStartedAt,
        }}
        targetMinutes={session.targetMinutes}
        initialElapsed={session.elapsedSeconds}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={running ? pause : resume}
          disabled={isPending}
        >
          {running ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {running ? "Pause" : "Resume"}
        </Button>

        <Button variant="primary" size="md" onClick={complete} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Complete session
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[0.8125rem]">
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-ink-faint transition-colors",
            "hover:text-critical disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Discard session
        </button>

        <Link href="/app/today" className="text-ink-muted transition-colors hover:text-ink">
          Back to Today
        </Link>
      </div>

      <p className="text-[0.75rem] text-ink-faint">
        Finishing a session does not complete the task — that is still yours to tick off.
      </p>
    </div>
  );
}

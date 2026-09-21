"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { formatTimer } from "@/lib/focus/duration";
import { cn } from "@/lib/cn";
import { FocusTimer } from "./FocusTimer";
import { useFocus } from "./FocusProvider";

/**
 * The live session, visible from anywhere.
 *
 * A single row rather than an overlay: a focus session is context, not a modal
 * state, and covering the app you are working in would be a strange way to
 * help someone concentrate. It hides itself on the focus page, where the same
 * information is already the whole screen.
 */
export function FocusBar() {
  const { active, isPending, pause, resume } = useFocus();
  const pathname = usePathname();

  if (!active) return null;
  if (pathname === "/app/focus") return null;

  const running = active.status === "RUNNING";
  const title = active.task?.title ?? "Deleted task";

  return (
    <div
      className="border-b border-line bg-panel/80 backdrop-blur"
      // A landmark, so it can be jumped to rather than hunted for.
      role="region"
      aria-label="Active focus session"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            running ? "bg-accent" : "bg-ink-faint",
          )}
        />

        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-muted">
          <span className="text-ink-faint">{running ? "Focusing" : "Paused"} · </span>
          <span className={cn("text-ink", !active.task && "italic text-ink-faint")}>{title}</span>
        </span>

        <span className="shrink-0 text-[0.875rem] font-medium">
          <FocusTimer
            timing={{
              status: active.status,
              accumulatedSeconds: active.accumulatedSeconds,
              segmentStartedAt: active.segmentStartedAt,
            }}
            targetMinutes={active.targetMinutes}
            size="compact"
          />
          {active.targetMinutes !== null && (
            <span className="tnum hidden text-ink-faint sm:inline">
              {" "}
              / {formatTimer(active.targetMinutes * 60)}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={running ? pause : resume}
          disabled={isPending}
          aria-label={running ? "Pause focus session" : "Resume focus session"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {running ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        <Link
          href="/app/focus"
          className="shrink-0 rounded-[var(--radius-control)] border border-line px-2.5 py-1 text-[0.75rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Open
          <span className="sr-only"> focus mode</span>
        </Link>
      </div>
    </div>
  );
}

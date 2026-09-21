"use client";

import Link from "next/link";
import { Timer } from "lucide-react";
import { useState } from "react";
import { DEFAULT_TARGET_MINUTES, FOCUS_PRESETS } from "@/config/focus";
import { cn } from "@/lib/cn";
import { useFocus } from "./FocusProvider";

export interface FocusCandidate {
  readonly id: string;
  readonly title: string;
  readonly projectName: string | null;
}

/**
 * What the focus page offers when nothing is running.
 *
 * It does not pretend a timer exists. It picks up today's open work — the
 * tasks you were most likely about to start — lets you choose a length, and
 * otherwise points at the pages that decide what to work on. Choosing the
 * work is Today's job, not this page's.
 */
export function FocusStarter({ candidates }: { candidates: readonly FocusCandidate[] }) {
  const { start, isPending } = useFocus();
  const [minutes, setMinutes] = useState<number | null>(DEFAULT_TARGET_MINUTES);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-6 text-center">
      <div className="space-y-2">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/[0.02]">
          <Timer className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-medium text-ink">No active focus session</h1>
        <p className="text-[0.875rem] leading-relaxed text-ink-muted">
          Start one on a task and its tracked time is recorded against it.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2 w-full text-ink-faint">Session length</legend>
        <div
          role="radiogroup"
          aria-label="Session length"
          className="inline-flex flex-wrap justify-center gap-1 rounded-[var(--radius-control)] border border-line bg-base p-0.5"
        >
          {FOCUS_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              role="radio"
              aria-checked={minutes === preset.minutes}
              onClick={() => setMinutes(preset.minutes)}
              className={cn(
                "rounded-[6px] px-3 py-1 text-[0.8125rem] font-medium transition-colors",
                minutes === preset.minutes
                  ? "bg-white/[0.08] text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={minutes === null}
            onClick={() => setMinutes(null)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-[0.8125rem] font-medium transition-colors",
              minutes === null ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            No target
          </button>
        </div>
      </fieldset>

      {candidates.length > 0 ? (
        <section aria-labelledby="focus-candidates" className="space-y-3 text-left">
          <h2 id="focus-candidates" className="eyebrow">
            Open today
          </h2>
          <ul className="space-y-1.5">
            {candidates.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => start({ taskId: task.id, taskTitle: task.title, targetMinutes: minutes })}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-panel px-3 py-2.5 text-left",
                    "transition-colors hover:border-line-strong hover:bg-white/[0.03] disabled:opacity-50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] text-ink">{task.title}</span>
                    {task.projectName && (
                      <span className="block truncate text-[0.75rem] text-ink-faint">
                        {task.projectName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[0.75rem] text-ink-muted">Focus</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-[0.875rem] text-ink-muted">
          Nothing is scheduled for today. Pick something to work on and start from there.
        </p>
      )}

      <nav aria-label="Where to choose work" className="flex flex-wrap items-center justify-center gap-2">
        {[
          { href: "/app/today", label: "Today" },
          { href: "/app/tasks", label: "Tasks" },
          { href: "/app/calendar", label: "Calendar" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href as "/app/today"}
            className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-line bg-base px-3 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

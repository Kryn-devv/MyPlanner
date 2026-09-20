"use client";

import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { formatRelativeDay, type LocalDate } from "@/lib/datetime";
import { suggestsGoalCompletion } from "@/lib/goals/progress";
import type { GoalSummaryView } from "@/lib/goals/queries";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { GoalStatusBadge, GoalTargetBadge } from "./GoalBadges";
import { useGoalDialogs } from "./GoalDialogProvider";

/**
 * The goal detail header.
 *
 * When all connected work is done it offers to mark the goal achieved, but
 * never does so itself: "every task is ticked" and "I have reached what I was
 * aiming at" are different claims, and only the person who set the goal can
 * make the second one.
 */
export function GoalHeader({ goal, today }: { goal: GoalSummaryView; today: LocalDate }) {
  const { openEditGoal, confirmDeleteGoal, setStatus, busy } = useGoalDialogs();
  const canSuggestCompletion = suggestsGoalCompletion(goal.progress, goal.status);

  return (
    <header className="space-y-4">
      <Link
        href="/app/goals"
        className="inline-flex items-center gap-1.5 rounded text-[0.75rem] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        All goals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-accent/20 bg-accent/10"
          >
            <Target className="h-4.5 w-4.5 text-accent-strong" />
          </span>

          <div className="min-w-0">
            <p className="eyebrow mb-1">Goal</p>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {goal.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <GoalStatusBadge status={goal.status} />
              <PriorityBadge priority={goal.priority} />
              <GoalTargetBadge timing={goal.timing} />

              {goal.targetDate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
                  <span className="sr-only">Target date </span>
                  Target {formatRelativeDay(goal.targetDate, today)}
                </span>
              )}
            </div>

            {goal.description && (
              <p className="mt-3 max-w-2xl text-[0.875rem] leading-relaxed text-ink-muted">
                {goal.description}
              </p>
            )}
          </div>
        </div>

        {/* Full width on mobile so the action row wraps onto its own line
            rather than pushing past the viewport. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <Button variant="ghost" size="sm" onClick={() => openEditGoal(goal)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>

          {goal.status === "COMPLETED" ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStatus(goal, "ACTIVE")}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reopen
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setStatus(goal, "COMPLETED")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Achieved
            </Button>
          )}

          {goal.status === "ARCHIVED" ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Restore goal"
              disabled={busy}
              onClick={() => setStatus(goal, "ACTIVE")}
            >
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Archive goal"
              disabled={busy}
              onClick={() => setStatus(goal, "ARCHIVED")}
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete goal"
            onClick={() => confirmDeleteGoal(goal)}
          >
            <Trash2 className="h-4 w-4 text-critical/80" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {canSuggestCompletion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-positive/25 bg-positive/[0.07] px-3.5 py-2.5">
          <p className="inline-flex items-center gap-2 text-[0.8125rem] text-positive">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            All connected work is complete — {goal.progress.total} tasks across{" "}
            {goal.progress.projectCount}{" "}
            {goal.progress.projectCount === 1 ? "project" : "projects"}.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setStatus(goal, "COMPLETED")}
          >
            Mark achieved
          </Button>
        </div>
      )}

      {goal.status === "ARCHIVED" && (
        <p className="rounded-[var(--radius-control)] border border-line bg-white/[0.02] px-3.5 py-2.5 text-[0.8125rem] text-ink-muted">
          This goal is archived. Its projects are untouched and still live in your projects list —
          archiving a goal never changes the work underneath it.
        </p>
      )}
    </header>
  );
}

import Link from "next/link";
import { Target } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GoalSummaryView } from "@/lib/goals/queries";
import { EmptyState } from "@/components/ui/States";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DashboardPanel } from "./DashboardPanel";

/**
 * A short list of live goals on the dashboard.
 *
 * Deliberately compact and capped at a few rows, and placed below projects:
 * the dashboard is about today, and a goal is the least immediate thing on it.
 * Anyone who wants the strategic view follows the link.
 */
export function ActiveGoalsPanel({
  goals,
  totalActive,
}: {
  goals: readonly GoalSummaryView[];
  totalActive: number;
}) {
  return (
    <DashboardPanel
      title="Goals"
      count={totalActive > 0 ? totalActive : undefined}
      href="/app/goals"
      linkLabel="View all"
    >
      {goals.length === 0 ? (
        <EmptyState
          dense
          icon={<Target />}
          title="No active goals"
          description="Name what your projects are for."
        />
      ) : (
        <ul className="divide-y divide-line">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link
                href={`/app/goals/${goal.id}`}
                className="group flex items-start gap-2.5 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border border-accent/20 bg-accent/10"
                >
                  <Target className="h-2.5 w-2.5 text-accent-strong" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{goal.title}</p>
                    <span className="tnum shrink-0 text-[0.6875rem] text-ink-faint">
                      {goal.progress.state === "in-progress" || goal.progress.state === "complete"
                        ? `${goal.progress.percent}%`
                        : "—"}
                    </span>
                  </div>

                  <div className="mt-1.5">
                    {goal.progress.state === "in-progress" || goal.progress.state === "complete" ? (
                      <ProgressBar
                        value={goal.progress.percent}
                        label={`${goal.title} progress`}
                        valueText={`${goal.progress.completed} of ${goal.progress.total} tasks complete`}
                        tone={goal.progress.state === "complete" ? "positive" : "xp"}
                        size="sm"
                        animate={false}
                      />
                    ) : (
                      <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-white/[0.04]" />
                    )}
                  </div>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-ink-faint">
                    <span className="tnum">
                      {goal.progress.state === "no-projects"
                        ? "No projects connected"
                        : goal.progress.state === "no-tasks"
                          ? "No task activity yet"
                          : `${goal.progress.completed}/${goal.progress.total} tasks`}
                    </span>
                    {goal.timing.state !== "none" && (
                      <span
                        className={cn(
                          goal.timing.state === "overdue" && "text-critical",
                          (goal.timing.state === "due-today" || goal.timing.state === "due-soon") &&
                            "text-caution",
                        )}
                      >
                        {goal.timing.label}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

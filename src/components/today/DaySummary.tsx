import Link from "next/link";
import { Flame } from "lucide-react";
import { formatDuration } from "@/lib/datetime";
import { formatTrackedTime } from "@/lib/focus/duration";
import type { DayProgress, DayRelation, Workload } from "@/lib/today/logic";
import type { DayGoalFocus } from "@/lib/today/types";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";

/**
 * The day at a glance: how much is done, how much work it represents, and
 * what it is in service of.
 *
 * Deliberately restrained. XP and streak are shown because they are already
 * true and cost nothing to state, but they sit as one line of supporting text
 * rather than as the headline — the question this page answers is "what do I
 * need to do", not "how am I scoring".
 */
export function DaySummary({
  progress,
  workload,
  xpEarned,
  streak,
  focus,
  relation,
  overdueCount,
  trackedFocusSeconds,
}: {
  progress: DayProgress;
  workload: Workload;
  xpEarned: number;
  streak: { current: number; atRisk: boolean };
  focus: readonly DayGoalFocus[];
  relation: DayRelation;
  overdueCount: number;
  trackedFocusSeconds: number;
}) {
  const label = progress.isEmpty
    ? "Nothing scheduled"
    : `${progress.completed} of ${progress.total} ${progress.total === 1 ? "task" : "tasks"} completed`;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="day-summary-heading">
      <h2 id="day-summary-heading" className="sr-only">
        Summary for this day
      </h2>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.9375rem] font-medium text-ink">
          <span className="tnum">{label}</span>
        </p>
        {!progress.isEmpty && (
          <p className="tnum text-[0.8125rem] text-ink-muted">{progress.percent}%</p>
        )}
      </div>

      <ProgressBar
        value={progress.percent}
        tone={progress.isComplete ? "positive" : "xp"}
        label="Tasks completed on this day"
        valueText={
          progress.isEmpty
            ? "No tasks scheduled for this day"
            : `${progress.completed} of ${progress.total} completed`
        }
        className="mt-3"
      />

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem]">
        {!workload.isEmpty && (
          <div className="flex items-baseline gap-1.5">
            {/* "Estimated" is not decoration: the app has no time tracking, and
                this figure must never read as time actually spent. */}
            <dt className="text-ink-faint">Estimated</dt>
            <dd className="tnum text-ink">{formatDuration(workload.planned)}</dd>
            {workload.remaining > 0 && workload.completed > 0 && (
              <dd className="tnum text-ink-faint">
                · {formatDuration(workload.remaining)} left
              </dd>
            )}
          </div>
        )}

        {workload.unestimated > 0 && !progress.isEmpty && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Tasks with no estimate</dt>
            <dd className="text-ink-faint">
              <span className="tnum">{workload.unestimated}</span> unestimated
            </dd>
          </div>
        )}

        {trackedFocusSeconds > 0 && (
          <div className="flex items-baseline gap-1.5">
            {/* "Tracked focus" rather than "actual": this counts the time put
                through a focus session, which is not the same claim as how
                long the day's work really took. */}
            <dt className="text-ink-faint">Tracked focus</dt>
            <dd className="tnum text-ink">{formatTrackedTime(trackedFocusSeconds)}</dd>
          </div>
        )}

        {xpEarned !== 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-faint">XP</dt>
            <dd className="tnum text-accent-strong">
              {xpEarned > 0 ? "+" : ""}
              {xpEarned}
            </dd>
          </div>
        )}

        {/* Only on the real today: a streak is a statement about now, and
            repeating it while reviewing last Tuesday would be noise. */}
        {relation === "today" && streak.current > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Current streak</dt>
            <dd
              className={cn(
                "inline-flex items-baseline gap-1",
                streak.atRisk ? "text-streak" : "text-ink-muted",
              )}
            >
              <Flame className="h-3 w-3 self-center" aria-hidden="true" />
              <span className="tnum">{streak.current}</span>
              <span>day{streak.current === 1 ? "" : "s"}</span>
              {streak.atRisk && <span className="text-[0.75rem]">· finish one to keep it</span>}
            </dd>
          </div>
        )}

        {overdueCount > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Outstanding from earlier days</dt>
            <dd className="text-ink-faint">
              <span className="tnum">{overdueCount}</span> outstanding from earlier
            </dd>
          </div>
        )}
      </dl>

      {focus.length > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line pt-3">
          <span className="text-[0.75rem] text-ink-faint">Working towards</span>
          {focus.map((goal) => (
            <Link
              key={goal.id}
              href={`/app/goals/${goal.id}`}
              className="inline-flex items-baseline gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.75rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {goal.title}
              <span className="tnum text-[0.6875rem] text-ink-faint">{goal.taskCount}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

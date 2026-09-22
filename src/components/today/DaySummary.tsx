import Link from "next/link";
import { Flame, Zap } from "lucide-react";
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
 * The question this page answers is still "what do I need to do" rather than
 * "how am I scoring", so the task count keeps the headline. But the day's
 * completion is now a ring rather than a line of text: a ring that is visibly
 * short of closing is the one piece of pressure this page is allowed to
 * apply, and it is honest pressure — it closes when the day's work is done
 * and not a moment sooner.
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

      <div className="flex items-center gap-4 sm:gap-5">
        <DayRing progress={progress} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[0.9375rem] font-medium text-ink">
              <span className="tnum">{label}</span>
            </p>
            {xpEarned > 0 && (
              <p className="tnum inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-gold-strong">
                <Zap className="h-3 w-3" aria-hidden="true" />+{xpEarned} XP
                <span className="font-normal text-ink-faint">today</span>
              </p>
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
            className="mt-2.5"
          />

          {progress.isComplete && !progress.isEmpty && (
            <p className="mt-2 text-[0.8125rem] font-medium text-positive">
              Day cleared. Everything scheduled is done.
            </p>
          )}
        </div>
      </div>

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

        {/* A negative day — more reopened than finished — is still worth
            stating, but a positive one is already led with above in gold and
            does not need saying twice. */}
        {xpEarned < 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-faint">XP</dt>
            <dd className="tnum text-ink-muted">{xpEarned}</dd>
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

/**
 * The day as a ring.
 *
 * Server-rendered SVG with no client JavaScript: this page is otherwise a
 * server component, and a decorative dial is not worth a hydration boundary.
 * The figure it carries is already announced by the bar beside it, so the
 * ring itself is hidden from assistive technology rather than repeating it.
 */
function DayRing({ progress }: { progress: DayProgress }) {
  const size = 62;
  const thickness = 6;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = progress.isEmpty ? 0 : Math.min(100, Math.max(0, progress.percent));
  const offset = circumference * (1 - value / 100);

  return (
    <div aria-hidden="true" className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="day-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop
              offset="0%"
              stopColor={progress.isComplete ? "var(--color-positive)" : "var(--color-xp-from)"}
            />
            <stop
              offset="100%"
              stopColor={progress.isComplete ? "var(--color-xp-to)" : "var(--color-xp-to)"}
            />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-white/[0.06]"
        />

        {value > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#day-ring)"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-quint)]"
          />
        )}
      </svg>

      <span className="absolute inset-0 grid place-items-center">
        <span className="tnum text-[0.8125rem] font-semibold text-ink">
          {progress.isEmpty ? "—" : `${progress.percent}%`}
        </span>
      </span>
    </div>
  );
}

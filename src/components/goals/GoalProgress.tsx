import { cn } from "@/lib/cn";
import type { GoalProgress as GoalProgressValue } from "@/lib/goals/progress";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * A goal's progress rail.
 *
 * Built on the same primitive as project progress, deliberately — a goal is
 * strategically more important, not visually louder. The one difference is
 * that it distinguishes *why* a bar is empty: "no projects connected" and "no
 * task activity yet" look identical as a number and mean different things, and
 * rendering either as 0% reads as failure rather than as emptiness.
 */
export function GoalProgress({
  progress,
  label,
  size = "sm",
  showCounts = true,
  className,
}: {
  progress: GoalProgressValue;
  label: string;
  size?: "sm" | "md";
  showCounts?: boolean;
  className?: string;
}) {
  if (progress.state === "no-projects" || progress.state === "no-tasks") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div
          aria-hidden="true"
          className={cn("w-full rounded-full bg-white/[0.04]", size === "sm" ? "h-1.5" : "h-2")}
        />
        <p className="text-[0.75rem] text-ink-faint">
          {progress.state === "no-projects" ? "No projects connected." : "No task activity yet."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <ProgressBar
        value={progress.percent}
        label={label}
        valueText={`${progress.completed} of ${progress.total} tasks complete, ${progress.percent} percent`}
        tone={progress.state === "complete" ? "positive" : "xp"}
        size={size}
      />
      {showCounts && (
        <p className="flex items-baseline justify-between gap-2 text-[0.75rem] text-ink-faint">
          <span className="tnum">
            {progress.completed} / {progress.total} tasks
          </span>
          <span
            className={cn(
              "tnum font-medium",
              progress.state === "complete" ? "text-positive" : "text-ink-muted",
            )}
          >
            {progress.percent}%
          </span>
        </p>
      )}
    </div>
  );
}

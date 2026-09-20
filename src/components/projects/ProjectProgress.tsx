import { cn } from "@/lib/cn";
import type { Progress } from "@/lib/projects/progress";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * A progress rail with its counts.
 *
 * An empty set is rendered as "No tasks yet" rather than "0%": the two look
 * identical as a number and mean completely different things, and showing 0%
 * for a project nobody has added work to reads as failure.
 */
export function ProjectProgress({
  progress,
  label,
  tone = "xp",
  size = "sm",
  showCounts = true,
  className,
}: {
  progress: Progress;
  label: string;
  tone?: "xp" | "positive" | "plain";
  size?: "sm" | "md";
  showCounts?: boolean;
  className?: string;
}) {
  if (progress.isEmpty) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div
          aria-hidden="true"
          className={cn("w-full rounded-full bg-white/[0.04]", size === "sm" ? "h-1.5" : "h-2")}
        />
        <p className="text-[0.75rem] text-ink-faint">No tasks yet</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <ProgressBar
        value={progress.percent}
        label={label}
        valueText={`${progress.completed} of ${progress.total} tasks complete, ${progress.percent} percent`}
        tone={progress.isComplete ? "positive" : tone}
        size={size}
      />
      {showCounts && (
        <p className="flex items-baseline justify-between gap-2 text-[0.75rem] text-ink-faint">
          <span className="tnum">
            {progress.completed} / {progress.total} tasks
          </span>
          <span className={cn("tnum font-medium", progress.isComplete ? "text-positive" : "text-ink-muted")}>
            {progress.percent}%
          </span>
        </p>
      )}
    </div>
  );
}

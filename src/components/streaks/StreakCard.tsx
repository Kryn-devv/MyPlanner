import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The streak display.
 *
 * `atRisk` is the one piece of urgency the dashboard is allowed to express —
 * it is actionable (finish something today) rather than merely decorative.
 */
export interface StreakCardProps {
  current: number;
  longest: number;
  atRisk: boolean;
  className?: string;
}

export function StreakCard({ current, longest, atRisk, className }: StreakCardProps) {
  const isActive = current > 0;

  return (
    <div className={cn("panel flex flex-col justify-between p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">Streak</p>
        <Flame
          aria-hidden="true"
          className={cn("h-4 w-4 transition-colors", isActive ? "text-streak" : "text-ink-faint")}
        />
      </div>

      <div className="mt-4">
        <p className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "tnum text-[2rem] font-semibold leading-none tracking-tight",
              isActive ? "text-ink" : "text-ink-faint",
            )}
          >
            {current}
          </span>
          <span className="text-sm text-ink-muted">{current === 1 ? "day" : "days"}</span>
        </p>

        <p className="mt-2 text-[0.75rem] text-ink-faint">
          {isActive ? `Best: ${longest} ${longest === 1 ? "day" : "days"}` : "Finish a task to start one"}
        </p>
      </div>

      {atRisk && (
        <p className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-control)] border border-caution/25 bg-caution/10 px-2.5 py-1.5 text-[0.75rem] text-caution">
          <span aria-hidden="true">⚠</span>
          Finish one task today to keep it
        </p>
      )}
    </div>
  );
}

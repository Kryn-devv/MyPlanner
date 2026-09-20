import { Target } from "lucide-react";
import type { DailyProgress } from "@/lib/tasks/queries";
import { formatXp } from "@/lib/xp";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "./StatCard";

/**
 * Today's completion rate.
 *
 * "Today" counts anything due today plus anything finished today, so ad-hoc
 * work is not invisible to the number that is supposed to represent the day.
 */
export function DailyProgressCard({ daily, className }: { daily: DailyProgress; className?: string }) {
  const hasWork = daily.total > 0;

  return (
    <StatCard
      label="Today"
      value={
        hasWork ? (
          `${daily.percent}%`
        ) : (
          // A bare em dash at 2rem reads as a stray rule, so it is dimmed and
          // sized down to look deliberate.
          <span className="text-[1.25rem] text-ink-faint">Nothing due</span>
        )
      }
      icon={Target}
      detail={
        hasWork ? (
          <>
            <span className="tnum">
              {daily.completed} of {daily.total}
            </span>{" "}
            tasks complete
            {daily.xpEarnedToday > 0 && (
              <>
                {" · "}
                <span className="tnum text-accent-strong">{formatXp(daily.xpEarnedToday)} XP</span> earned
              </>
            )}
          </>
        ) : (
          "Nothing scheduled for today"
        )
      }
      className={className}
    >
      <ProgressBar
        value={daily.percent}
        label="Today's completion"
        valueText={
          hasWork
            ? `${daily.completed} of ${daily.total} tasks complete, ${daily.percent} percent`
            : "No tasks scheduled today"
        }
        tone={daily.percent === 100 ? "positive" : "xp"}
        size="sm"
      />
    </StatCard>
  );
}

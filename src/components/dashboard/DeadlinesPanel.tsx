import { CalendarClock, Flag } from "lucide-react";
import { getPriorityConfig } from "@/config/priorities";
import { cn } from "@/lib/cn";
import { daysBetween, formatRelativeDay, formatTime, type LocalDate } from "@/lib/datetime";
import type { TaskView } from "@/lib/tasks/queries";
import { EmptyState } from "@/components/ui/States";
import { DashboardPanel } from "./DashboardPanel";

/**
 * Upcoming high-stakes work.
 *
 * A deliberately quieter presentation than the task list: these are for
 * awareness, not for ticking off, so they are not interactive.
 */
export function DeadlinesPanel({ deadlines, today }: { deadlines: readonly TaskView[]; today: LocalDate }) {
  return (
    <DashboardPanel title="Deadlines">
      {deadlines.length === 0 ? (
        <EmptyState
          dense
          icon={<Flag />}
          title="No deadlines ahead"
          description="High and urgent tasks with a date land here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {deadlines.map((task) => {
            const daysAway = task.dueDate ? daysBetween(task.dueDate, today) : null;
            const imminent = daysAway !== null && daysAway <= 1;
            const config = getPriorityConfig(task.priority);

            return (
              <li key={task.id} className="flex items-start gap-3 px-1 py-2.5 first:pt-1 last:pb-1">
                <span
                  aria-hidden="true"
                  className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", config.railClass)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] leading-snug text-ink">{task.title}</p>
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-[0.75rem]",
                      imminent ? "text-caution" : "text-ink-faint",
                    )}
                  >
                    <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
                    {task.dueDate && formatRelativeDay(task.dueDate, today)}
                    {task.dueTime && <span className="tnum">· {formatTime(task.dueTime)}</span>}
                  </p>
                </div>
                <span className={cn("shrink-0 text-[0.6875rem] font-medium", config.textClass)}>
                  {config.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}

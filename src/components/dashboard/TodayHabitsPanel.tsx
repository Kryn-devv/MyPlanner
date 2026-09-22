import { Repeat } from "lucide-react";
import type { HabitDayView } from "@/lib/habits/queries";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { EmptyState } from "@/components/ui/States";
import { HabitDayList } from "@/components/habits/HabitRow";

/**
 * Today's habits on the dashboard.
 *
 * The one thing worth surfacing here is the decision: which habits are still
 * open today. It ticks them in place — the same control, provider and action
 * the habits page uses — rather than sending the user somewhere else to do it.
 */
export function TodayHabitsPanel({
  habits,
  today,
}: {
  habits: readonly HabitDayView[];
  today: string;
}) {
  // Settled for the day, which for a times-per-week habit includes a week
  // whose target is already met.
  const kept = habits.filter((habit) => habit.satisfied).length;

  return (
    <DashboardPanel
      title="Today's habits"
      count={habits.length > 0 ? `${kept}/${habits.length}` : undefined}
      href="/app/habits"
      linkLabel="All habits"
    >
      {habits.length === 0 ? (
        <EmptyState
          dense
          icon={<Repeat />}
          title="Nothing due today"
          description="Habits you keep on a schedule show up here on the days they are due."
        />
      ) : (
        <HabitDayList habits={habits} today={today} compact />
      )}
    </DashboardPanel>
  );
}

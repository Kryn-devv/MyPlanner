import type { Metadata } from "next";
import { AlertTriangle, CalendarRange, CheckCircle2, ListTodo, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { getGreeting, getLocalToday } from "@/lib/datetime";
import { getActiveGoalsForDashboard, getGoalStatusCounts } from "@/lib/goals/queries";
import { getHabitsForDay } from "@/lib/habits/queries";
import { getActiveProjectsForDashboard, getProjectStatusCounts } from "@/lib/projects/queries";
import { getDashboardData } from "@/lib/tasks/queries";
import { ActiveGoalsPanel } from "@/components/dashboard/ActiveGoalsPanel";
import { ActiveProjectsPanel } from "@/components/dashboard/ActiveProjectsPanel";
import { DailyProgressCard } from "@/components/dashboard/DailyProgressCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DeadlinesPanel } from "@/components/dashboard/DeadlinesPanel";
import { QuickAddPrompt } from "@/components/dashboard/QuickAddPrompt";
import { StatCard } from "@/components/dashboard/StatCard";
import { TodayHabitsPanel } from "@/components/dashboard/TodayHabitsPanel";
import { StreakCard } from "@/components/streaks/StreakCard";
import { TaskList } from "@/components/tasks/TaskList";
import { XpProgress } from "@/components/xp/XpProgress";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The dashboard.
 *
 * A server component: all of the data is fetched in one parallel batch and
 * rendered on the server, so the only JavaScript the browser downloads for
 * this page is what the interactive pieces genuinely need — the task rows,
 * the quick-add menu and the dialogs.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  // Fetched alongside the dashboard's own batch rather than after it: projects
  // are an extra panel, not an extra waterfall.
  const today = getLocalToday(user.timezone);

  const [data, activeProjects, projectCounts, activeGoals, goalCounts, habits] =
    await Promise.all([
      getDashboardData(user.id, user.timezone),
      getActiveProjectsForDashboard(user.id, user.timezone, 3),
      getProjectStatusCounts(user.id),
      getActiveGoalsForDashboard(user.id, user.timezone, 3),
      getGoalStatusCounts(user.id),
      getHabitsForDay(user.id, today, today),
    ]);

  const greeting = getGreeting(user.timezone);
  const hasAnyTask = data.totalOpenTasks > 0 || data.todayTasks.length > 0;

  return (
    <div className="space-y-8">
      <DashboardHeader greeting={greeting} name={user.name} today={data.today} />

      {/* -- headline figures ------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5 sm:col-span-2">
          <XpProgress progress={data.progress} />
        </div>

        <StreakCard
          current={data.streak.current}
          longest={data.streak.longest}
          atRisk={data.streak.atRisk}
        />

        <DailyProgressCard daily={data.daily} />
      </div>

      {/* -- today, upcoming, deadlines ---------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {data.overdueTasks.length > 0 && (
            <DashboardPanel
              title="Overdue"
              count={data.overdueTasks.length}
              // Today is where overdue work is actually worked through, so
              // the dashboard hands off to it rather than growing its own
              // version of the same section.
              href="/app/today"
              linkLabel="Open Today"
            >
              <TaskList tasks={data.overdueTasks} readOnly />
            </DashboardPanel>
          )}

          <DashboardPanel
            title="Today"
            count={
              data.daily.total > 0 ? `${data.daily.completed}/${data.daily.total}` : undefined
            }
            href="/app/today"
            linkLabel="Open Today"
          >
            <TaskList
              tasks={data.todayTasks}
              // This panel also lists work finished today that was scheduled
              // for another day, so only the tasks genuinely due today drop
              // their date.
              groupedByDate={data.today}
              emptyIcon={hasAnyTask ? <CheckCircle2 /> : <ListTodo />}
              emptyTitle={hasAnyTask ? "Nothing due today" : "No tasks yet"}
              emptyDescription={
                hasAnyTask
                  ? "You have open work scheduled for other days."
                  : "Add your first task to start earning XP."
              }
              emptyAction={<QuickAddPrompt label="Add a task for today" dueDate={data.today} />}
              dense
            />
          </DashboardPanel>
        </div>

        <div className="space-y-4">
          <DashboardPanel title="Upcoming" count={data.upcomingTasks.length || undefined}>
            <TaskList
              tasks={data.upcomingTasks.slice(0, 6)}
              readOnly
              emptyIcon={<CalendarRange />}
              emptyTitle="Nothing scheduled"
              emptyDescription="Tasks due in the next week appear here."
              dense
            />
          </DashboardPanel>

          <ActiveProjectsPanel
            projects={activeProjects}
            today={data.today}
            totalActive={projectCounts.ACTIVE}
          />

          <TodayHabitsPanel habits={habits} today={data.today} />

          <DeadlinesPanel deadlines={data.deadlines} today={data.today} />

          <ActiveGoalsPanel goals={activeGoals} totalActive={goalCounts.ACTIVE} />

          <StatCard
            label="Open work"
            value={data.totalOpenTasks}
            unit={data.totalOpenTasks === 1 ? "task" : "tasks"}
            icon={data.overdueTasks.length > 0 ? AlertTriangle : Sparkles}
            iconClassName={data.overdueTasks.length > 0 ? "text-caution" : undefined}
            detail={
              data.overdueTasks.length > 0 ? (
                <span className="text-caution">
                  <span className="tnum">{data.overdueTasks.length}</span> overdue
                </span>
              ) : (
                "Nothing overdue — you're on top of it"
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

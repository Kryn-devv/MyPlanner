import type { Metadata } from "next";
import { AlertTriangle, CalendarRange, CheckCircle2, ListTodo, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { getGreeting } from "@/lib/datetime";
import { getDashboardData } from "@/lib/tasks/queries";
import { DailyProgressCard } from "@/components/dashboard/DailyProgressCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DeadlinesPanel } from "@/components/dashboard/DeadlinesPanel";
import { QuickAddPrompt } from "@/components/dashboard/QuickAddPrompt";
import { StatCard } from "@/components/dashboard/StatCard";
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
  const data = await getDashboardData(user.id, user.timezone);

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
              href="/app/tasks"
              linkLabel="Manage"
            >
              <TaskList tasks={data.overdueTasks} readOnly />
            </DashboardPanel>
          )}

          <DashboardPanel
            title="Today"
            count={
              data.daily.total > 0 ? `${data.daily.completed}/${data.daily.total}` : undefined
            }
            href="/app/tasks"
          >
            <TaskList
              tasks={data.todayTasks}
              hideDueDate
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

          <DeadlinesPanel deadlines={data.deadlines} today={data.today} />

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

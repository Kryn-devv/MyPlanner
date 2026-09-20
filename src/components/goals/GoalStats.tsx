import { CheckCircle2, CircleDashed, FolderKanban, ListChecks } from "lucide-react";
import type { GoalDetail } from "@/lib/goals/queries";
import { GoalProgress } from "./GoalProgress";

/**
 * The goal's numbers at a glance.
 *
 * Slightly more prominent than the project equivalent — a goal is strategic,
 * and this is the answer to "how far along am I?" — but built from the same
 * primitives, so it reads as the same product one level up.
 *
 * Every figure is derived from real task state across the goal's projects.
 * None of it is stored, so none of it can go stale.
 */
export function GoalStats({ detail }: { detail: GoalDetail }) {
  const { goal, stats } = detail;
  const { progress } = goal;

  const hasWork = progress.state === "in-progress" || progress.state === "complete";

  const figures = [
    {
      icon: ListChecks,
      label: "Tasks",
      value: `${stats.completedTasks}/${stats.totalTasks}`,
      detail: stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : "Nothing overdue",
      alert: stats.overdueTasks > 0,
    },
    {
      icon: CircleDashed,
      label: "Remaining",
      value: String(stats.remainingTasks),
      detail: stats.remainingTasks === 1 ? "task left" : "tasks left",
      alert: false,
    },
    {
      icon: FolderKanban,
      label: "Projects",
      value: String(progress.projectCount),
      detail: `${stats.activeProjects} active`,
      alert: false,
    },
    {
      icon: CheckCircle2,
      label: "Completed",
      value: String(stats.completedProjects),
      detail: stats.completedProjects === 1 ? "project done" : "projects done",
      alert: false,
    },
  ];

  return (
    <section aria-label="Goal progress" className="panel p-5">
      <GoalProgress
        progress={progress}
        label={`${goal.title} overall progress`}
        size="md"
        showCounts={false}
      />

      <p className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="tnum text-[2rem] font-semibold leading-none tracking-tight text-ink">
          {hasWork ? `${progress.percent}%` : "—"}
        </span>
        <span className="text-[0.8125rem] text-ink-muted">
          {progress.state === "no-projects"
            ? "no projects connected yet"
            : progress.state === "no-tasks"
              ? "no task activity yet"
              : `${progress.completed} of ${progress.total} tasks complete`}
        </span>
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 lg:grid-cols-4">
        {figures.map(({ icon: Icon, label, value, detail: sub, alert }) => (
          <div key={label}>
            <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </dt>
            <dd className="tnum mt-1.5 text-base font-semibold text-ink">{value}</dd>
            <dd className={alert ? "text-[0.6875rem] text-caution" : "text-[0.6875rem] text-ink-faint"}>
              {sub}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

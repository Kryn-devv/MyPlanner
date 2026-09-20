import { Flag, ListChecks, Timer, Zap } from "lucide-react";
import { formatDuration } from "@/lib/datetime";
import type { ProjectDetail } from "@/lib/projects/queries";
import { formatXp } from "@/lib/xp";
import { ProjectProgress } from "./ProjectProgress";

/**
 * The project's numbers at a glance.
 *
 * Every figure is derived from real task state — none of it is stored, so none
 * of it can go stale.
 */
export function ProjectStats({ detail }: { detail: ProjectDetail }) {
  const { project, stats, milestones } = detail;

  const figures = [
    {
      icon: ListChecks,
      label: "Tasks",
      value: `${stats.completedTasks}/${stats.totalTasks}`,
      detail: stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : "Nothing overdue",
      alert: stats.overdueTasks > 0,
    },
    {
      icon: Flag,
      label: "Milestones",
      value: `${project.completedMilestoneCount}/${project.milestoneCount}`,
      detail: milestones.length === 0 ? "None yet" : "complete",
      alert: false,
    },
    {
      icon: Zap,
      label: "XP remaining",
      value: formatXp(stats.totalXpAvailable),
      detail: "from open tasks",
      alert: false,
    },
    {
      icon: Timer,
      label: "Time left",
      value: stats.estimatedMinutesRemaining > 0 ? formatDuration(stats.estimatedMinutesRemaining) : "—",
      detail: "estimated",
      alert: false,
    },
  ];

  return (
    <section aria-label="Project progress" className="panel p-5">
      <ProjectProgress
        progress={project.progress}
        label={`${project.name} overall progress`}
        size="md"
        showCounts={false}
      />

      <p className="mt-3 flex items-baseline gap-2">
        <span className="tnum text-[1.75rem] font-semibold leading-none tracking-tight text-ink">
          {project.progress.isEmpty ? "—" : `${project.progress.percent}%`}
        </span>
        <span className="text-[0.8125rem] text-ink-muted">
          {project.progress.isEmpty
            ? "no tasks yet"
            : `${project.progress.completed} of ${project.progress.total} tasks complete`}
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

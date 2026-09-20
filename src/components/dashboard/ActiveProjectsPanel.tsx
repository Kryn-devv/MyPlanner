import Link from "next/link";
import { CalendarClock, FolderKanban } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeDay, type LocalDate } from "@/lib/datetime";
import type { ProjectSummaryView } from "@/lib/projects/queries";
import { EmptyState } from "@/components/ui/States";
import { ProjectMark } from "@/components/projects/ProjectBadges";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DashboardPanel } from "./DashboardPanel";

/**
 * A short list of live projects on the dashboard.
 *
 * Deliberately compact and capped at a few rows: the dashboard is about today,
 * and projects are context for that, not the main event. Anyone who wants the
 * full picture follows the link.
 */
export function ActiveProjectsPanel({
  projects,
  today,
  totalActive,
}: {
  projects: readonly ProjectSummaryView[];
  today: LocalDate;
  totalActive: number;
}) {
  return (
    <DashboardPanel
      title="Projects"
      count={totalActive > 0 ? totalActive : undefined}
      href="/app/projects"
      linkLabel="View all"
    >
      {projects.length === 0 ? (
        <EmptyState
          dense
          icon={<FolderKanban />}
          title="No active projects"
          description="Group related tasks into a project to track progress."
        />
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/app/projects/${project.id}`}
                className="group flex items-start gap-2.5 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <ProjectMark color={project.color} size="sm" className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{project.name}</p>
                    <span className="tnum shrink-0 text-[0.6875rem] text-ink-faint">
                      {project.progress.isEmpty ? "—" : `${project.progress.percent}%`}
                    </span>
                  </div>

                  <div className="mt-1.5">
                    {project.progress.isEmpty ? (
                      <div
                        aria-hidden="true"
                        className="h-1.5 w-full rounded-full bg-white/[0.04]"
                      />
                    ) : (
                      <ProgressBar
                        value={project.progress.percent}
                        label={`${project.name} progress`}
                        valueText={`${project.progress.completed} of ${project.progress.total} tasks complete`}
                        tone={project.progress.isComplete ? "positive" : "xp"}
                        size="sm"
                        animate={false}
                      />
                    )}
                  </div>

                  <p className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-ink-faint">
                    <span className="tnum">
                      {project.progress.isEmpty
                        ? "No tasks yet"
                        : `${project.progress.completed}/${project.progress.total} tasks`}
                    </span>
                    {project.dueDate && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          project.isOverdue && "text-critical",
                        )}
                      >
                        <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
                        <span className="sr-only">{project.isOverdue ? "Overdue, due " : "Due "}</span>
                        {formatRelativeDay(project.dueDate, today)}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

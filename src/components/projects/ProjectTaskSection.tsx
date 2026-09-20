"use client";

import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LocalDate } from "@/lib/datetime";
import type { ProjectTaskFilter } from "@/lib/projects/queries";
import type { TaskView } from "@/lib/tasks/queries";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { TaskList } from "@/components/tasks/TaskList";
import { useTaskDialogs } from "@/components/tasks/TaskDialogProvider";

/**
 * Tasks in the project that sit outside every milestone.
 *
 * Kept separate from the milestone sections so the hierarchy stays legible:
 * everything here is project work that has not been assigned a checkpoint.
 */
const FILTERS: readonly { value: ProjectTaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Done" },
  { value: "overdue", label: "Overdue" },
];

export function ProjectTaskSection({
  projectId,
  tasks,
  filter,
  hasMilestones,
  today,
}: {
  projectId: string;
  tasks: readonly TaskView[];
  filter: ProjectTaskFilter;
  hasMilestones: boolean;
  today: LocalDate;
}) {
  const { openCreate } = useTaskDialogs();

  const heading = hasMilestones ? "Unassigned tasks" : "Tasks";

  return (
    <section aria-labelledby="project-tasks-heading" className="panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 id="project-tasks-heading" className="eyebrow">
            {heading}
          </h2>
          {tasks.length > 0 && <span className="tnum text-[0.75rem] text-ink-muted">{tasks.length}</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Filters are links, not buttons: the filter lives in the URL, so
              it is shareable and survives a refresh. */}
          <div
            role="group"
            aria-label="Filter project tasks"
            className="inline-flex rounded-[var(--radius-control)] border border-line bg-base p-0.5"
          >
            {FILTERS.map((option) => {
              const active = filter === option.value;

              return (
                <Link
                  key={option.value}
                  // The object form rather than a template string: typed
                  // routes cannot express a query string inside a template
                  // literal union, and this stays checked without a cast.
                  href={{
                    pathname: `/app/projects/${projectId}`,
                    query: option.value === "all" ? undefined : { tasks: option.value },
                  }}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                    active ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => openCreate({ milestone: { projectId, milestoneId: null } })}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Task
          </Button>
        </div>
      </header>

      <div className="p-3">
        <TaskList
          tasks={tasks}
          hideProject
          emptyIcon={<ListChecks />}
          emptyTitle={filter === "all" ? "No tasks in this project." : "No tasks match this filter."}
          emptyDescription={
            filter === "all"
              ? hasMilestones
                ? "Every task here is filed under a milestone."
                : "Add the first piece of work."
              : undefined
          }
          emptyAction={
            filter === "all" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openCreate({ milestone: { projectId, milestoneId: null } })}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add task
              </Button>
            ) : undefined
          }
          dense
        />
      </div>
    </section>
  );
}

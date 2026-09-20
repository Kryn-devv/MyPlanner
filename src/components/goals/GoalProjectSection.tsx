"use client";

import { FolderKanban, Link2, Plus, Unlink } from "lucide-react";
import type { LocalDate } from "@/lib/datetime";
import type { ProjectSummaryView } from "@/lib/projects/queries";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjectDialogs } from "@/components/projects/ProjectDialogProvider";
import { useGoalDialogs } from "./GoalDialogProvider";

/**
 * The projects serving this goal.
 *
 * Reuses ProjectCard verbatim rather than inventing a goal-flavoured variant —
 * a project should look the same wherever it appears, and a second card would
 * be a second thing to keep in step. The only addition is a per-project
 * "release" control, which belongs to the relationship rather than the project.
 *
 * Two ways in: create a new project already attached to this goal, or connect
 * one that already exists.
 */
export function GoalProjectSection({
  goalId,
  projects,
  today,
}: {
  goalId: string;
  projects: readonly ProjectSummaryView[];
  today: LocalDate;
}) {
  const { openCreateProject } = useProjectDialogs();
  const { openConnectProject, releaseProject, busy } = useGoalDialogs();

  return (
    <section aria-labelledby="goal-projects-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="goal-projects-heading" className="eyebrow">
            Projects
          </h2>
          {projects.length > 0 && (
            <span className="tnum text-[0.75rem] text-ink-muted">{projects.length}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openConnectProject(goalId)}>
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Connect existing
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openCreateProject({ goalId })}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<FolderKanban />}
            title="This goal has no projects yet."
            description="Projects are how a goal actually gets done. Create one here, or connect something you have already started."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => openCreateProject({ goalId })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  New project
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openConnectProject(goalId)}>
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Connect existing
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              today={today}
              // Releasing belongs to the relationship rather than to the
              // project, so it sits in the card's footer rather than in the
              // menu it shares with the projects page.
              footer={
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => releaseProject(project)}
                    aria-label={`Remove ${project.name} from this goal`}
                  >
                    <Unlink className="h-3 w-3" aria-hidden="true" />
                    Remove from goal
                  </Button>
                </div>
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

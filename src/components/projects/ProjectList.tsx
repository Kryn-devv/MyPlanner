"use client";

import { AnimatePresence } from "framer-motion";
import { FolderKanban, SearchX } from "lucide-react";
import type { LocalDate } from "@/lib/datetime";
import type { ProjectSummaryView } from "@/lib/projects/queries";
import { EmptyState } from "@/components/ui/States";
import { NewProjectButton } from "./NewProjectButton";
import { ProjectCard } from "./ProjectCard";

/**
 * The project grid.
 *
 * Two distinct empty states: "you have no projects" is an invitation, while
 * "nothing matches these filters" is a dead end that needs a different escape.
 * Collapsing them into one message would make the first-run experience read
 * like a failed search.
 */
export function ProjectList({
  projects,
  today,
  isFiltered,
}: {
  projects: readonly ProjectSummaryView[];
  today: LocalDate;
  isFiltered: boolean;
}) {
  if (projects.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={<SearchX />}
        title="No projects match these filters"
        description="Try a different status, or clear the search."
      />
    ) : (
      <EmptyState
        icon={<FolderKanban />}
        title="Your workspace is clear."
        description="Create a project to organise tasks, milestones and progress."
        action={<NewProjectButton label="Create project" />}
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence initial={false} mode="popLayout">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} today={today} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

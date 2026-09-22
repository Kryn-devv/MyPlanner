"use client";

import { Plus } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { useGoalDialogs } from "@/components/goals/GoalDialogProvider";
import { useHabitDialogs } from "@/components/habits/HabitDialogProvider";
import { useProjectDialogs } from "@/components/projects/ProjectDialogProvider";
import { useTaskDialogs } from "./TaskDialogProvider";

/**
 * The global create action.
 *
 * Deliberately a single button that creates a *task*, not a menu. Creating a
 * task is by far the most common thing anyone does here, and putting a menu in
 * front of it would add a click to the hot path to save one on a rare path.
 * Phase 2 already caught that regression once; this keeps the one-click
 * behaviour as goals arrive.
 *
 * The rarer creations get keyboard shortcuts instead, registered here because
 * the header is mounted on every page: N for a task, P for a project, G for a
 * goal, H for a habit. Each is also reachable from its own page's button.
 */
export function QuickAddButton({ className }: { className?: string }) {
  const { openCreate } = useTaskDialogs();
  const { openCreateProject } = useProjectDialogs();
  const { openCreateGoal } = useGoalDialogs();
  const { openCreateHabit } = useHabitDialogs();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "n" && key !== "p" && key !== "g" && key !== "h") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (isTyping) return;
      // Never fire while a dialog is already up.
      if (document.querySelector("dialog[open]")) return;

      event.preventDefault();
      if (key === "n") openCreate();
      else if (key === "p") openCreateProject();
      else if (key === "g") openCreateGoal();
      else openCreateHabit();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openCreate, openCreateProject, openCreateGoal, openCreateHabit]);

  return (
    <Button
      variant="primary"
      size="md"
      onClick={() => openCreate()}
      aria-keyshortcuts="n"
      className={cn("pr-3", className)}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">New task</span>
      <span className="sr-only sm:hidden">New task</span>
      <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 text-[0.625rem] font-medium leading-4 lg:inline">
        N
      </kbd>
    </Button>
  );
}

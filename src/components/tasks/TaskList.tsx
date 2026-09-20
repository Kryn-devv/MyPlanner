"use client";

import { AnimatePresence } from "framer-motion";
import { ListChecks } from "lucide-react";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/lib/tasks/queries";
import { EmptyState } from "@/components/ui/States";
import { TaskCard } from "./TaskCard";
import { useTaskDialogs } from "./TaskDialogProvider";

/**
 * A list of tasks with optimistic completion.
 *
 * Completion is the one mutation safe to apply optimistically: the outcome is
 * a single boolean, the server is authoritative about the XP that follows, and
 * a failure simply reverts on the next revalidation. Creation and deletion are
 * not optimistic — inventing a row with a fake id, or removing one that the
 * server might refuse to delete, would be lying to the user.
 */
export interface TaskListProps {
  tasks: readonly TaskView[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** A rendered element — a component type cannot cross the server/client boundary. */
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  dense?: boolean;
  hideDueDate?: boolean;
  /** Hides project chips where the surrounding context already states it. */
  hideProject?: boolean;
  /** Omits the edit/delete menu on read-only dashboard panels. */
  readOnly?: boolean;
  className?: string;
}

export function TaskList({
  tasks,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon = <ListChecks />,
  emptyAction,
  dense = false,
  hideDueDate = false,
  hideProject = false,
  readOnly = false,
  className,
}: TaskListProps) {
  const { toggle, openEdit, requestDelete, today } = useTaskDialogs();
  const [isPending, startTransition] = useTransition();

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (current: readonly TaskView[], toggledId: string) =>
      current.map((task) =>
        task.id === toggledId ? { ...task, completed: !task.completed } : task,
      ),
  );

  if (optimisticTasks.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        dense={dense}
      />
    );
  }

  const handleToggle = (task: TaskView) => {
    // `useOptimistic` updates must happen inside a transition, and the server
    // action is fired from the same one so the optimistic state is held until
    // revalidation replaces it.
    startTransition(() => {
      applyOptimistic(task.id);
      toggle(task);
    });
  };

  return (
    <ul className={cn("space-y-2", className)} aria-busy={isPending || undefined}>
      <AnimatePresence initial={false} mode="popLayout">
        {optimisticTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            today={today}
            onToggle={handleToggle}
            onEdit={readOnly ? undefined : openEdit}
            onDelete={readOnly ? undefined : requestDelete}
            hideDueDate={hideDueDate}
            hideProject={hideProject}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

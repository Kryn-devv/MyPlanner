"use client";

import { Plus } from "lucide-react";
import { useTaskDialogs } from "@/components/tasks/TaskDialogProvider";
import { Button } from "@/components/ui/Button";
import type { LocalDate } from "@/lib/datetime";

/**
 * A contextual "add a task" affordance for empty panels.
 *
 * Prefills the due date so adding from the Today panel produces a task due
 * today, rather than one the user then has to date by hand.
 */
export function QuickAddPrompt({
  label = "Add a task",
  dueDate = null,
  size = "sm",
}: {
  label?: string;
  dueDate?: LocalDate | null;
  size?: "sm" | "md";
}) {
  const { openCreate } = useTaskDialogs();

  return (
    <Button variant="secondary" size={size} onClick={() => openCreate({ dueDate })}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

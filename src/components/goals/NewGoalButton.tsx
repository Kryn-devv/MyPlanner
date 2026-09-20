"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useGoalDialogs } from "./GoalDialogProvider";

/**
 * Opens the create-goal dialog.
 *
 * The "G" shortcut is registered globally by QuickAddButton in the header, so
 * it is only advertised here — binding it a second time would open the dialog
 * twice on this page.
 */
export function NewGoalButton({
  label = "New goal",
  variant = "primary",
  size = "md",
  withShortcut = false,
}: {
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  withShortcut?: boolean;
}) {
  const { openCreateGoal } = useGoalDialogs();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => openCreateGoal()}
      aria-keyshortcuts={withShortcut ? "g" : undefined}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
      {withShortcut && (
        <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 text-[0.625rem] font-medium leading-4 lg:inline">
          G
        </kbd>
      )}
    </Button>
  );
}

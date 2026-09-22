"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useHabitDialogs } from "./HabitDialogProvider";

/**
 * Opens the create-habit dialog.
 *
 * The "H" shortcut is registered globally by QuickAddButton in the header, so
 * it is only advertised here — binding it again would open the dialog twice.
 */
export function NewHabitButton({
  label = "New habit",
  variant = "primary",
  size = "md",
  withShortcut = false,
}: {
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  withShortcut?: boolean;
}) {
  const { openCreateHabit } = useHabitDialogs();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => openCreateHabit()}
      aria-keyshortcuts={withShortcut ? "h" : undefined}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
      {withShortcut && (
        <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 text-[0.625rem] font-medium leading-4 lg:inline">
          H
        </kbd>
      )}
    </Button>
  );
}

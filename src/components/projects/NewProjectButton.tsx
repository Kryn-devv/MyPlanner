"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useProjectDialogs } from "./ProjectDialogProvider";

/**
 * Opens the create-project dialog.
 *
 * The "P" shortcut is registered globally by QuickAddButton in the header, so
 * it is only advertised here — binding it a second time would fire the dialog
 * twice on this page.
 */
export function NewProjectButton({
  label = "New project",
  variant = "primary",
  size = "md",
  withShortcut = false,
}: {
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  withShortcut?: boolean;
}) {
  const { openCreateProject } = useProjectDialogs();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={openCreateProject}
      aria-keyshortcuts={withShortcut ? "p" : undefined}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
      {withShortcut && (
        <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 text-[0.625rem] font-medium leading-4 lg:inline">
          P
        </kbd>
      )}
    </Button>
  );
}

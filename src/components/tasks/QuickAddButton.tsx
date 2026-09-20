"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lock, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { QUICK_ACTIONS } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { useTaskDialogs } from "./TaskDialogProvider";

/**
 * The global "+" action.
 *
 * Opens a menu listing every quick action the product will eventually have;
 * only Task is enabled in Phase 1. Showing the rest as disabled rather than
 * hiding them keeps the menu's shape stable as features land, and answers
 * "what is this app for?" at a glance.
 *
 * With a single action available, clicking goes straight to the task dialog —
 * a one-item menu is friction, not affordance.
 */
export function QuickAddButton({ className }: { className?: string }) {
  const { openCreate } = useTaskDialogs();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  const enabledActions = QUICK_ACTIONS.filter((action) => action.enabled);
  const onlyTask = enabledActions.length === 1;

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // "N" creates a task from anywhere, unless the user is typing.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== "n" && event.key !== "N") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (isTyping) return;
      // Never fire while a dialog is already up.
      if (document.querySelector("dialog[open]")) return;

      event.preventDefault();
      openCreate();
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [openCreate]);

  const handleClick = () => {
    if (onlyTask) {
      openCreate();
      return;
    }
    setOpen((value) => !value);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        variant="primary"
        size="md"
        onClick={handleClick}
        aria-haspopup={onlyTask ? undefined : "menu"}
        aria-expanded={onlyTask ? undefined : open}
        aria-keyshortcuts="n"
        className="pr-3"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">New task</span>
        <span className="sr-only sm:hidden">New task</span>
        <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 text-[0.625rem] font-medium leading-4 lg:inline">
          N
        </kbd>
      </Button>

      <AnimatePresence>
        {open && !onlyTask && (
          <motion.div
            role="menu"
            aria-label="Create"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="panel absolute right-0 top-12 z-30 w-48 bg-overlay p-1 shadow-[0_18px_48px_-14px_rgba(0,0,0,0.85)]"
          >
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  disabled={!action.enabled}
                  onClick={() => {
                    setOpen(false);
                    if (action.id === "task") openCreate();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors",
                    action.enabled
                      ? "text-ink-muted hover:bg-white/5 hover:text-ink"
                      : "cursor-not-allowed text-ink-faint/60",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="flex-1">{action.label}</span>
                  {!action.enabled && (
                    <>
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">(coming in a future phase)</span>
                    </>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

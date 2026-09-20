"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The completion control.
 *
 * A real `<button>` with `aria-pressed`, not a styled `<div>` and not a
 * checkbox input — the action is "complete this task", which is a toggle
 * button, and screen readers announce it as one.
 */
export interface TaskCheckboxProps {
  completed: boolean;
  title: string;
  pending?: boolean;
  onToggle: () => void;
  className?: string;
}

export function TaskCheckbox({ completed, title, pending = false, onToggle, className }: TaskCheckboxProps) {
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={completed}
      aria-label={completed ? `Mark “${title}” as not done` : `Mark “${title}” as done`}
      className={cn(
        "group/check relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border",
        "transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-out-quint)]",
        "hover:scale-110 active:scale-95 disabled:cursor-wait disabled:opacity-60",
        completed
          ? "border-positive/60 bg-positive/20"
          : "border-line-strong bg-white/[0.02] hover:border-accent/60 hover:bg-accent/10",
        className,
      )}
    >
      <motion.span
        initial={false}
        animate={completed ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      >
        <Check className="h-3 w-3 text-positive" strokeWidth={3.5} />
      </motion.span>
    </button>
  );
}

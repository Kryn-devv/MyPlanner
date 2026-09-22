"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { HabitDayView } from "@/lib/habits/queries";
import { formatRelativeDay } from "@/lib/datetime";
import { useHabitDialogs } from "./HabitDialogProvider";

/**
 * The tick for one occurrence.
 *
 * A real `<button>` with `aria-pressed`, like the task checkbox: the action is
 * "I kept this today", which is a toggle button, and screen readers announce
 * it as one.
 *
 * The visual state is optimistic and re-syncs whenever the server sends a new
 * value, so a refused tick — a paused habit, a day that is not an occurrence —
 * snaps back rather than leaving the row lying about what was recorded.
 */
export function HabitCheckbox({
  habit,
  today,
  className,
}: {
  habit: HabitDayView;
  today: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { toggleCompletion } = useHabitDialogs();
  const [completed, setCompleted] = useState(habit.completed);

  useEffect(() => setCompleted(habit.completed), [habit.completed]);

  // A habit that is not active has no occurrences to tick, and a day it was
  // never due cannot be ticked into one.
  const disabled = habit.status !== "ACTIVE" || (!habit.due && !habit.completed);

  const when = habit.date === today ? "today" : formatRelativeDay(habit.date, today).toLowerCase();

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={completed}
      aria-label={
        completed ? `Mark “${habit.name}” as not done ${when}` : `Mark “${habit.name}” as done ${when}`
      }
      onClick={() => {
        const next = !completed;
        setCompleted(next);
        toggleCompletion(habit, next);
      }}
      className={cn(
        "group/check relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border",
        "transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-out-quint)]",
        "hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100",
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
        <Check className="h-3.5 w-3.5 text-positive" strokeWidth={3.5} />
      </motion.span>
    </button>
  );
}

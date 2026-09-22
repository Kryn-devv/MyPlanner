"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The completion control.
 *
 * A real `<button>` with `aria-pressed`, not a styled `<div>` and not a
 * checkbox input — the action is "complete this task", which is a toggle
 * button, and screen readers announce it as one.
 *
 * It is also the most-pressed control in the product, and the moment the
 * whole XP loop hangs off. So it is built to feel like something: the box
 * springs past its size and settles, the tick scales in on an overshoot, and
 * a ring expands out of it once. None of that is load-bearing — every bit of
 * it is `aria-hidden`, and reduced motion removes all of it — but it is the
 * difference between ticking a box and finishing something.
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
  // Bumped only when the control goes from open to done, so the ring fires on
  // completion and never on the initial render or on an un-tick.
  const [ringKey, setRingKey] = useState(0);
  const previous = useRef(completed);

  useEffect(() => {
    if (completed && !previous.current) setRingKey((key) => key + 1);
    previous.current = completed;
  }, [completed]);

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={completed}
      aria-label={completed ? `Mark “${title}” as not done` : `Mark “${title}” as done`}
      whileTap={reduceMotion ? undefined : { scale: 0.86 }}
      animate={reduceMotion ? undefined : { scale: completed ? [1, 1.22, 1] : 1 }}
      transition={{ duration: 0.34, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        "group/check relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border",
        "transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]",
        "hover:border-accent/70 disabled:cursor-wait disabled:opacity-60",
        completed
          ? "border-positive/70 bg-positive/25 shadow-[0_0_10px_-2px_var(--color-positive)]"
          : "border-line-strong bg-white/[0.02] hover:bg-accent/10",
        className,
      )}
    >
      {/* The ring, thrown once on completion. */}
      {!reduceMotion && ringKey > 0 && (
        <span
          key={ringKey}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md border-2 border-positive"
          style={{ animation: "ring-out 520ms var(--ease-out-quint) forwards" }}
        />
      )}

      <motion.span
        initial={false}
        animate={completed ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.34, 1.56, 0.64, 1] }}
        aria-hidden="true"
      >
        <Check className="h-3 w-3 text-positive" strokeWidth={3.5} />
      </motion.span>
    </motion.button>
  );
}

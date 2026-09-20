"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * A progress rail.
 *
 * Always exposes `role="progressbar"` with real values — the visual fill is a
 * decoration on top of that, not the thing itself.
 */
export interface ProgressBarProps {
  /** 0–100. Clamped, so a bad computation cannot overflow the track. */
  value: number;
  label: string;
  /** `xp` paints the progression gradient; `plain` uses a neutral fill. */
  tone?: "xp" | "plain" | "positive";
  size?: "sm" | "md";
  className?: string;
  /** Text read out instead of the bare percentage. */
  valueText?: string;
  animate?: boolean;
}

const TONES = {
  xp: "xp-fill",
  plain: "bg-ink-muted/70",
  positive: "bg-positive",
} as const;

export function ProgressBar({
  value,
  label,
  tone = "xp",
  size = "md",
  className,
  valueText,
  animate = true,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={valueText}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-white/[0.06]",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <motion.div
        initial={shouldAnimate ? { width: 0 } : false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: shouldAnimate ? 0.7 : 0, ease: [0.22, 1, 0.36, 1] }}
        className={cn("h-full rounded-full", TONES[tone])}
      />
    </div>
  );
}

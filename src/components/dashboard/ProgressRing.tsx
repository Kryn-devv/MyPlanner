"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A circular progress dial.
 *
 * A ring rather than a bar for the two figures that represent *you* — your
 * level and your day. A bar is a measurement; a ring that closes is a goal,
 * and the difference is most of why closing one feels like anything.
 *
 * The value is exposed through `role="progressbar"` exactly as the linear
 * rail is, so the shape is a visual decision and nothing more.
 */
export function ProgressRing({
  value,
  label,
  valueText,
  size = 128,
  thickness = 8,
  gradient = "xp",
  children,
  className,
}: {
  /** 0–100. Clamped, so a bad computation cannot overdraw the arc. */
  value: number;
  label: string;
  valueText?: string;
  size?: number;
  thickness?: number;
  gradient?: "xp" | "streak" | "positive";
  children?: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const id = `ring-${gradient}`;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradient === "xp" && (
              <>
                <stop offset="0%" stopColor="var(--color-xp-from)" />
                <stop offset="100%" stopColor="var(--color-xp-to)" />
              </>
            )}
            {gradient === "streak" && (
              <>
                <stop offset="0%" stopColor="var(--color-streak)" />
                <stop offset="100%" stopColor="var(--color-streak-hot)" />
              </>
            )}
            {gradient === "positive" && (
              <>
                <stop offset="0%" stopColor="var(--color-positive)" />
                <stop offset="100%" stopColor="var(--color-xp-to)" />
              </>
            )}
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-white/[0.06]"
        />

        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
          }
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

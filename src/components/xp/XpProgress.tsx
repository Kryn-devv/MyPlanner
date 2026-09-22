"use client";

import { getRank } from "@/config/ranks";
import { cn } from "@/lib/cn";
import type { LevelProgress } from "@/lib/leveling";
import { formatXp } from "@/lib/xp";
import { useCountUp } from "@/components/reward/useCountUp";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * The level and XP rail.
 *
 * The only place in the product that uses the progression gradient, which is
 * what keeps it meaningful rather than decorative.
 */
export interface XpProgressProps {
  progress: LevelProgress;
  className?: string;
  /** `compact` is the sidebar rail; `full` is the dashboard panel. */
  variant?: "full" | "compact";
}

export function XpProgress({ progress, className, variant = "full" }: XpProgressProps) {
  const { level, xpIntoLevel, xpForLevel, xpToNextLevel, percent, isMaxLevel } = progress;
  // Counts rather than snaps, so XP that has just been earned is visibly
  // arriving instead of having silently already arrived.
  const totalXp = useCountUp(progress.totalXp);

  const valueText = isMaxLevel
    ? `Level ${level}, maximum level reached`
    : `${formatXp(xpIntoLevel)} of ${formatXp(xpForLevel)} XP towards level ${level + 1}`;

  if (variant === "compact") {
    const rank = getRank(level);

    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-muted">
            LEVEL <span className="tnum text-ink">{level}</span>
          </span>
          {/* The rank rather than a bare percentage: the sidebar is the one
              place this figure is always on screen, so it should say who you
              are rather than restate the bar directly beneath it. */}
          <span className={cn("text-[0.625rem] font-semibold uppercase tracking-wider", rank.textClass)}>
            {rank.title}
          </span>
        </div>
        <ProgressBar value={percent} label="Level progress" valueText={valueText} size="sm" />
        <p className="tnum text-[0.625rem] text-ink-faint">
          {isMaxLevel ? "Maximum level" : `${formatXp(xpToNextLevel)} XP to level ${level + 1}`}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Level</p>
          <p className="tnum mt-1 text-[2rem] font-semibold leading-none tracking-tight text-ink">
            {level}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-sm font-medium text-ink">
            {formatXp(xpIntoLevel)}
            <span className="text-ink-faint"> / {formatXp(xpForLevel)}</span>
          </p>
          <p className="text-[0.75rem] text-ink-faint">
            {isMaxLevel ? "Maximum level" : `${formatXp(xpToNextLevel)} XP to level ${level + 1}`}
          </p>
        </div>
      </div>

      <ProgressBar value={percent} label="Level progress" valueText={valueText} />

      <p className="tnum text-[0.75rem] text-ink-faint">{formatXp(totalXp)} XP earned all time</p>
    </div>
  );
}

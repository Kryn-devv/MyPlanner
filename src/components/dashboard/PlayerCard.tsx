"use client";

import { Flame, Zap } from "lucide-react";
import { getNextRank, getRank } from "@/config/ranks";
import { cn } from "@/lib/cn";
import type { LevelProgress } from "@/lib/leveling";
import type { DailyProgress } from "@/lib/tasks/queries";
import { formatXp } from "@/lib/xp";
import { useCountUp } from "@/components/reward/useCountUp";
import { ProgressRing } from "./ProgressRing";

/**
 * Who you are in this product, in one panel.
 *
 * The dashboard used to open with four equal tiles — XP, streak, today, all
 * the same size, all the same weight, none of them the point. This replaces
 * them with a single hero that answers the three questions the reward loop
 * actually runs on: how far into this level am I, how long is my run, and how
 * much of today is left.
 *
 * Every figure here is derived from the ledger on the server. The only thing
 * the client adds is movement: the XP total counts rather than snaps, and the
 * rings sweep to their new value, so a completion that happened a second ago
 * is visible in the numbers rather than merely reflected by them.
 */
export function PlayerCard({
  progress,
  streak,
  daily,
  className,
}: {
  progress: LevelProgress;
  streak: { current: number; longest: number; atRisk: boolean };
  daily: DailyProgress;
  className?: string;
}) {
  const rank = getRank(progress.level);
  const next = getNextRank(progress.level);
  const totalXp = useCountUp(progress.totalXp);
  const intoLevel = useCountUp(progress.xpIntoLevel);

  const streakActive = streak.current > 0;
  const hasWork = daily.total > 0;

  return (
    <section
      aria-labelledby="player-heading"
      className={cn(
        "panel relative overflow-hidden p-5 sm:p-7",
        // A pool of the progression colour behind the level ring. The only
        // ambient light on the page, and it sits under the thing it is about.
        "before:pointer-events-none before:absolute before:-left-16 before:-top-24 before:h-64 before:w-64 before:rounded-full before:bg-[radial-gradient(circle,oklch(62%_0.17_288/18%),transparent_70%)]",
        className,
      )}
    >
      <h2 id="player-heading" className="sr-only">
        Your progress
      </h2>

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-8">
        {/* -- level ---------------------------------------------------- */}
        <div className="flex items-center gap-4 sm:gap-5">
          <ProgressRing
            value={progress.percent}
            size={116}
            thickness={9}
            label="Level progress"
            valueText={
              progress.isMaxLevel
                ? `Level ${progress.level}, maximum level reached`
                : `${formatXp(progress.xpIntoLevel)} of ${formatXp(progress.xpForLevel)} XP towards level ${progress.level + 1}`
            }
          >
            <span className="flex flex-col items-center leading-none">
              <span className="text-[0.5625rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Level
              </span>
              <span className="numeral-level tnum mt-1 text-[2.25rem] font-bold tracking-tight">
                {progress.level}
              </span>
            </span>
          </ProgressRing>

          <div className="min-w-0">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.75rem] font-semibold",
                rank.badgeClass,
              )}
            >
              {rank.title}
            </span>
            <p className="mt-2 max-w-[22ch] text-[0.8125rem] leading-snug text-ink-muted">
              {rank.tagline}
            </p>
            <p className="tnum mt-2 flex items-center gap-1.5 text-[0.75rem] text-ink-faint">
              <Zap className="h-3 w-3 text-gold" aria-hidden="true" />
              {formatXp(totalXp)} XP earned all time
            </p>
          </div>
        </div>

        <div aria-hidden="true" className="hidden w-px self-stretch bg-line lg:block" />

        {/* -- the rail to the next level -------------------------------- */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">
              {progress.isMaxLevel ? "Maximum level" : `Next: level ${progress.level + 1}`}
            </p>
            <p className="tnum text-[0.8125rem] font-medium text-ink">
              {formatXp(intoLevel)}
              <span className="text-ink-faint"> / {formatXp(progress.xpForLevel)}</span>
            </p>
          </div>

          <XpRail percent={progress.percent} />

          <p className="mt-2 text-[0.75rem] text-ink-muted">
            {progress.isMaxLevel ? (
              "Nothing further to earn — the curve ends here."
            ) : (
              <>
                <span className="tnum font-medium text-gold-strong">
                  {formatXp(progress.xpToNextLevel)} XP
                </span>{" "}
                to go
                {next && (
                  <>
                    {" · "}
                    <span className="text-ink-faint">
                      {next.rank.title} at level {next.atLevel}
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <div aria-hidden="true" className="hidden w-px self-stretch bg-line lg:block" />

        {/* -- streak and today ------------------------------------------ */}
        <div className="flex items-center gap-5 lg:gap-6">
          <div>
            <p className="eyebrow mb-2">Streak</p>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full border",
                  streakActive
                    ? "border-streak/40 bg-streak/10 shadow-[var(--glow-streak)]"
                    : "border-line bg-white/[0.02]",
                )}
              >
                <Flame
                  className={cn(
                    "h-5 w-5",
                    streakActive ? "animate-flicker text-streak" : "text-ink-faint",
                  )}
                />
              </span>
              <div>
                <p className="tnum text-[1.375rem] font-semibold leading-none text-ink">
                  {streak.current}
                  <span className="ml-1 text-[0.75rem] font-normal text-ink-muted">
                    {streak.current === 1 ? "day" : "days"}
                  </span>
                </p>
                <p className="mt-1 text-[0.6875rem] text-ink-faint">
                  {streakActive ? `Best ${streak.longest}` : "Finish one to start"}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Today</p>
            <ProgressRing
              value={daily.percent}
              size={72}
              thickness={6}
              gradient={daily.percent === 100 ? "positive" : "xp"}
              label="Today's completion"
              valueText={
                hasWork
                  ? `${daily.completed} of ${daily.total} tasks complete`
                  : "No tasks scheduled today"
              }
            >
              {/* The percentage leads and the count sits under it, matching the
                  day ring on Today: the same figure should not be phrased two
                  different ways on two pages that sit next to each other. */}
              <span className="flex flex-col items-center leading-none">
                <span className="tnum text-[0.9375rem] font-semibold text-ink">
                  {hasWork ? `${daily.percent}%` : "—"}
                </span>
                <span className="tnum mt-0.5 text-[0.5625rem] tracking-[0.06em] text-ink-faint">
                  {hasWork ? `${daily.completed}/${daily.total}` : "—"}
                </span>
              </span>
            </ProgressRing>
          </div>
        </div>
      </div>

      {streak.atRisk && (
        <p className="relative mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-caution/25 bg-caution/10 px-3 py-2 text-[0.8125rem] text-caution">
          <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Your {streak.current}-day streak ends tonight unless you finish one task.
        </p>
      )}
    </section>
  );
}

/**
 * The XP rail.
 *
 * Separate from the shared `ProgressBar` because this one is the product's
 * signature: it carries the progression gradient, a travelling sheen while
 * there is progress to show, and a soft glow at the leading edge.
 */
function XpRail({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div
      aria-hidden="true"
      className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
    >
      <div
        className={cn(
          "xp-fill h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-quint)]",
          clamped > 0 && "xp-fill-live shadow-[0_0_12px_-2px_var(--color-accent)]",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

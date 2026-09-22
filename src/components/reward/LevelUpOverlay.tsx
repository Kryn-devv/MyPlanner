"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getNextRank, getRank, isRankUp } from "@/config/ranks";
import { cn } from "@/lib/cn";

/**
 * Crossing a level.
 *
 * The one moment in the product that is allowed to take the whole screen. It
 * is also the only one that has earned it: levels are slow, they come from
 * real finished work, and a line of grey text in the corner was a poor way to
 * mark the thing the entire XP system exists to produce.
 *
 * It is **not** a modal, on purpose. The layer never takes pointer events and
 * dismisses itself on a timer, so the next click still lands wherever it was
 * aimed. Somebody who has just finished a task is mid-flow, and a celebration
 * that makes them stop and press "Continue" is a tax on the exact behaviour
 * the app is trying to reward.
 *
 * A rank change makes it louder — a new title is worth more than a new
 * number, and the difference between the two should be visible.
 */

export interface LevelUp {
  readonly level: number;
  readonly label?: string;
}

/** Rays are fixed rather than random, so the burst is identical every time. */
const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

export function LevelUpOverlay({ levelUp }: { levelUp: LevelUp | null }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center overflow-hidden">
      <AnimatePresence>
        {levelUp && (
          <motion.div
            key={levelUp.level}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 grid place-items-center"
          >
            <Scrim reduceMotion={reduceMotion} />
            <Card levelUp={levelUp} reduceMotion={reduceMotion} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Scrim({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <>
      {/* Flat dim first, glow second. A radial scrim alone is thinnest in the
          middle — exactly where the message goes — so the page behind showed
          straight through the one thing that needed to be legible. */}
      <div aria-hidden="true" className="absolute inset-0 bg-void/88 backdrop-blur-[2px]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(36rem_36rem_at_50%_50%,oklch(62%_0.17_288/30%),transparent_65%)]"
      />

      {!reduceMotion && (
        <div aria-hidden="true" className="absolute left-1/2 top-1/2">
          {RAYS.map((angle, index) => (
            <motion.span
              key={angle}
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: [0, 0.5, 0], scaleY: [0.2, 1, 1.2] }}
              transition={{ duration: 1.5, delay: index * 0.015, ease: [0.22, 1, 0.36, 1] }}
              style={{ rotate: `${angle}deg` }}
              className="absolute left-0 top-0 block h-40 w-[3px] origin-top -translate-x-1/2 rounded-full bg-gradient-to-b from-gold/80 to-transparent"
            />
          ))}
        </div>
      )}
    </>
  );
}

function Card({ levelUp, reduceMotion }: { levelUp: LevelUp; reduceMotion: boolean | null }) {
  const rank = getRank(levelUp.level);
  const rankedUp = isRankUp(levelUp.level);
  const next = getNextRank(levelUp.level);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      // A real surface, not floating text: the overlay can appear over any
      // page in the product, and text alone landed on top of whatever
      // happened to be underneath it.
      className="panel relative mx-4 flex max-w-sm flex-col items-center bg-overlay/95 px-8 py-7 text-center shadow-[var(--shadow-float)]"
    >
      <p className="eyebrow text-gold-strong">{rankedUp ? "New rank" : "Level up"}</p>

      <p
        className={cn(
          "tnum mt-2 text-[5rem] font-bold leading-none tracking-tighter text-ink",
          !reduceMotion && "drop-shadow-[0_4px_28px_rgba(139,124,255,0.65)]",
        )}
      >
        {levelUp.level}
      </p>

      <p
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-semibold",
          rank.badgeClass,
        )}
      >
        {rank.title}
      </p>

      <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-muted">{rank.tagline}</p>

      {levelUp.label && (
        <p className="mt-2 truncate text-[0.75rem] text-ink-faint">
          Earned by finishing “{levelUp.label}”
        </p>
      )}

      {next && (
        <p className="mt-4 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
          {next.rank.title} at level {next.atLevel}
        </p>
      )}

      {/* Announced once, politely, so the moment is not silent for anyone
          who cannot see it — and the visual above stays decorative. */}
      <p role="status" className="sr-only">
        Level {levelUp.level} reached. Rank: {rank.title}.
      </p>
    </motion.div>
  );
}

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";

/**
 * Consecutive finishes.
 *
 * Appears only from the second finish inside the window, because "×1" is not
 * a combo — it is just a task. It says nothing about XP and awards nothing:
 * the moment it started paying out, it would stop being a flourish and start
 * being an incentive to batch work into bursts, which is not a habit worth
 * building.
 *
 * Decorative, and hidden from assistive technology for that reason.
 */
export function ComboBadge({ count }: { count: number }) {
  const reduceMotion = useReducedMotion();
  const visible = count >= 2;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[70] flex justify-center"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="combo"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-void/90 px-3 py-1.5 shadow-[var(--glow-gold)] backdrop-blur-sm"
          >
            <Zap className="h-3.5 w-3.5 text-gold-strong" />
            <span className="tnum text-[0.8125rem] font-bold text-gold-strong">×{count}</span>
            <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              on a roll
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

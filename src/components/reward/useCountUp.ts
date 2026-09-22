"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number towards its target.
 *
 * Used for XP totals and level figures, which arrive as whole new values from
 * the server after a revalidate. Snapping from 770 to 810 reads as a page
 * refresh; counting reads as *earning*, which is the entire point of the
 * figure being on screen at all.
 *
 * Returns the target immediately when the user prefers reduced motion, and on
 * the first render, so the server and the client agree on the initial markup.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || durationMs <= 0) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    // performance.now() rather than Date.now(): monotonic, and unaffected by
    // the clock moving under a long-lived tab.
    const start = performance.now();
    const distance = target - from;

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // Same easing as the rest of the product, in closed form.
      const eased = 1 - Math.pow(1 - t, 5);
      setValue(Math.round(from + distance * eased));

      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      // Whatever happens, the next run starts from what is on screen.
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return value;
}

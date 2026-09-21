"use client";

import { useEffect, useState } from "react";
import type { FocusTiming } from "@/lib/focus/duration";

/**
 * Elapsed seconds for a live session, ticking once a second.
 *
 * Anchored to the server, measured locally. `initialElapsed` is the server's
 * own answer for this render; the browser adds only the time it has measured
 * *since* that render, never a figure of its own.
 *
 * That distinction matters. Computing `clientNow - segmentStartedAt` mixes two
 * clocks: the start instant was written by the server, so a browser whose
 * clock is three minutes slow would show 0:00 for the first three minutes and
 * then trail the server for the rest of the session — and on completing at a
 * displayed 25:00 the user would be told 28m was tracked. Using a *difference*
 * between two readings of the same clock cancels any offset out, so the
 * display agrees with what is banked however wrong the machine's clock is.
 *
 * The interval exists only to re-render; nothing accumulates in it. Each tick
 * recomputes from the anchor, so a throttled tab, a sleeping laptop or a
 * dropped interval all recover on the very next tick rather than losing the
 * seconds they missed.
 *
 * A paused or finished session does not tick at all — its figure cannot
 * change, so there is nothing to re-render for.
 */
export function useFocusElapsed(timing: FocusTiming, initialElapsed: number): number {
  const [elapsed, setElapsed] = useState(initialElapsed);

  const running = timing.status === "RUNNING" && timing.segmentStartedAt !== null;

  useEffect(() => {
    // Re-anchor whenever the server sends a new figure — after a pause, a
    // resume, or any refresh. Without this the display would keep counting
    // from a stale baseline.
    setElapsed(initialElapsed);
    if (!running) return;

    // Read once, then only ever subtract: this is a stopwatch, not a clock, so
    // the absolute value is irrelevant and any offset cancels.
    const anchor = Date.now();

    const id = setInterval(() => {
      const sinceAnchor = Math.max(0, Math.floor((Date.now() - anchor) / 1000));
      setElapsed(initialElapsed + sinceAnchor);
    }, 1000);

    return () => clearInterval(id);
  }, [running, initialElapsed]);

  return elapsed;
}

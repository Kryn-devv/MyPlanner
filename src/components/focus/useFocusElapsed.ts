"use client";

import { useEffect, useState } from "react";
import { elapsedSeconds, type FocusTiming } from "@/lib/focus/duration";

/**
 * Elapsed seconds for a live session, ticking once a second.
 *
 * The interval exists only to re-render. It never *adds* to a counter: every
 * tick recomputes the figure from the session's own timestamps, which is why a
 * tab that was throttled, a laptop that slept, or a refresh that dropped the
 * interval entirely all recover the correct time on the very next frame. An
 * `elapsed += 1` timer would be wrong after any of those, and silently.
 *
 * A paused or finished session does not tick at all — its figure cannot
 * change, so there is nothing to re-render for.
 */
export function useFocusElapsed(timing: FocusTiming): number {
  const [elapsed, setElapsed] = useState(() => elapsedSeconds(timing, new Date()));

  const running = timing.status === "RUNNING" && timing.segmentStartedAt !== null;
  const { accumulatedSeconds, segmentStartedAt, status } = timing;

  useEffect(() => {
    // Recompute immediately: the state above was seeded on the first render,
    // and for a server-rendered page that was a moment ago.
    setElapsed(elapsedSeconds({ status, accumulatedSeconds, segmentStartedAt }, new Date()));
    if (!running) return;

    const id = setInterval(() => {
      setElapsed(elapsedSeconds({ status, accumulatedSeconds, segmentStartedAt }, new Date()));
    }, 1000);

    return () => clearInterval(id);
  }, [running, status, accumulatedSeconds, segmentStartedAt]);

  return elapsed;
}

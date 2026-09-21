import { describe, expect, it } from "vitest";
import { elapsedSeconds, formatTimer, type FocusTiming } from "@/lib/focus/duration";

/**
 * What the screen shows versus what the server banks.
 *
 * The hook that drives the visible clock is anchored to the server's own
 * elapsed figure and adds only the time the browser has measured since — a
 * difference between two readings of one clock. These tests pin that rule as
 * arithmetic, without a DOM: the same inputs a skewed machine would produce,
 * and the guarantee that the displayed number tracks the banked one anyway.
 */

/** The hook's rule, in one line: anchor from the server, delta from here. */
function displayed(initialElapsed: number, msSinceAnchor: number): number {
  return initialElapsed + Math.max(0, Math.floor(msSinceAnchor / 1000));
}

const SERVER_START = "2026-09-21T10:00:00.000Z";

function running(): FocusTiming {
  return { status: "RUNNING", accumulatedSeconds: 0, segmentStartedAt: SERVER_START };
}

describe("the display agrees with what the server banks", () => {
  it("matches exactly when both clocks agree", () => {
    const serverNow = new Date("2026-09-21T10:05:00.000Z");
    const banked = elapsedSeconds(running(), serverNow);

    // Server rendered at 5:00; the browser has measured 30 more seconds.
    expect(displayed(banked, 30_000)).toBe(330);
    expect(elapsedSeconds(running(), new Date("2026-09-21T10:05:30.000Z"))).toBe(330);
  });

  it("is unaffected by a machine whose clock is minutes behind", () => {
    // The old rule was clientNow - serverStart, which on a slow clock read
    // 0:00 while the server was already banking minutes.
    const banked = elapsedSeconds(running(), new Date("2026-09-21T10:25:00.000Z"));
    expect(formatTimer(displayed(banked, 0))).toBe("25:00");
    expect(formatTimer(displayed(banked, 60_000))).toBe("26:00");
  });

  it("is unaffected by a machine whose clock is minutes ahead", () => {
    const banked = elapsedSeconds(running(), new Date("2026-09-21T10:25:00.000Z"));
    // Whatever the absolute reading, only the delta is used.
    expect(displayed(banked, 5_000)).toBe(1505);
  });

  it("never shows a frozen timer, whatever the offset", () => {
    const banked = elapsedSeconds(running(), new Date("2026-09-21T10:00:10.000Z"));
    const readings = [0, 1000, 2000, 3000].map((ms) => displayed(banked, ms));
    expect(readings).toEqual([10, 11, 12, 13]);
  });

  it("recovers the whole gap after the machine sleeps", () => {
    const banked = elapsedSeconds(running(), new Date("2026-09-21T10:00:00.000Z"));
    // Nothing accumulated during the gap; the next tick simply recomputes.
    expect(displayed(banked, 30 * 60_000)).toBe(30 * 60);
  });

  it("re-anchors when the server sends a new figure", () => {
    // After a pause and resume the server's figure is authoritative again.
    const afterResume = 125;
    expect(displayed(afterResume, 0)).toBe(125);
    expect(displayed(afterResume, 10_000)).toBe(135);
  });

  it("does not run backwards if the local clock is adjusted back", () => {
    const banked = 600;
    expect(displayed(banked, -5_000)).toBe(600);
  });
});

describe("a paused session shows what was banked", () => {
  it("does not tick", () => {
    const paused: FocusTiming = {
      status: "PAUSED",
      accumulatedSeconds: 742,
      segmentStartedAt: null,
    };
    // The hook does not start an interval at all in this state; the figure is
    // the server's and cannot move.
    expect(elapsedSeconds(paused, new Date("2026-09-21T10:00:00.000Z"))).toBe(742);
    expect(elapsedSeconds(paused, new Date("2026-09-25T10:00:00.000Z"))).toBe(742);
  });
});

import { describe, expect, it } from "vitest";
import { MIN_TRACKED_SECONDS } from "@/config/focus";
import {
  currentSegmentSeconds,
  elapsedSeconds,
  formatTimer,
  formatTrackedTime,
  isTrackable,
  targetProgress,
  type FocusTiming,
} from "@/lib/focus/duration";

const at = (iso: string) => new Date(iso);

function timing(overrides: Partial<FocusTiming> = {}): FocusTiming {
  return {
    status: "RUNNING",
    accumulatedSeconds: 0,
    segmentStartedAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("elapsed time while running", () => {
  it("is the time since the segment began", () => {
    expect(elapsedSeconds(timing(), at("2026-09-21T10:00:30.000Z"))).toBe(30);
    expect(elapsedSeconds(timing(), at("2026-09-21T10:25:00.000Z"))).toBe(25 * 60);
  });

  it("adds the segment in flight to what was already banked", () => {
    const resumed = timing({
      accumulatedSeconds: 600,
      segmentStartedAt: "2026-09-21T11:00:00.000Z",
    });
    expect(elapsedSeconds(resumed, at("2026-09-21T11:05:00.000Z"))).toBe(900);
  });

  it("is zero at the instant it starts", () => {
    expect(elapsedSeconds(timing(), at("2026-09-21T10:00:00.000Z"))).toBe(0);
  });

  it("floors part-seconds rather than rounding up", () => {
    expect(elapsedSeconds(timing(), at("2026-09-21T10:00:00.999Z"))).toBe(0);
    expect(elapsedSeconds(timing(), at("2026-09-21T10:00:01.001Z"))).toBe(1);
  });

  it("never goes backwards when the clock does", () => {
    // A server clock stepping back must not make tracked time shrink.
    const banked = timing({ accumulatedSeconds: 300 });
    expect(elapsedSeconds(banked, at("2026-09-21T09:59:00.000Z"))).toBe(300);
  });

  it("recovers after a long gap, because nothing was counting", () => {
    // The laptop slept for two hours. The row did not notice.
    expect(elapsedSeconds(timing(), at("2026-09-21T12:00:00.000Z"))).toBe(2 * 3600);
  });
});

describe("elapsed time while paused", () => {
  it("is exactly what was banked", () => {
    const paused = timing({ status: "PAUSED", accumulatedSeconds: 742, segmentStartedAt: null });
    expect(elapsedSeconds(paused, at("2026-09-21T10:00:00.000Z"))).toBe(742);
    // …and does not move, however long you leave it.
    expect(elapsedSeconds(paused, at("2026-09-23T10:00:00.000Z"))).toBe(742);
  });

  it("ignores a stale segment start if one is somehow still set", () => {
    const paused = timing({ status: "PAUSED", accumulatedSeconds: 100 });
    expect(elapsedSeconds(paused, at("2026-09-21T11:00:00.000Z"))).toBe(100);
  });
});

describe("elapsed time once finished", () => {
  it("is the final banked figure for a completed session", () => {
    const done = timing({ status: "COMPLETED", accumulatedSeconds: 1860, segmentStartedAt: null });
    expect(elapsedSeconds(done, at("2027-01-01T00:00:00.000Z"))).toBe(1860);
  });

  it("is frozen for a cancelled session too", () => {
    const cancelled = timing({ status: "CANCELLED", accumulatedSeconds: 5, segmentStartedAt: null });
    expect(elapsedSeconds(cancelled, at("2027-01-01T00:00:00.000Z"))).toBe(5);
  });
});

describe("resilience", () => {
  it("falls back to the banked figure when the timestamp is unreadable", () => {
    const broken = timing({ accumulatedSeconds: 60, segmentStartedAt: "not-a-date" });
    expect(elapsedSeconds(broken, at("2026-09-21T11:00:00.000Z"))).toBe(60);
  });

  it("treats a running session with no segment as simply banked", () => {
    const odd = timing({ accumulatedSeconds: 42, segmentStartedAt: null });
    expect(elapsedSeconds(odd, at("2026-09-21T11:00:00.000Z"))).toBe(42);
  });

  it("never returns a negative total from a negative bank", () => {
    const corrupt = timing({ status: "PAUSED", accumulatedSeconds: -50, segmentStartedAt: null });
    expect(elapsedSeconds(corrupt, at("2026-09-21T10:00:00.000Z"))).toBe(0);
  });
});

describe("the segment in flight", () => {
  it("is what the current run has added", () => {
    const resumed = timing({
      accumulatedSeconds: 600,
      segmentStartedAt: "2026-09-21T11:00:00.000Z",
    });
    expect(currentSegmentSeconds(resumed, at("2026-09-21T11:02:30.000Z"))).toBe(150);
  });

  it("is zero while paused", () => {
    const paused = timing({ status: "PAUSED", accumulatedSeconds: 600, segmentStartedAt: null });
    expect(currentSegmentSeconds(paused, at("2026-09-21T11:02:30.000Z"))).toBe(0);
  });
});

describe("duration is an interval, not a calendar day", () => {
  it("is unaffected by crossing midnight", () => {
    const overnight = timing({ segmentStartedAt: "2026-09-21T23:50:00.000Z" });
    expect(elapsedSeconds(overnight, at("2026-09-22T00:10:00.000Z"))).toBe(20 * 60);
  });

  it("is unaffected by a DST transition", () => {
    // Europe/London springs forward at 01:00 UTC on 29 March 2026: the local
    // clock jumps an hour, the interval does not.
    const acrossDst = timing({ segmentStartedAt: "2026-03-29T00:45:00.000Z" });
    expect(elapsedSeconds(acrossDst, at("2026-03-29T01:15:00.000Z"))).toBe(30 * 60);
  });

  it("is unaffected by the reader's timezone, because none is consulted", () => {
    const original = process.env.TZ;
    const results: number[] = [];
    for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      results.push(elapsedSeconds(timing(), at("2026-09-21T10:30:00.000Z")));
    }
    process.env.TZ = original;
    expect(new Set(results)).toEqual(new Set([1800]));
  });

  it("handles a session running for many hours", () => {
    const long = timing({ segmentStartedAt: "2026-09-21T00:00:00.000Z" });
    expect(elapsedSeconds(long, at("2026-09-21T06:12:00.000Z"))).toBe(6 * 3600 + 12 * 60);
  });
});

describe("timer formatting", () => {
  it("reads as a clock", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(9)).toBe("0:09");
    expect(formatTimer(62)).toBe("1:02");
    expect(formatTimer(1122)).toBe("18:42");
    expect(formatTimer(59 * 60 + 59)).toBe("59:59");
  });

  it("grows an hours field rather than counting past 60 minutes", () => {
    expect(formatTimer(3600)).toBe("1:00:00");
    expect(formatTimer(3903)).toBe("1:05:03");
    expect(formatTimer(22320)).toBe("6:12:00");
  });

  it("refuses to render nonsense", () => {
    expect(formatTimer(-5)).toBe("0:00");
    expect(formatTimer(Number.NaN)).toBe("0:00");
    expect(formatTimer(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("tracked-time formatting", () => {
  it("reads as a total, not a clock", () => {
    expect(formatTrackedTime(0)).toBe("0m");
    expect(formatTrackedTime(45)).toBe("45s");
    expect(formatTrackedTime(60)).toBe("1m");
    expect(formatTrackedTime(1860)).toBe("31m");
    expect(formatTrackedTime(3600)).toBe("1h");
    expect(formatTrackedTime(5700)).toBe("1h 35m");
  });

  it("rounds down, so tracked focus is never overstated", () => {
    expect(formatTrackedTime(119)).toBe("1m");
    expect(formatTrackedTime(3599)).toBe("59m");
  });
});

describe("target progress", () => {
  it("measures work against the intended length", () => {
    const progress = targetProgress(1122, 25);
    expect(progress).toEqual({
      targetSeconds: 1500,
      percent: 75,
      reached: false,
      overrunSeconds: 0,
      remainingSeconds: 378,
    });
  });

  it("reports the target reached without capping the work", () => {
    const progress = targetProgress(1870, 25);
    expect(progress?.reached).toBe(true);
    expect(progress?.percent).toBe(100);
    expect(progress?.overrunSeconds).toBe(370);
    expect(progress?.remainingSeconds).toBe(0);
    // The elapsed figure itself is untouched — 31:10 stays 31:10.
    expect(formatTimer(1870)).toBe("31:10");
  });

  it("is reached exactly on the boundary", () => {
    expect(targetProgress(1500, 25)?.reached).toBe(true);
    expect(targetProgress(1499, 25)?.reached).toBe(false);
  });

  it("is absent when no target was set", () => {
    expect(targetProgress(600, null)).toBeNull();
  });

  it("ignores a target that is not a duration", () => {
    expect(targetProgress(600, 0)).toBeNull();
    expect(targetProgress(600, -25)).toBeNull();
    expect(targetProgress(600, Number.NaN)).toBeNull();
  });

  it("starts at zero", () => {
    const progress = targetProgress(0, 45);
    expect(progress?.percent).toBe(0);
    expect(progress?.remainingSeconds).toBe(2700);
  });
});

describe("the mis-click threshold", () => {
  it("rejects a session shorter than the threshold", () => {
    expect(isTrackable(0)).toBe(false);
    expect(isTrackable(MIN_TRACKED_SECONDS - 1)).toBe(false);
  });

  it("accepts one that reaches it", () => {
    expect(isTrackable(MIN_TRACKED_SECONDS)).toBe(true);
    expect(isTrackable(1800)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyCompletionToStreak,
  getDisplayStreak,
  getStreakDeadline,
  isStreakAtRisk,
  type StreakState,
} from "@/lib/streak";

const fresh: StreakState = { currentStreak: 0, longestStreak: 0, lastCompletedDate: null };

describe("applyCompletionToStreak", () => {
  it("starts a streak on the first ever completion", () => {
    expect(applyCompletionToStreak(fresh, "2026-09-20")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastCompletedDate: "2026-09-20",
    });
  });

  it("extends the streak on a consecutive day", () => {
    const state = { currentStreak: 3, longestStreak: 5, lastCompletedDate: "2026-09-19" };
    expect(applyCompletionToStreak(state, "2026-09-20")).toEqual({
      currentStreak: 4,
      longestStreak: 5,
      lastCompletedDate: "2026-09-20",
    });
  });

  it("is idempotent for a second completion on the same day", () => {
    const state = { currentStreak: 4, longestStreak: 9, lastCompletedDate: "2026-09-20" };
    const once = applyCompletionToStreak(state, "2026-09-20");
    const twice = applyCompletionToStreak(once, "2026-09-20");
    expect(once.currentStreak).toBe(4);
    expect(twice).toEqual(once);
  });

  it("resets to 1 after a missed day", () => {
    const state = { currentStreak: 12, longestStreak: 12, lastCompletedDate: "2026-09-17" };
    expect(applyCompletionToStreak(state, "2026-09-20")).toEqual({
      currentStreak: 1,
      longestStreak: 12,
      lastCompletedDate: "2026-09-20",
    });
  });

  it("raises the longest streak when the current one passes it", () => {
    const state = { currentStreak: 7, longestStreak: 7, lastCompletedDate: "2026-09-19" };
    expect(applyCompletionToStreak(state, "2026-09-20").longestStreak).toBe(8);
  });

  it("counts across a month boundary", () => {
    const state = { currentStreak: 2, longestStreak: 2, lastCompletedDate: "2026-09-30" };
    expect(applyCompletionToStreak(state, "2026-10-01").currentStreak).toBe(3);
  });

  it("counts across a year boundary", () => {
    const state = { currentStreak: 40, longestStreak: 40, lastCompletedDate: "2026-12-31" };
    expect(applyCompletionToStreak(state, "2027-01-01").currentStreak).toBe(41);
  });

  it("counts across a leap day", () => {
    const state = { currentStreak: 1, longestStreak: 1, lastCompletedDate: "2028-02-28" };
    const afterLeap = applyCompletionToStreak(state, "2028-02-29");
    expect(afterLeap.currentStreak).toBe(2);
    expect(applyCompletionToStreak(afterLeap, "2028-03-01").currentStreak).toBe(3);
  });

  it("does not punish a completion that lands on an earlier calendar day", () => {
    // Travelling west can make "today" earlier than the last recorded day.
    // Losing a streak for boarding a plane would be user-hostile.
    const state = { currentStreak: 6, longestStreak: 6, lastCompletedDate: "2026-09-20" };
    const result = applyCompletionToStreak(state, "2026-09-19");
    expect(result.currentStreak).toBe(6);
    expect(result.lastCompletedDate).toBe("2026-09-20");
  });

  it("builds a 30 day streak one day at a time", () => {
    let state: StreakState = fresh;
    for (let day = 1; day <= 30; day++) {
      state = applyCompletionToStreak(state, `2026-06-${String(day).padStart(2, "0")}`);
    }
    expect(state.currentStreak).toBe(30);
    expect(state.longestStreak).toBe(30);
  });

  it("repairs a corrupt zero streak on an otherwise valid chain", () => {
    const state = { currentStreak: 0, longestStreak: 3, lastCompletedDate: "2026-09-19" };
    expect(applyCompletionToStreak(state, "2026-09-20").currentStreak).toBe(2);
  });
});

describe("getDisplayStreak", () => {
  it("shows nothing before the first completion", () => {
    expect(getDisplayStreak(fresh, "2026-09-20")).toBe(0);
  });

  it("shows the streak on the day it was earned", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-20" };
    expect(getDisplayStreak(state, "2026-09-20")).toBe(5);
  });

  it("still shows the streak the next morning, before any work is done", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-19" };
    expect(getDisplayStreak(state, "2026-09-20")).toBe(5);
  });

  it("shows zero once a whole day has been missed", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-18" };
    expect(getDisplayStreak(state, "2026-09-20")).toBe(0);
  });

  it("does not mutate the stored state when it reads as stale", () => {
    const state = Object.freeze({ currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-01" });
    expect(getDisplayStreak(state, "2026-09-20")).toBe(0);
    expect(state.currentStreak).toBe(5);
  });
});

describe("isStreakAtRisk", () => {
  it("flags a streak whose last completion was yesterday", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-19" };
    expect(isStreakAtRisk(state, "2026-09-20")).toBe(true);
  });

  it("does not flag a streak already extended today", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-20" };
    expect(isStreakAtRisk(state, "2026-09-20")).toBe(false);
  });

  it("does not flag an already-broken streak", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastCompletedDate: "2026-09-10" };
    expect(isStreakAtRisk(state, "2026-09-20")).toBe(false);
  });

  it("does not flag an account that has never completed anything", () => {
    expect(isStreakAtRisk(fresh, "2026-09-20")).toBe(false);
  });
});

describe("getStreakDeadline", () => {
  it("is the day after the last completion", () => {
    const state = { currentStreak: 2, longestStreak: 2, lastCompletedDate: "2026-09-30" };
    expect(getStreakDeadline(state)).toBe("2026-10-01");
  });

  it("is null with no history", () => {
    expect(getStreakDeadline(fresh)).toBeNull();
  });
});

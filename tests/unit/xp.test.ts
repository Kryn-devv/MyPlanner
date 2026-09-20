import { describe, expect, it } from "vitest";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import {
  clampXpReward,
  formatXp,
  formatXpDelta,
  getDefaultXpForPriority,
  MAX_XP_REWARD,
  resolveXpReward,
} from "@/lib/xp";

describe("default XP by priority", () => {
  it("matches the specified reward table", () => {
    expect(getDefaultXpForPriority("LOW")).toBe(10);
    expect(getDefaultXpForPriority("MEDIUM")).toBe(20);
    expect(getDefaultXpForPriority("HIGH")).toBe(40);
    expect(getDefaultXpForPriority("URGENT")).toBe(60);
  });

  it("rewards more urgent work more, without exception", () => {
    const rewards = PRIORITIES.map((p) => PRIORITY_CONFIG[p].defaultXp);
    const ascending = [...rewards].sort((a, b) => a - b);
    expect(rewards).toEqual(ascending);
  });

  it("covers every priority in the enum", () => {
    for (const priority of PRIORITIES) {
      expect(getDefaultXpForPriority(priority)).toBeGreaterThan(0);
    }
  });
});

describe("clampXpReward", () => {
  it("keeps valid values untouched", () => {
    expect(clampXpReward(0)).toBe(0);
    expect(clampXpReward(45)).toBe(45);
    expect(clampXpReward(MAX_XP_REWARD)).toBe(MAX_XP_REWARD);
  });

  it("refuses to produce a negative reward", () => {
    expect(clampXpReward(-1)).toBe(0);
    expect(clampXpReward(-9_999)).toBe(0);
  });

  it("caps attempts to mint huge rewards", () => {
    expect(clampXpReward(999_999)).toBe(MAX_XP_REWARD);
    expect(clampXpReward(Number.MAX_SAFE_INTEGER)).toBe(MAX_XP_REWARD);
  });

  it("fails closed to zero on non-finite input", () => {
    // Garbage is not a request for the maximum reward.
    expect(clampXpReward(Number.NaN)).toBe(0);
    expect(clampXpReward(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampXpReward(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("truncates fractional rewards", () => {
    expect(clampXpReward(12.9)).toBe(12);
  });
});

describe("resolveXpReward", () => {
  it("falls back to the priority default when nothing is requested", () => {
    expect(resolveXpReward("HIGH", null)).toBe(40);
    expect(resolveXpReward("LOW", undefined)).toBe(10);
  });

  it("honours a deliberate override", () => {
    expect(resolveXpReward("LOW", 75)).toBe(75);
  });

  it("allows a deliberate zero-XP task", () => {
    // Distinct from "not specified" — chores worth tracking but not rewarding.
    expect(resolveXpReward("URGENT", 0)).toBe(0);
  });

  it("clamps an override rather than trusting it", () => {
    expect(resolveXpReward("LOW", -50)).toBe(0);
    expect(resolveXpReward("LOW", 10_000)).toBe(MAX_XP_REWARD);
  });
});

describe("formatting", () => {
  it("groups thousands", () => {
    expect(formatXp(1840)).toBe("1,840");
    expect(formatXp(0)).toBe("0");
  });

  it("signs deltas explicitly", () => {
    expect(formatXpDelta(40)).toBe("+40 XP");
    expect(formatXpDelta(-40)).toBe("−40 XP");
    expect(formatXpDelta(0)).toBe("+0 XP");
  });
});

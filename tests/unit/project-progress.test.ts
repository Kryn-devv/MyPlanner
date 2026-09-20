import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  isMilestoneOverdue,
  isProjectOverdue,
  suggestsCompletion,
} from "@/lib/projects/progress";

describe("calculateProgress", () => {
  it("reports a partially complete set", () => {
    expect(calculateProgress({ total: 20, completed: 16 })).toMatchObject({
      total: 20,
      completed: 16,
      percent: 80,
      isEmpty: false,
      isComplete: false,
    });
  });

  it("distinguishes an empty set from a 0% one", () => {
    // This is the distinction the UI needs: "no tasks yet" and "nothing done
    // yet" look identical as a number and mean very different things.
    const empty = calculateProgress({ total: 0, completed: 0 });
    const untouched = calculateProgress({ total: 5, completed: 0 });

    expect(empty.isEmpty).toBe(true);
    expect(untouched.isEmpty).toBe(false);
    expect(empty.percent).toBe(0);
    expect(untouched.percent).toBe(0);
  });

  it("never calls an empty set complete", () => {
    // Nothing is not everything — an empty project is not a finished one.
    expect(calculateProgress({ total: 0, completed: 0 }).isComplete).toBe(false);
  });

  it("reports a fully complete set", () => {
    expect(calculateProgress({ total: 7, completed: 7 })).toMatchObject({
      percent: 100,
      isComplete: true,
      isEmpty: false,
    });
  });

  it("rounds to whole percentages", () => {
    expect(calculateProgress({ total: 3, completed: 1 }).percent).toBe(33);
    expect(calculateProgress({ total: 3, completed: 2 }).percent).toBe(67);
    expect(calculateProgress({ total: 7, completed: 1 }).percent).toBe(14);
  });

  it("clamps a completed count that exceeds the total", () => {
    // Should be impossible from an aggregate query, but a percentage above
    // 100 would overflow the progress rail if it ever happened.
    const progress = calculateProgress({ total: 5, completed: 9 });
    expect(progress.completed).toBe(5);
    expect(progress.percent).toBe(100);
  });

  it("neutralises negative and non-integer counts", () => {
    expect(calculateProgress({ total: -3, completed: -1 })).toMatchObject({
      total: 0,
      completed: 0,
      percent: 0,
      isEmpty: true,
    });
    expect(calculateProgress({ total: 10.7, completed: 3.9 })).toMatchObject({
      total: 10,
      completed: 3,
    });
  });

  it("keeps the percentage within bounds for arbitrary counts", () => {
    for (let total = 0; total <= 60; total++) {
      for (const completed of [0, 1, Math.floor(total / 2), total]) {
        const p = calculateProgress({ total, completed });
        expect(p.percent).toBeGreaterThanOrEqual(0);
        expect(p.percent).toBeLessThanOrEqual(100);
        expect(p.completed).toBeLessThanOrEqual(p.total);
      }
    }
  });
});

describe("isProjectOverdue", () => {
  const today = "2026-09-20";

  it("flags an active project past its due date", () => {
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2026-09-19" }, today)).toBe(true);
  });

  it("does not flag a project due today", () => {
    // The day is not over yet.
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: today }, today)).toBe(false);
  });

  it("does not flag a project due in the future", () => {
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2026-09-21" }, today)).toBe(false);
  });

  it("does not flag a project with no due date", () => {
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: null }, today)).toBe(false);
  });

  it("never flags a completed or archived project", () => {
    // Finished work is not waiting on anything, so it cannot be late.
    expect(isProjectOverdue({ status: "COMPLETED", dueDate: "2026-01-01" }, today)).toBe(false);
    expect(isProjectOverdue({ status: "ARCHIVED", dueDate: "2026-01-01" }, today)).toBe(false);
  });

  it("handles month, year and leap boundaries", () => {
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2026-08-31" }, "2026-09-01")).toBe(true);
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2026-12-31" }, "2027-01-01")).toBe(true);
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2028-02-29" }, "2028-03-01")).toBe(true);
    expect(isProjectOverdue({ status: "ACTIVE", dueDate: "2028-02-29" }, "2028-02-29")).toBe(false);
  });
});

describe("isMilestoneOverdue", () => {
  const today = "2026-09-20";

  it("flags a pending milestone past its date", () => {
    expect(isMilestoneOverdue({ status: "PENDING", dueDate: "2026-09-19" }, today)).toBe(true);
  });

  it("never flags a completed milestone", () => {
    expect(isMilestoneOverdue({ status: "COMPLETED", dueDate: "2026-01-01" }, today)).toBe(false);
  });

  it("does not flag one due today or undated", () => {
    expect(isMilestoneOverdue({ status: "PENDING", dueDate: today }, today)).toBe(false);
    expect(isMilestoneOverdue({ status: "PENDING", dueDate: null }, today)).toBe(false);
  });
});

describe("suggestsCompletion", () => {
  const done = calculateProgress({ total: 4, completed: 4 });
  const partial = calculateProgress({ total: 4, completed: 3 });
  const empty = calculateProgress({ total: 0, completed: 0 });

  it("offers completion once every task is done", () => {
    expect(suggestsCompletion(done, "ACTIVE")).toBe(true);
    expect(suggestsCompletion(done, "PENDING")).toBe(true);
  });

  it("stays quiet while work remains", () => {
    expect(suggestsCompletion(partial, "ACTIVE")).toBe(false);
  });

  it("does not suggest completing an empty project", () => {
    expect(suggestsCompletion(empty, "ACTIVE")).toBe(false);
  });

  it("does not suggest what is already done or put away", () => {
    expect(suggestsCompletion(done, "COMPLETED")).toBe(false);
    expect(suggestsCompletion(done, "ARCHIVED")).toBe(false);
  });
});

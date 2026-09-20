import { describe, expect, it } from "vitest";
import { GOAL_DUE_SOON_DAYS } from "@/config/goals";
import {
  calculateGoalProgress,
  getGoalTiming,
  isGoalOverdue,
  suggestsGoalCompletion,
} from "@/lib/goals/progress";

describe("calculateGoalProgress", () => {
  it("pools tasks across projects rather than averaging percentages", () => {
    // Project A 8/10, Project B 2/20. Pooled: 10/30 = 33%.
    // Averaging would claim (80% + 10%) / 2 = 45%, flattering the goal by
    // treating a 10-task project and a 20-task project as equal contributors.
    const progress = calculateGoalProgress({ total: 30, completed: 10 }, 2);

    expect(progress.total).toBe(30);
    expect(progress.completed).toBe(10);
    expect(progress.percent).toBe(33);
    expect(progress.percent).not.toBe(45);
  });

  it("matches the brief's worked example", () => {
    expect(calculateGoalProgress({ total: 60, completed: 43 }, 3).percent).toBe(72);
  });

  it("distinguishes no projects from projects with no tasks", () => {
    // Both have nothing to show, but they need different words.
    const noProjects = calculateGoalProgress({ total: 0, completed: 0 }, 0);
    const noTasks = calculateGoalProgress({ total: 0, completed: 0 }, 2);

    expect(noProjects.state).toBe("no-projects");
    expect(noTasks.state).toBe("no-tasks");
    expect(noProjects.projectCount).toBe(0);
    expect(noTasks.projectCount).toBe(2);
  });

  it("neither is treated as 0% of anything meaningful", () => {
    for (const projectCount of [0, 3]) {
      const progress = calculateGoalProgress({ total: 0, completed: 0 }, projectCount);
      expect(progress.isEmpty).toBe(true);
      expect(progress.isComplete).toBe(false);
    }
  });

  it("reports work in progress", () => {
    const progress = calculateGoalProgress({ total: 10, completed: 4 }, 2);
    expect(progress.state).toBe("in-progress");
    expect(progress.percent).toBe(40);
  });

  it("reports completion only when every task is done", () => {
    expect(calculateGoalProgress({ total: 12, completed: 12 }, 3).state).toBe("complete");
    expect(calculateGoalProgress({ total: 12, completed: 11 }, 3).state).toBe("in-progress");
  });

  it("clamps impossible counts", () => {
    const progress = calculateGoalProgress({ total: 5, completed: 9 }, 1);
    expect(progress.completed).toBe(5);
    expect(progress.percent).toBe(100);
  });

  it("neutralises negative and fractional inputs", () => {
    expect(calculateGoalProgress({ total: -4, completed: -2 }, -1)).toMatchObject({
      total: 0,
      completed: 0,
      projectCount: 0,
      state: "no-projects",
    });
    expect(calculateGoalProgress({ total: 10.8, completed: 3.9 }, 2.7)).toMatchObject({
      total: 10,
      completed: 3,
      projectCount: 2,
    });
  });

  it("keeps the percentage in bounds for arbitrary counts", () => {
    for (let total = 0; total <= 50; total++) {
      for (const completed of [0, 1, Math.floor(total / 2), total]) {
        const p = calculateGoalProgress({ total, completed }, 2);
        expect(p.percent).toBeGreaterThanOrEqual(0);
        expect(p.percent).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("getGoalTiming", () => {
  const today = "2026-09-20";

  it("says nothing when there is no target date", () => {
    expect(getGoalTiming({ status: "ACTIVE", targetDate: null }, today)).toMatchObject({
      state: "none",
      daysRemaining: null,
      label: "",
    });
  });

  it("counts days remaining for a distant target", () => {
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2026-10-18" }, today)).toMatchObject({
      state: "on-track",
      daysRemaining: 28,
      label: "28 days remaining",
    });
  });

  it("says due today on the target date itself", () => {
    // The day is not over yet, so this is not overdue.
    expect(getGoalTiming({ status: "ACTIVE", targetDate: today }, today)).toMatchObject({
      state: "due-today",
      daysRemaining: 0,
      label: "Due today",
    });
  });

  it("counts days overdue once the target has passed", () => {
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2026-09-17" }, today)).toMatchObject({
      state: "overdue",
      daysRemaining: -3,
      label: "Overdue by 3 days",
    });
  });

  it("uses singular wording for exactly one day", () => {
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2026-09-21" }, today).label).toBe("1 day remaining");
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2026-09-19" }, today).label).toBe("Overdue by 1 day");
  });

  it("flags due-soon strictly inside the documented window", () => {
    const at = (offsetDays: number) => {
      const date = new Date(Date.parse(`${today}T00:00:00Z`) + offsetDays * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return getGoalTiming({ status: "ACTIVE", targetDate: date }, today).state;
    };

    expect(at(GOAL_DUE_SOON_DAYS)).toBe("due-soon");
    expect(at(GOAL_DUE_SOON_DAYS + 1)).toBe("on-track");
    expect(at(1)).toBe("due-soon");
  });

  it("stays silent for goals that are achieved or archived", () => {
    // Neither is waiting on anything, so neither can be late.
    for (const status of ["COMPLETED", "ARCHIVED"] as const) {
      expect(getGoalTiming({ status, targetDate: "2026-01-01" }, today)).toMatchObject({
        state: "none",
        label: "",
      });
    }
  });

  it("handles month, year and leap boundaries", () => {
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2026-08-31" }, "2026-09-01").daysRemaining).toBe(-1);
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2027-01-01" }, "2026-12-31").daysRemaining).toBe(1);
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2028-03-01" }, "2028-02-28").daysRemaining).toBe(2);
    expect(getGoalTiming({ status: "ACTIVE", targetDate: "2028-02-29" }, "2028-02-29").state).toBe("due-today");
  });

  it("produces labels free of locale-sensitive punctuation", () => {
    // Built from fixed strings and integers, so Node and Chrome cannot render
    // them differently — the shape of the Phase 1 hydration bug.
    for (const target of ["2026-09-17", "2026-09-20", "2026-09-21", "2026-12-31"]) {
      const label = getGoalTiming({ status: "ACTIVE", targetDate: target }, today).label;
      expect(label).not.toMatch(/[,  ]/);
    }
  });
});

describe("isGoalOverdue", () => {
  const today = "2026-09-20";

  it("flags a live goal past its target", () => {
    expect(isGoalOverdue({ status: "ACTIVE", targetDate: "2026-09-19" }, today)).toBe(true);
  });

  it("does not flag one due today, undated, achieved or archived", () => {
    expect(isGoalOverdue({ status: "ACTIVE", targetDate: today }, today)).toBe(false);
    expect(isGoalOverdue({ status: "ACTIVE", targetDate: null }, today)).toBe(false);
    expect(isGoalOverdue({ status: "COMPLETED", targetDate: "2026-01-01" }, today)).toBe(false);
    expect(isGoalOverdue({ status: "ARCHIVED", targetDate: "2026-01-01" }, today)).toBe(false);
  });
});

describe("suggestsGoalCompletion", () => {
  const complete = calculateGoalProgress({ total: 8, completed: 8 }, 2);
  const partial = calculateGoalProgress({ total: 8, completed: 7 }, 2);
  const noTasks = calculateGoalProgress({ total: 0, completed: 0 }, 2);
  const noProjects = calculateGoalProgress({ total: 0, completed: 0 }, 0);

  it("offers completion once all connected work is done", () => {
    expect(suggestsGoalCompletion(complete, "ACTIVE")).toBe(true);
  });

  it("stays quiet while work remains", () => {
    expect(suggestsGoalCompletion(partial, "ACTIVE")).toBe(false);
  });

  it("never suggests completing an empty goal", () => {
    // Nothing done is not everything done.
    expect(suggestsGoalCompletion(noTasks, "ACTIVE")).toBe(false);
    expect(suggestsGoalCompletion(noProjects, "ACTIVE")).toBe(false);
  });

  it("does not suggest what is already achieved or archived", () => {
    expect(suggestsGoalCompletion(complete, "COMPLETED")).toBe(false);
    expect(suggestsGoalCompletion(complete, "ARCHIVED")).toBe(false);
  });
});

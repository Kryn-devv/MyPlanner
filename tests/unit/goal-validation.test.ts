import { describe, expect, it } from "vitest";
import { MAX_GOAL_DESCRIPTION_LENGTH, MAX_GOAL_TITLE_LENGTH } from "@/config/goals";
import { validateGoal } from "@/lib/validation/goal";
import { validateProject } from "@/lib/validation/project";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("validateGoal", () => {
  it("accepts a minimal goal", () => {
    const result = validateGoal(form({ title: "Get into a top engineering university" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      title: "Get into a top engineering university",
      description: null,
      priority: "MEDIUM",
      status: "ACTIVE",
      startDate: null,
      targetDate: null,
    });
  });

  it("accepts a fully specified goal", () => {
    const result = validateGoal(
      form({
        title: "University Preparation",
        description: "Applications, tests and portfolio, finished before the deadline.",
        priority: "URGENT",
        status: "ACTIVE",
        startDate: "2026-09-01",
        targetDate: "2026-10-18",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      priority: "URGENT",
      startDate: "2026-09-01",
      targetDate: "2026-10-18",
    });
  });

  it("requires a title and trims it", () => {
    expect(validateGoal(form({ title: "" })).ok).toBe(false);
    expect(validateGoal(form({ title: "   " })).ok).toBe(false);

    const trimmed = validateGoal(form({ title: "  Build IRIS  " }));
    expect(trimmed.ok && trimmed.data.title).toBe("Build IRIS");
  });

  it("enforces length limits", () => {
    expect(validateGoal(form({ title: "x".repeat(MAX_GOAL_TITLE_LENGTH + 1) })).ok).toBe(false);
    expect(validateGoal(form({ title: "x".repeat(MAX_GOAL_TITLE_LENGTH) })).ok).toBe(true);
    expect(
      validateGoal(form({ title: "ok", description: "x".repeat(MAX_GOAL_DESCRIPTION_LENGTH + 1) })).ok,
    ).toBe(false);
  });

  it("rejects an unknown priority or status", () => {
    expect(validateGoal(form({ title: "G", priority: "CRITICAL" })).ok).toBe(false);
    expect(validateGoal(form({ title: "G", status: "PAUSED" })).ok).toBe(false);
  });

  it("rejects malformed dates, including rolled-over ones", () => {
    expect(validateGoal(form({ title: "G", targetDate: "next year" })).ok).toBe(false);
    expect(validateGoal(form({ title: "G", targetDate: "2026-02-31" })).ok).toBe(false);
    expect(validateGoal(form({ title: "G", startDate: "2026-13-01" })).ok).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(validateGoal(form({ title: "G", targetDate: "2028-02-29" })).ok).toBe(true);
    expect(validateGoal(form({ title: "G", targetDate: "2027-02-29" })).ok).toBe(false);
  });

  it("rejects a target date before the start date", () => {
    const result = validateGoal(
      form({ title: "G", startDate: "2026-09-20", targetDate: "2026-09-19" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.targetDate).toMatch(/before the start date/i);
  });

  it("allows a goal that starts and targets the same day", () => {
    expect(
      validateGoal(form({ title: "G", startDate: "2026-09-20", targetDate: "2026-09-20" })).ok,
    ).toBe(true);
  });

  it("allows a target with no start, and a start with no target", () => {
    expect(validateGoal(form({ title: "G", targetDate: "2026-12-01" })).ok).toBe(true);
    expect(validateGoal(form({ title: "G", startDate: "2026-01-01" })).ok).toBe(true);
  });

  it("reports every problem at once", () => {
    const result = validateGoal(form({ title: "", priority: "NOPE", targetDate: "nonsense" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["priority", "targetDate", "title"]);
  });
});

describe("validateProject with a goal", () => {
  it("carries a goal id through", () => {
    const result = validateProject(form({ name: "SAT Preparation", goalId: "goal_1" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goalId).toBe("goal_1");
  });

  it("treats an omitted or blank goal as no goal", () => {
    // An unassigned project is entirely valid — goals are a lens, not a tax.
    expect(validateProject(form({ name: "P" })).ok && validateProject(form({ name: "P" })).ok).toBe(true);

    const blank = validateProject(form({ name: "P", goalId: "" }));
    expect(blank.ok).toBe(true);
    if (!blank.ok) return;
    expect(blank.data.goalId).toBeNull();
  });

  it("still enforces the Phase 2 project rules", () => {
    // Adding a goal must not have loosened anything that already worked.
    expect(validateProject(form({ name: "", goalId: "goal_1" })).ok).toBe(false);
    expect(validateProject(form({ name: "P", color: "#ff0000", goalId: "goal_1" })).ok).toBe(false);
    expect(
      validateProject(form({ name: "P", startDate: "2026-09-20", dueDate: "2026-09-19" })).ok,
    ).toBe(false);
  });
});

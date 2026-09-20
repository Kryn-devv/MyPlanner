import { describe, expect, it } from "vitest";
import {
  MAX_MILESTONE_TITLE_LENGTH,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
} from "@/config/projects";
import {
  validateAssignmentShape,
  validateMilestone,
  validateProject,
} from "@/lib/validation/project";
import { validateTask } from "@/lib/validation/task";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("validateProject", () => {
  it("accepts a minimal project", () => {
    const result = validateProject(form({ name: "Build IRIS AI Assistant" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      name: "Build IRIS AI Assistant",
      priority: "MEDIUM",
      status: "ACTIVE",
      startDate: null,
      dueDate: null,
    });
  });

  it("accepts a fully specified project", () => {
    const result = validateProject(
      form({
        name: "SAT Preparation",
        description: "Structured revision through to the exam.",
        color: "cyan",
        priority: "HIGH",
        status: "ACTIVE",
        startDate: "2026-09-01",
        dueDate: "2026-12-05",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      name: "SAT Preparation",
      color: "cyan",
      priority: "HIGH",
      startDate: "2026-09-01",
      dueDate: "2026-12-05",
    });
  });

  it("requires a name and trims it", () => {
    expect(validateProject(form({ name: "" })).ok).toBe(false);
    expect(validateProject(form({ name: "   " })).ok).toBe(false);

    const trimmed = validateProject(form({ name: "  Portfolio  " }));
    expect(trimmed.ok && trimmed.data.name).toBe("Portfolio");
  });

  it("enforces length limits", () => {
    expect(validateProject(form({ name: "x".repeat(MAX_PROJECT_NAME_LENGTH + 1) })).ok).toBe(false);
    expect(
      validateProject(form({ name: "ok", description: "x".repeat(MAX_PROJECT_DESCRIPTION_LENGTH + 1) })).ok,
    ).toBe(false);
  });

  it("rejects a colour outside the shared palette", () => {
    const result = validateProject(form({ name: "P", color: "#ff0000" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.color).toBeDefined();
  });

  it("rejects an unknown priority or status", () => {
    expect(validateProject(form({ name: "P", priority: "CRITICAL" })).ok).toBe(false);
    expect(validateProject(form({ name: "P", status: "PAUSED" })).ok).toBe(false);
  });

  it("rejects malformed dates, including rolled-over ones", () => {
    expect(validateProject(form({ name: "P", dueDate: "next friday" })).ok).toBe(false);
    expect(validateProject(form({ name: "P", dueDate: "2026-02-31" })).ok).toBe(false);
    expect(validateProject(form({ name: "P", startDate: "2026-13-01" })).ok).toBe(false);
  });

  it("rejects a due date before the start date", () => {
    const result = validateProject(
      form({ name: "P", startDate: "2026-09-20", dueDate: "2026-09-19" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.dueDate).toMatch(/before the start date/i);
  });

  it("allows a project that starts and ends on the same day", () => {
    expect(
      validateProject(form({ name: "P", startDate: "2026-09-20", dueDate: "2026-09-20" })).ok,
    ).toBe(true);
  });

  it("reports every problem at once", () => {
    const result = validateProject(form({ name: "", color: "puce", priority: "NOPE" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["color", "name", "priority"]);
  });
});

describe("validateMilestone", () => {
  it("accepts a minimal milestone", () => {
    const result = validateMilestone(form({ title: "Hardware" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ title: "Hardware", description: null, dueDate: null });
  });

  it("requires a title", () => {
    expect(validateMilestone(form({ title: "" })).ok).toBe(false);
    expect(validateMilestone(form({ title: "  " })).ok).toBe(false);
  });

  it("enforces the title limit", () => {
    expect(validateMilestone(form({ title: "x".repeat(MAX_MILESTONE_TITLE_LENGTH + 1) })).ok).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(validateMilestone(form({ title: "Voice System", dueDate: "2026-02-30" })).ok).toBe(false);
  });

  it("accepts a valid date", () => {
    const result = validateMilestone(form({ title: "Exhibition", dueDate: "2026-11-15" }));
    expect(result.ok && result.data.dueDate).toBe("2026-11-15");
  });
});

describe("validateAssignmentShape", () => {
  it("allows no assignment at all", () => {
    expect(validateAssignmentShape(null, null).ok).toBe(true);
  });

  it("allows a project without a milestone", () => {
    expect(validateAssignmentShape("proj_1", null).ok).toBe(true);
  });

  it("allows a project with a milestone", () => {
    expect(validateAssignmentShape("proj_1", "ms_1").ok).toBe(true);
  });

  it("rejects a milestone with no project", () => {
    // The one invalid combination that needs no database to spot.
    const result = validateAssignmentShape(null, "ms_1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.milestoneId).toBeDefined();
  });
});

describe("validateTask with assignment", () => {
  it("carries a project and milestone through", () => {
    const result = validateTask(form({ title: "Wire sensors", projectId: "p1", milestoneId: "m1" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.projectId).toBe("p1");
    expect(result.data.milestoneId).toBe("m1");
  });

  it("defaults to no assignment", () => {
    const result = validateTask(form({ title: "Standalone" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.projectId).toBeNull();
    expect(result.data.milestoneId).toBeNull();
  });

  it("rejects a milestone without a project", () => {
    const result = validateTask(form({ title: "Orphan", milestoneId: "m1" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.milestoneId).toBeDefined();
  });

  it("still enforces the Phase 1 task rules", () => {
    // Assignment must not have loosened anything that already worked.
    expect(validateTask(form({ title: "", projectId: "p1" })).ok).toBe(false);
    expect(validateTask(form({ title: "T", xpReward: "-5", projectId: "p1" })).ok).toBe(false);
    expect(validateTask(form({ title: "T", estimatedMinutes: "0", projectId: "p1" })).ok).toBe(false);
  });
});

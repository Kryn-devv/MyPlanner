import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMilestone, createProject, updateProject } from "@/lib/projects/service";
import { getProjectDetail, getProjects } from "@/lib/projects/queries";
import { formatRelativeDay } from "@/lib/datetime";
import { createTestMilestone, createTestProject, createTestUser, db, resetDatabase, type TestUser } from "./helpers";

/**
 * Date handling for projects and milestones.
 *
 * Phase 1 shipped a production hydration mismatch caused by Node and Chrome
 * formatting dates differently, and a whole class of off-by-one-day bugs comes
 * from reading a DATE column in the wrong zone. These assert both ends: that a
 * stored date round-trips unchanged, and that "overdue" is decided on the
 * user's calendar rather than the server's.
 */

let user: TestUser;

const input = (overrides: Partial<Parameters<typeof createProject>[1]> = {}) => ({
  name: "Dated project",
  description: null,
  color: "violet",
  priority: "MEDIUM" as const,
  status: "ACTIVE" as const,
  startDate: null,
  dueDate: null,
  ...overrides,
});

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("project dates round-trip without shifting", () => {
  it("returns exactly the calendar days that were stored", async () => {
    const cases = ["2026-01-01", "2026-06-15", "2026-12-31", "2028-02-29"];

    for (const date of cases) {
      const { id } = await createProject(user.id, input({ startDate: date, dueDate: date }));
      const detail = await getProjectDetail(user.id, id, "UTC");

      expect(detail?.project.startDate).toBe(date);
      expect(detail?.project.dueDate).toBe(date);
    }
  });

  it("does not shift when the viewer is far east or west of UTC", async () => {
    // The classic off-by-one: reading a DATE column in local time.
    const { id } = await createProject(user.id, input({ dueDate: "2026-03-01" }));

    for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Midway", "Asia/Kolkata"]) {
      const detail = await getProjectDetail(user.id, id, zone);
      expect(detail?.project.dueDate).toBe("2026-03-01");
    }
  });

  it("survives an edit unchanged", async () => {
    const { id } = await createProject(user.id, input({ dueDate: "2026-11-15" }));
    await updateProject(user.id, id, input({ name: "Renamed", dueDate: "2026-11-15" }));

    expect((await getProjectDetail(user.id, id, "UTC"))?.project.dueDate).toBe("2026-11-15");
  });

  it("round-trips milestone dates too", async () => {
    const project = await createTestProject(user.id);
    await createMilestone(user.id, project.id, {
      title: "Dated milestone",
      description: null,
      dueDate: "2028-02-29",
    });

    const detail = await getProjectDetail(user.id, project.id, "UTC");
    expect(detail?.milestones[0]?.dueDate).toBe("2028-02-29");
  });
});

describe("overdue is decided on the user's calendar", () => {
  const dueDate = new Date("2026-09-20T00:00:00Z");

  it("is not overdue on the due date itself, in any zone", async () => {
    const project = await createTestProject(user.id, { dueDate });

    // 2026-09-20T23:30Z is already the 21st in Tokyo, but only just the 20th
    // in Los Angeles. Neither should be late on their own 20th.
    for (const [zone, now] of [
      ["Asia/Tokyo", "2026-09-20T10:00:00Z"],
      ["America/Los_Angeles", "2026-09-20T20:00:00Z"],
      ["UTC", "2026-09-20T12:00:00Z"],
    ] as const) {
      const detail = await getProjectDetail(user.id, project.id, zone, "all", new Date(now));
      expect(detail?.project.isOverdue).toBe(false);
    }
  });

  it("becomes overdue once the user's own day has rolled over", async () => {
    const project = await createTestProject(user.id, { dueDate });

    // 2026-09-20T23:30Z: the 21st in Tokyo (late), still the 20th in LA (not).
    const instant = new Date("2026-09-20T23:30:00Z");

    const tokyo = await getProjectDetail(user.id, project.id, "Asia/Tokyo", "all", instant);
    const la = await getProjectDetail(user.id, project.id, "America/Los_Angeles", "all", instant);

    expect(tokyo?.project.isOverdue).toBe(true);
    expect(la?.project.isOverdue).toBe(false);
  });

  it("stops being overdue once the project is completed", async () => {
    const project = await createTestProject(user.id, {
      dueDate: new Date("2026-09-01T00:00:00Z"),
      status: "COMPLETED",
    });

    const detail = await getProjectDetail(user.id, project.id, "UTC", "all", new Date("2026-09-20T12:00:00Z"));
    expect(detail?.project.isOverdue).toBe(false);
  });

  it("applies the same rule to milestones", async () => {
    const project = await createTestProject(user.id);
    await createTestMilestone(project.id, { title: "Late", dueDate: new Date("2026-09-18T00:00:00Z") });
    await createTestMilestone(project.id, {
      title: "Late but done",
      dueDate: new Date("2026-09-18T00:00:00Z"),
      status: "COMPLETED",
    });

    const detail = await getProjectDetail(user.id, project.id, "UTC", "all", new Date("2026-09-20T12:00:00Z"));
    const byTitle = new Map(detail?.milestones.map((m) => [m.title, m]));

    expect(byTitle.get("Late")?.isOverdue).toBe(true);
    expect(byTitle.get("Late but done")?.isOverdue).toBe(false);
  });

  it("filters the overdue project list by the user's day", async () => {
    await createTestProject(user.id, { name: "Due today", dueDate });

    const tokyo = await getProjects(user.id, "Asia/Tokyo", { status: "OVERDUE" }, new Date("2026-09-20T23:30:00Z"));
    const la = await getProjects(user.id, "America/Los_Angeles", { status: "OVERDUE" }, new Date("2026-09-20T23:30:00Z"));

    expect(tokyo.map((p) => p.name)).toEqual(["Due today"]);
    expect(la).toHaveLength(0);
  });
});

describe("project dates render deterministically", () => {
  it("formats stored project dates through the fixed-table formatter", async () => {
    // Guards the Phase 1 hydration bug: these labels must not come from
    // Intl, whose en-GB patterns differ between Node and Chrome.
    const { id } = await createProject(user.id, input({ dueDate: "2026-09-27" }));
    const detail = await getProjectDetail(user.id, id, "UTC");
    const dueDate = detail?.project.dueDate;
    expect(dueDate).toBe("2026-09-27");

    expect(formatRelativeDay(dueDate as string, "2026-09-20")).toBe("27 Sep");
    expect(formatRelativeDay(dueDate as string, "2026-09-26")).toBe("Tomorrow");
    expect(formatRelativeDay(dueDate as string, "2026-09-25")).toBe("Sun 27 Sep");
    // No comma or narrow no-break space — the exact shape of that divergence.
    expect(formatRelativeDay(dueDate as string, "2026-09-25")).not.toMatch(/[,  ]/);
  });
});

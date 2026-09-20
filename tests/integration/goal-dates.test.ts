import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createGoal, updateGoal } from "@/lib/goals/service";
import { getGoalDetail, getGoals } from "@/lib/goals/queries";
import { formatRelativeDay } from "@/lib/datetime";
import { createTestGoal, createTestUser, db, resetDatabase, type TestUser } from "./helpers";

/**
 * Goal date handling.
 *
 * Phase 1 shipped a production hydration mismatch caused by Node and Chrome
 * formatting dates differently, and a whole class of off-by-one-day bugs comes
 * from reading a DATE column in the wrong zone. These assert both ends: that a
 * stored target round-trips unchanged, and that "overdue" is decided on the
 * user's calendar rather than the server's.
 */

let user: TestUser;

const input = (overrides: Partial<Parameters<typeof createGoal>[1]> = {}) => ({
  title: "Dated goal",
  description: null,
  priority: "MEDIUM" as const,
  status: "ACTIVE" as const,
  startDate: null,
  targetDate: null,
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

describe("goal dates round-trip without shifting", () => {
  it("returns exactly the calendar days that were stored", async () => {
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31", "2028-02-29"]) {
      const { id } = await createGoal(user.id, input({ startDate: date, targetDate: date }));
      const detail = await getGoalDetail(user.id, id, "UTC");

      expect(detail?.goal.startDate).toBe(date);
      expect(detail?.goal.targetDate).toBe(date);
    }
  });

  it("does not shift when the viewer is far east or west of UTC", async () => {
    // The classic off-by-one: reading a DATE column in local time.
    const { id } = await createGoal(user.id, input({ targetDate: "2026-03-01" }));

    for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Midway", "Asia/Kolkata"]) {
      expect((await getGoalDetail(user.id, id, zone))?.goal.targetDate).toBe("2026-03-01");
    }
  });

  it("survives an edit unchanged", async () => {
    const { id } = await createGoal(user.id, input({ targetDate: "2026-11-15" }));
    await updateGoal(user.id, id, input({ title: "Renamed", targetDate: "2026-11-15" }));

    expect((await getGoalDetail(user.id, id, "UTC"))?.goal.targetDate).toBe("2026-11-15");
  });
});

describe("timing is decided on the user's calendar", () => {
  const targetDate = new Date("2026-09-20T00:00:00Z");

  it("is due today, not overdue, on the target date in any zone", async () => {
    const goal = await createTestGoal(user.id, { targetDate });

    for (const [zone, now] of [
      ["Asia/Tokyo", "2026-09-20T10:00:00Z"],
      ["America/Los_Angeles", "2026-09-20T20:00:00Z"],
      ["UTC", "2026-09-20T12:00:00Z"],
    ] as const) {
      const detail = await getGoalDetail(user.id, goal.id, zone, new Date(now));
      expect(detail?.goal.isOverdue).toBe(false);
      expect(detail?.goal.timing.state).toBe("due-today");
      expect(detail?.goal.timing.label).toBe("Due today");
    }
  });

  it("becomes overdue once the user's own day has rolled over", async () => {
    const goal = await createTestGoal(user.id, { targetDate });

    // 2026-09-20T23:30Z: already the 21st in Tokyo, still the 20th in LA.
    const instant = new Date("2026-09-20T23:30:00Z");

    const tokyo = await getGoalDetail(user.id, goal.id, "Asia/Tokyo", instant);
    const la = await getGoalDetail(user.id, goal.id, "America/Los_Angeles", instant);

    expect(tokyo?.goal.isOverdue).toBe(true);
    expect(tokyo?.goal.timing.label).toBe("Overdue by 1 day");
    expect(la?.goal.isOverdue).toBe(false);
    expect(la?.goal.timing.label).toBe("Due today");
  });

  it("counts days remaining from the user's own day", async () => {
    const goal = await createTestGoal(user.id, {
      targetDate: new Date("2026-10-18T00:00:00Z"),
    });

    const detail = await getGoalDetail(user.id, goal.id, "UTC", new Date("2026-09-20T12:00:00Z"));
    expect(detail?.goal.timing).toMatchObject({
      state: "on-track",
      daysRemaining: 28,
      label: "28 days remaining",
    });
  });

  it("stops timing a goal once it is achieved or archived", async () => {
    for (const status of ["COMPLETED", "ARCHIVED"] as const) {
      const goal = await createTestGoal(user.id, {
        status,
        targetDate: new Date("2026-09-01T00:00:00Z"),
      });
      const detail = await getGoalDetail(user.id, goal.id, "UTC", new Date("2026-09-20T12:00:00Z"));

      expect(detail?.goal.isOverdue).toBe(false);
      expect(detail?.goal.timing.state).toBe("none");
    }
  });

  it("filters the overdue goal list by the user's day", async () => {
    await createTestGoal(user.id, { title: "Due today", targetDate });

    const instant = new Date("2026-09-20T23:30:00Z");
    const tokyo = await getGoals(user.id, "Asia/Tokyo", { status: "OVERDUE" }, instant);
    const la = await getGoals(user.id, "America/Los_Angeles", { status: "OVERDUE" }, instant);

    expect(tokyo.map((g) => g.title)).toEqual(["Due today"]);
    expect(la).toHaveLength(0);
  });

  it("handles month, year and leap boundaries", async () => {
    const cases = [
      { target: "2026-08-31", now: "2026-09-01T12:00:00Z", expected: "Overdue by 1 day" },
      { target: "2027-01-01", now: "2026-12-31T12:00:00Z", expected: "1 day remaining" },
      { target: "2028-02-29", now: "2028-02-28T12:00:00Z", expected: "1 day remaining" },
      { target: "2028-03-01", now: "2028-02-29T12:00:00Z", expected: "1 day remaining" },
    ];

    for (const { target, now, expected } of cases) {
      const { id } = await createGoal(user.id, input({ targetDate: target }));
      const detail = await getGoalDetail(user.id, id, "UTC", new Date(now));
      expect(detail?.goal.timing.label).toBe(expected);
    }
  });
});

describe("goal dates render deterministically", () => {
  it("formats stored target dates through the fixed-table formatter", async () => {
    // Guards the Phase 1 hydration bug: these labels must not come from Intl,
    // whose en-GB patterns differ between Node and Chrome.
    const { id } = await createGoal(user.id, input({ targetDate: "2026-10-18" }));
    const target = (await getGoalDetail(user.id, id, "UTC"))?.goal.targetDate;
    expect(target).toBe("2026-10-18");

    expect(formatRelativeDay(target as string, "2026-09-20")).toBe("18 Oct");
    expect(formatRelativeDay(target as string, "2026-10-17")).toBe("Tomorrow");
    expect(formatRelativeDay(target as string, "2026-10-18")).toBe("Today");
    expect(formatRelativeDay(target as string, "2026-10-14")).toBe("Sun 18 Oct");
    // No comma or narrow no-break space — the exact shape of that divergence.
    expect(formatRelativeDay(target as string, "2026-10-14")).not.toMatch(/[,  ]/);
  });

  it("produces timing labels free of locale-sensitive punctuation", async () => {
    const goal = await createTestGoal(user.id, { targetDate: new Date("2026-12-25T00:00:00Z") });

    for (const now of ["2026-09-20T12:00:00Z", "2026-12-25T12:00:00Z", "2027-01-05T12:00:00Z"]) {
      const detail = await getGoalDetail(user.id, goal.id, "UTC", new Date(now));
      expect(detail?.goal.timing.label).not.toMatch(/[,  ]/);
    }
  });
});

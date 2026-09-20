import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDashboardData } from "@/lib/tasks/queries";
import { completeTask } from "@/lib/tasks/service";
import {
  createTestTask,
  createTestUser,
  db,
  getStats,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Streak persistence and daily statistics, driven by an injected clock so that
 * multi-day behaviour is testable without waiting a week.
 */

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser({ timezone: "UTC" });
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

const at = (iso: string) => new Date(iso);

describe("streak persistence", () => {
  it("starts at one on the first completion", async () => {
    const task = await createTestTask(user.id);
    await completeTask(user.id, task.id, "UTC", at("2026-09-20T10:00:00Z"));

    const stats = await getStats(user.id);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
    expect(stats.lastCompletedDate).toBe("2026-09-20");
  });

  it("grows across consecutive days", async () => {
    for (let day = 18; day <= 20; day++) {
      const task = await createTestTask(user.id);
      await completeTask(user.id, task.id, "UTC", at(`2026-09-${day}T10:00:00Z`));
    }

    const stats = await getStats(user.id);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it("does not double-count two completions on the same day", async () => {
    const first = await createTestTask(user.id);
    const second = await createTestTask(user.id);
    await completeTask(user.id, first.id, "UTC", at("2026-09-20T09:00:00Z"));
    await completeTask(user.id, second.id, "UTC", at("2026-09-20T21:00:00Z"));

    expect((await getStats(user.id)).currentStreak).toBe(1);
  });

  it("resets after a missed day but preserves the record", async () => {
    for (let day = 10; day <= 14; day++) {
      const task = await createTestTask(user.id);
      await completeTask(user.id, task.id, "UTC", at(`2026-09-${day}T10:00:00Z`));
    }
    expect((await getStats(user.id)).currentStreak).toBe(5);

    const later = await createTestTask(user.id);
    await completeTask(user.id, later.id, "UTC", at("2026-09-20T10:00:00Z"));

    const stats = await getStats(user.id);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(5);
  });
});

describe("streaks and timezones", () => {
  it("uses the user's calendar day, not the server's UTC day", async () => {
    // 23:30 UTC on the 20th is already the 21st in Tokyo.
    const tokyo = await createTestUser({ timezone: "Asia/Tokyo" });
    const task = await createTestTask(tokyo.id);
    await completeTask(tokyo.id, task.id, "Asia/Tokyo", at("2026-09-20T23:30:00Z"));

    expect((await getStats(tokyo.id)).lastCompletedDate).toBe("2026-09-21");
  });

  it("counts late-evening work west of UTC as the same local day", async () => {
    // 02:00 UTC on the 21st is still the evening of the 20th in Los Angeles.
    const la = await createTestUser({ timezone: "America/Los_Angeles" });

    const evening = await createTestTask(la.id);
    await completeTask(la.id, evening.id, "America/Los_Angeles", at("2026-09-20T20:00:00Z"));
    const lateNight = await createTestTask(la.id);
    await completeTask(la.id, lateNight.id, "America/Los_Angeles", at("2026-09-21T02:00:00Z"));

    const stats = await getStats(la.id);
    // Both fall on 2026-09-20 locally: one day, not two.
    expect(stats.lastCompletedDate).toBe("2026-09-20");
    expect(stats.currentStreak).toBe(1);
  });

  it("does not break a streak when the user travels east", async () => {
    // Build a streak in Los Angeles, then complete the next task from Tokyo.
    const traveller = await createTestUser({ timezone: "America/Los_Angeles" });

    const first = await createTestTask(traveller.id);
    await completeTask(traveller.id, first.id, "America/Los_Angeles", at("2026-09-19T18:00:00Z"));
    expect((await getStats(traveller.id)).currentStreak).toBe(1);

    const second = await createTestTask(traveller.id);
    await completeTask(traveller.id, second.id, "Asia/Tokyo", at("2026-09-20T05:00:00Z"));

    const stats = await getStats(traveller.id);
    // 2026-09-19 in LA, then 2026-09-20 in Tokyo — consecutive, so it extends.
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
  });

  it("does not punish a user whose local day moves backwards", async () => {
    // Travelling west can replay a calendar day. The streak must survive it.
    const traveller = await createTestUser({ timezone: "Asia/Tokyo" });

    const first = await createTestTask(traveller.id);
    await completeTask(traveller.id, first.id, "Asia/Tokyo", at("2026-09-20T01:00:00Z"));
    expect((await getStats(traveller.id)).lastCompletedDate).toBe("2026-09-20");

    const second = await createTestTask(traveller.id);
    await completeTask(traveller.id, second.id, "America/Los_Angeles", at("2026-09-20T02:00:00Z"));

    const stats = await getStats(traveller.id);
    expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
    expect(stats.lastCompletedDate).toBe("2026-09-20");
  });
});

describe("daily completion statistics", () => {
  it("reports zero without dividing by zero on an empty day", async () => {
    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.daily).toMatchObject({ total: 0, completed: 0, percent: 0 });
  });

  it("counts completed against scheduled for today", async () => {
    const due = new Date("2026-09-20T00:00:00Z");
    const a = await createTestTask(user.id, { dueDate: due });
    await createTestTask(user.id, { dueDate: due });
    await createTestTask(user.id, { dueDate: due });

    await completeTask(user.id, a.id, "UTC", at("2026-09-20T09:00:00Z"));

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.daily.total).toBe(3);
    expect(dashboard.daily.completed).toBe(1);
    expect(dashboard.daily.percent).toBe(33);
  });

  it("counts unscheduled work finished today", async () => {
    // Ad-hoc tasks with no due date should still count towards the day.
    const adHoc = await createTestTask(user.id, { dueDate: null });
    await completeTask(user.id, adHoc.id, "UTC", at("2026-09-20T09:00:00Z"));

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.daily.total).toBe(1);
    expect(dashboard.daily.completed).toBe(1);
    expect(dashboard.daily.percent).toBe(100);
  });

  it("reports XP earned today", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, "UTC", at("2026-09-20T09:00:00Z"));

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.daily.xpEarnedToday).toBe(40);
  });

  it("separates overdue, today and upcoming", async () => {
    await createTestTask(user.id, { title: "Late", dueDate: new Date("2026-09-18T00:00:00Z") });
    await createTestTask(user.id, { title: "Now", dueDate: new Date("2026-09-20T00:00:00Z") });
    await createTestTask(user.id, { title: "Soon", dueDate: new Date("2026-09-22T00:00:00Z") });
    await createTestTask(user.id, { title: "Far", dueDate: new Date("2026-12-01T00:00:00Z") });

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.overdueTasks.map((t) => t.title)).toEqual(["Late"]);
    expect(dashboard.todayTasks.map((t) => t.title)).toEqual(["Now"]);
    expect(dashboard.upcomingTasks.map((t) => t.title)).toEqual(["Soon"]);
    // "Far" is beyond the upcoming window but still counted as open work.
    expect(dashboard.totalOpenTasks).toBe(4);
  });

  it("surfaces only high-stakes work as deadlines", async () => {
    await createTestTask(user.id, { title: "Chore", priority: "LOW", dueDate: new Date("2026-09-21T00:00:00Z") });
    await createTestTask(user.id, { title: "English project", priority: "URGENT", dueDate: new Date("2026-09-21T00:00:00Z") });

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.deadlines.map((t) => t.title)).toEqual(["English project"]);
  });

  it("shows the streak as stale rather than rewriting it on read", async () => {
    const task = await createTestTask(user.id);
    await completeTask(user.id, task.id, "UTC", at("2026-09-10T10:00:00Z"));

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.streak.current).toBe(0);

    // The stored row is untouched — reading a page is not an event.
    expect((await getStats(user.id)).currentStreak).toBe(1);
  });

  it("flags a streak that will break today", async () => {
    const task = await createTestTask(user.id);
    await completeTask(user.id, task.id, "UTC", at("2026-09-19T10:00:00Z"));

    const dashboard = await getDashboardData(user.id, "UTC", at("2026-09-20T12:00:00Z"));
    expect(dashboard.streak.current).toBe(1);
    expect(dashboard.streak.atRisk).toBe(true);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { localDateToDbDate, localDateTimeToInstant } from "@/lib/datetime";
import { getTodayData } from "@/lib/today/queries";
import {
  createTestGoal,
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Today is a query, not a record. These tests assert that a day is exactly
 * what the `dueDate` column says it is — and that nothing on the page is
 * stored anywhere, so a task moves days the moment its own date changes.
 */
const d = localDateToDbDate;
const TODAY = "2026-09-21";

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

const load = (selected = TODAY, timezone = "UTC") =>
  getTodayData(user.id, timezone, selected, TODAY);

describe("the selected day", () => {
  it("returns the day's tasks, completed or not", async () => {
    await createTestTask(user.id, { title: "Open", dueDate: d(TODAY) });
    await createTestTask(user.id, { title: "Done", dueDate: d(TODAY), completed: true });
    await createTestTask(user.id, { title: "Tomorrow", dueDate: d("2026-09-22") });

    const data = await load();

    expect(data.sections.allDay.map((t) => t.title)).toEqual(["Open"]);
    expect(data.sections.completed.map((t) => t.title)).toEqual(["Done"]);
    expect(data.progress).toMatchObject({ total: 2, completed: 1, percent: 50 });
  });

  it("splits timed work from all-day work, in clock order", async () => {
    await createTestTask(user.id, { title: "All day", dueDate: d(TODAY) });
    await createTestTask(user.id, { title: "Evening", dueDate: d(TODAY), dueTime: "18:00" });
    await createTestTask(user.id, { title: "Morning", dueDate: d(TODAY), dueTime: "09:00" });
    await createTestTask(user.id, { title: "Midday", dueDate: d(TODAY), dueTime: "11:30" });

    const { sections } = await load();

    expect(sections.timed.map((t) => t.dueTime)).toEqual(["09:00", "11:30", "18:00"]);
    expect(sections.allDay.map((t) => t.title)).toEqual(["All day"]);
  });

  it("never includes a dateless task in the day", async () => {
    await createTestTask(user.id, { title: "Someday" });

    const data = await load();

    expect(data.sections.timed).toHaveLength(0);
    expect(data.sections.allDay).toHaveLength(0);
    expect(data.progress.total).toBe(0);
    expect(data.unscheduled.tasks.map((t) => t.title)).toEqual(["Someday"]);
  });

  it("does not count overdue or unscheduled work in the day's progress", async () => {
    await createTestTask(user.id, { title: "Today", dueDate: d(TODAY) });
    await createTestTask(user.id, { title: "Late", dueDate: d("2026-09-10") });
    await createTestTask(user.id, { title: "Someday" });

    const data = await load();

    expect(data.progress.total).toBe(1);
    expect(data.overdue.total).toBe(1);
    expect(data.unscheduled.total).toBe(1);
  });
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("overdue", () => {
  it("is outstanding work from before the real current date", async () => {
    await createTestTask(user.id, { title: "Two days late", dueDate: d("2026-09-19") });
    await createTestTask(user.id, { title: "Yesterday", dueDate: d("2026-09-20") });
    await createTestTask(user.id, { title: "Today", dueDate: d(TODAY) });

    const { overdue } = await load();

    // Oldest miss first.
    expect(overdue.tasks.map((t) => t.title)).toEqual(["Two days late", "Yesterday"]);
    expect(overdue.tasks.every((t) => t.isOverdue)).toBe(true);
  });

  it("drops a task the moment it is completed", async () => {
    const task = await createTestTask(user.id, { title: "Late", dueDate: d("2026-09-19") });
    expect((await load()).overdue.total).toBe(1);

    await db.task.update({
      where: { id: task.id },
      data: { completed: true, completedAt: new Date() },
    });

    expect((await load()).overdue.total).toBe(0);
  });

  it("never includes a future task, whatever day is being viewed", async () => {
    await createTestTask(user.id, { title: "Next week", dueDate: d("2026-09-28") });

    for (const selected of ["2026-09-01", TODAY, "2026-10-15"]) {
      const data = await load(selected);
      expect(data.overdue.tasks).toEqual([]);
    }
  });

  it("stays relative to the real current date on a future day", async () => {
    await createTestTask(user.id, { title: "Late", dueDate: d("2026-09-19") });
    await createTestTask(user.id, { title: "That day", dueDate: d("2026-09-25") });

    const data = await load("2026-09-25");

    expect(data.overdue.tasks.map((t) => t.title)).toEqual(["Late"]);
    expect(data.sections.allDay.map((t) => t.title)).toEqual(["That day"]);
    // The task on the day being planned is not late and must not say so.
    expect(data.sections.allDay[0]?.isOverdue).toBe(false);
  });

  it("does not repeat the viewed day's own tasks in the overdue list", async () => {
    await createTestTask(user.id, { title: "Missed", dueDate: d("2026-09-18") });
    await createTestTask(user.id, { title: "Also missed", dueDate: d("2026-09-19") });

    const data = await load("2026-09-18");

    // A task belongs to exactly one section of the page.
    expect(data.sections.allDay.map((t) => t.title)).toEqual(["Missed"]);
    expect(data.overdue.tasks.map((t) => t.title)).toEqual(["Also missed"]);
  });

  it("reports the true total when the list is capped", async () => {
    for (let i = 0; i < 55; i += 1) {
      await createTestTask(user.id, { title: `Late ${i}`, dueDate: d("2026-09-01") });
    }

    const { overdue } = await load();

    expect(overdue.tasks).toHaveLength(50);
    expect(overdue.total).toBe(55);
    expect(overdue.truncated).toBe(true);
  });
});

describe("historical and future days", () => {
  beforeEach(async () => {
    await createTestTask(user.id, {
      title: "Reviewed day open",
      dueDate: d("2026-09-18"),
    });
    await createTestTask(user.id, {
      title: "Reviewed day done",
      dueDate: d("2026-09-18"),
      completed: true,
      completedAt: new Date("2026-09-18T12:00:00.000Z"),
    });
  });

  it("renders a past day from its own tasks", async () => {
    const data = await load("2026-09-18");

    expect(data.relation).toBe("past");
    expect(data.progress).toMatchObject({ total: 2, completed: 1, percent: 50 });
    expect(data.sections.completed.map((t) => t.title)).toEqual(["Reviewed day done"]);
  });

  it("is deterministic — the same day reads the same way every time", async () => {
    const first = await load("2026-09-18");
    const second = await load("2026-09-18");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("names how the viewed day relates to now", async () => {
    expect((await load(TODAY)).relation).toBe("today");
    expect((await load("2026-09-18")).relation).toBe("past");
    expect((await load("2026-09-30")).relation).toBe("future");
  });

  it("returns an empty, working day for a date with nothing on it", async () => {
    const data = await load("2026-11-11");

    expect(data.sections).toEqual({ timed: [], allDay: [], completed: [] });
    expect(data.progress).toMatchObject({ total: 0, percent: 0, isEmpty: true });
    expect(data.workload.isEmpty).toBe(true);
  });
});

describe("workload", () => {
  it("adds up the day's estimates and splits done from remaining", async () => {
    await createTestTask(user.id, { title: "A", dueDate: d(TODAY), estimatedMinutes: 30 });
    await createTestTask(user.id, { title: "B", dueDate: d(TODAY), estimatedMinutes: 45 });
    await createTestTask(user.id, {
      title: "C",
      dueDate: d(TODAY),
      estimatedMinutes: 20,
      completed: true,
    });

    const { workload } = await load();

    expect(workload).toMatchObject({
      planned: 95,
      completed: 20,
      remaining: 75,
      estimated: 3,
      unestimated: 0,
    });
  });

  it("counts unestimated tasks rather than inventing a figure", async () => {
    await createTestTask(user.id, { title: "A", dueDate: d(TODAY), estimatedMinutes: 60 });
    await createTestTask(user.id, { title: "B", dueDate: d(TODAY) });

    const { workload } = await load();

    expect(workload.planned).toBe(60);
    expect(workload.unestimated).toBe(1);
  });

  it("ignores estimates on other days", async () => {
    await createTestTask(user.id, {
      title: "Tomorrow",
      dueDate: d("2026-09-22"),
      estimatedMinutes: 500,
    });

    expect((await load()).workload.planned).toBe(0);
  });
});

describe("XP earned on the day", () => {
  it("reads the existing ledger rather than recomputing anything", async () => {
    const task = await createTestTask(user.id, { title: "A", dueDate: d(TODAY) });
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        taskId: task.id,
        amount: 40,
        cycle: 0,
        createdAt: localDateTimeToInstant(TODAY, "10:00", "UTC"),
      },
    });

    expect((await load()).xpEarned).toBe(40);
  });

  it("counts only the selected day's ledger rows", async () => {
    const task = await createTestTask(user.id, { title: "A", dueDate: d(TODAY) });
    const other = await createTestTask(user.id, { title: "B", dueDate: d("2026-09-20") });
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        taskId: task.id,
        amount: 40,
        cycle: 0,
        createdAt: localDateTimeToInstant(TODAY, "23:59", "UTC"),
      },
    });
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        taskId: other.id,
        amount: 100,
        cycle: 0,
        createdAt: localDateTimeToInstant("2026-09-20", "23:59", "UTC"),
      },
    });

    expect((await load(TODAY)).xpEarned).toBe(40);
    expect((await load("2026-09-20")).xpEarned).toBe(100);
  });

  it("nets off a reversal, because the ledger is signed", async () => {
    const task = await createTestTask(user.id, { title: "A", dueDate: d(TODAY) });
    await db.xpTransaction.createMany({
      data: [
        {
          userId: user.id,
          taskId: task.id,
          amount: 40,
          kind: "AWARD",
          cycle: 0,
          createdAt: localDateTimeToInstant(TODAY, "10:00", "UTC"),
        },
        {
          userId: user.id,
          taskId: task.id,
          amount: -40,
          kind: "REVERSAL",
          cycle: 0,
          createdAt: localDateTimeToInstant(TODAY, "11:00", "UTC"),
        },
      ],
    });

    expect((await load()).xpEarned).toBe(0);
  });

  it("resolves the day window in the user's timezone, not the server's", async () => {
    const kolkata = await createTestUser({ timezone: "Asia/Kolkata" });
    const task = await createTestTask(kolkata.id, { title: "A", dueDate: d(TODAY) });
    // 20:00 UTC on the 20th is 01:30 on the 21st in Kolkata — the same instant
    // belongs to different days depending on who is asking.
    await db.xpTransaction.create({
      data: {
        userId: kolkata.id,
        taskId: task.id,
        amount: 25,
        cycle: 0,
        createdAt: new Date("2026-09-20T20:00:00.000Z"),
      },
    });

    const inKolkata = await getTodayData(kolkata.id, "Asia/Kolkata", TODAY, TODAY);
    const inUtc = await getTodayData(kolkata.id, "UTC", TODAY, TODAY);

    expect(inKolkata.xpEarned).toBe(25);
    expect(inUtc.xpEarned).toBe(0);
  });
});

describe("ad-hoc work finished on the day", () => {
  it("is listed separately and does not change the day's denominator", async () => {
    await createTestTask(user.id, { title: "Planned", dueDate: d(TODAY) });
    await createTestTask(user.id, {
      title: "Ad hoc",
      dueDate: d("2026-09-10"),
      completed: true,
      completedAt: localDateTimeToInstant(TODAY, "14:00", "UTC"),
    });

    const data = await load();

    expect(data.progress.total).toBe(1);
    expect(data.alsoCompleted.tasks.map((t) => t.title)).toEqual(["Ad hoc"]);
    // It is finished, so it is not overdue either.
    expect(data.overdue.total).toBe(0);
  });

  it("includes a dateless task finished on the day", async () => {
    // `NOT: { dueDate: X }` would drop this row: in SQL `NOT (NULL = x)` is
    // NULL, not true. Without the explicit null branch the task appears in no
    // section at all — not in unscheduled, because it is done.
    await createTestTask(user.id, {
      title: "Someday, done today",
      completed: true,
      completedAt: localDateTimeToInstant(TODAY, "11:00", "UTC"),
    });

    const data = await load();

    expect(data.alsoCompleted.tasks.map((t) => t.title)).toEqual(["Someday, done today"]);
    expect(data.unscheduled.total).toBe(0);
    // It has no date, so it cannot count towards a day's plan.
    expect(data.progress.total).toBe(0);
  });

  it("does not repeat a task already in the day section", async () => {
    await createTestTask(user.id, {
      title: "Planned and done",
      dueDate: d(TODAY),
      completed: true,
      completedAt: localDateTimeToInstant(TODAY, "09:00", "UTC"),
    });

    const data = await load();

    expect(data.sections.completed.map((t) => t.title)).toEqual(["Planned and done"]);
    expect(data.alsoCompleted.tasks).toEqual([]);
  });
});

describe("a capped day still reports honestly", () => {
  it("counts progress and workload over the whole day, not the loaded rows", async () => {
    // One more than the 200-row list cap. Progress and workload come from
    // aggregates, so the cap bounds the read without changing the figures.
    for (let i = 0; i < 201; i += 1) {
      await createTestTask(user.id, {
        title: `Bulk ${i}`,
        dueDate: d(TODAY),
        estimatedMinutes: 10,
        completed: i < 50,
      });
    }

    const data = await load();

    expect(data.progress.total).toBe(201);
    expect(data.progress.completed).toBe(50);
    expect(data.workload.planned).toBe(2010);
    expect(data.workload.completed).toBe(500);
    expect(data.dayTruncated).toBe(true);
    // The rendered list is still bounded.
    const shown = data.sections.timed.length + data.sections.allDay.length + data.sections.completed.length;
    expect(shown).toBe(200);
  });

  it("is not truncated for an ordinary day", async () => {
    await createTestTask(user.id, { title: "One", dueDate: d(TODAY) });
    expect((await load()).dayTruncated).toBe(false);
  });

  it("ignores a zero or negative estimate exactly as the pure rule does", async () => {
    await createTestTask(user.id, { title: "Real", dueDate: d(TODAY), estimatedMinutes: 30 });
    await createTestTask(user.id, { title: "Zero", dueDate: d(TODAY), estimatedMinutes: 0 });
    await createTestTask(user.id, { title: "Negative", dueDate: d(TODAY), estimatedMinutes: -60 });

    const { workload } = await load();

    expect(workload.planned).toBe(30);
    expect(workload.estimated).toBe(1);
    expect(workload.unestimated).toBe(2);
  });
});

describe("capped lists are deterministic", () => {
  it("shows the same 50 overdue tasks on every render", async () => {
    // All identical but for the id, so only the final tie-break decides which
    // 50 are shown. Without it the page could differ between two loads.
    for (let i = 0; i < 60; i += 1) {
      await createTestTask(user.id, { title: `Tie ${i}`, dueDate: d("2026-09-01") });
    }

    const first = (await load()).overdue.tasks.map((t) => t.id);
    const second = (await load()).overdue.tasks.map((t) => t.id);

    expect(first).toHaveLength(50);
    expect(second).toEqual(first);
  });
});

describe("previews", () => {
  it("looks forward from the day being viewed, capped with a true total", async () => {
    for (let i = 1; i <= 9; i += 1) {
      await createTestTask(user.id, {
        title: `Day +${i}`,
        dueDate: d(`2026-09-${String(21 + i).padStart(2, "0")}`),
      });
    }

    const { upcoming } = await load();

    expect(upcoming.tasks).toHaveLength(5);
    expect(upcoming.tasks.map((t) => t.title)).toEqual([
      "Day +1",
      "Day +2",
      "Day +3",
      "Day +4",
      "Day +5",
    ]);
    // Bounded to a week, so the two beyond it are not counted either.
    expect(upcoming.total).toBe(7);
  });

  it("never previews a day that has already gone", async () => {
    await createTestTask(user.id, { title: "Day before today", dueDate: d("2026-09-20") });

    // Reviewing the 18th: the 20th is after it, but it is not "coming up".
    const data = await load("2026-09-18");

    expect(data.upcoming.tasks).toEqual([]);
    expect(data.overdue.tasks.map((t) => t.title)).toEqual(["Day before today"]);
  });

  it("lists unscheduled work oldest first, capped", async () => {
    for (let i = 0; i < 7; i += 1) {
      await createTestTask(user.id, { title: `Someday ${i}` });
    }

    const { unscheduled } = await load();

    expect(unscheduled.tasks).toHaveLength(5);
    expect(unscheduled.total).toBe(7);
    expect(unscheduled.truncated).toBe(true);
    expect(unscheduled.tasks.every((t) => t.isOverdue === false)).toBe(true);
  });

  it("does not list completed unscheduled work", async () => {
    await createTestTask(user.id, { title: "Done someday", completed: true });

    expect((await load()).unscheduled.total).toBe(0);
  });
});

describe("context", () => {
  it("carries project, milestone and goal without a query per row", async () => {
    const goal = await createTestGoal(user.id, { title: "Get into MIT" });
    const project = await createTestProject(user.id, {
      name: "SAT prep",
      color: "cyan",
      goalId: goal.id,
    });
    const milestone = await createTestMilestone(project.id, { title: "Maths" });
    await createTestTask(user.id, {
      title: "Algebra drills",
      dueDate: d(TODAY),
      projectId: project.id,
      milestoneId: milestone.id,
    });

    const task = (await load()).sections.allDay[0];

    expect(task?.project).toMatchObject({ id: project.id, name: "SAT prep", color: "cyan" });
    expect(task?.project?.goal).toMatchObject({ id: goal.id, title: "Get into MIT" });
    expect(task?.milestone).toMatchObject({ id: milestone.id, title: "Maths" });
  });

  it("leaves context null for a loose task rather than inventing one", async () => {
    await createTestTask(user.id, { title: "Loose", dueDate: d(TODAY) });

    const task = (await load()).sections.allDay[0];

    expect(task?.project).toBeNull();
    expect(task?.milestone).toBeNull();
  });

  it("reports no goal for a project that serves none", async () => {
    const project = await createTestProject(user.id, { name: "Standalone" });
    await createTestTask(user.id, { title: "T", dueDate: d(TODAY), projectId: project.id });

    expect((await load()).sections.allDay[0]?.project?.goal).toBeNull();
  });
});

describe("dates and timezones", () => {
  it("never shifts a day, at either end of the year", async () => {
    for (const date of ["2026-01-01", "2026-12-31"]) {
      await createTestTask(user.id, { title: date, dueDate: d(date) });
      const data = await getTodayData(user.id, "UTC", date, date);
      expect(data.sections.allDay.map((t) => t.dueDate)).toEqual([date]);
    }
  });

  it("gives the same day's tasks whatever the user's timezone", async () => {
    await createTestTask(user.id, { title: "T", dueDate: d(TODAY), dueTime: "23:30" });

    for (const timezone of ["UTC", "Asia/Kolkata", "Pacific/Kiritimati", "America/Los_Angeles"]) {
      const data = await getTodayData(user.id, timezone, TODAY, TODAY);
      expect(data.sections.timed.map((t) => [t.dueDate, t.dueTime])).toEqual([
        [TODAY, "23:30"],
      ]);
    }
  });

  it("reads a wall-clock time back exactly, with no UTC round trip", async () => {
    for (const time of ["00:00", "09:00", "12:30", "23:59"]) {
      await createTestTask(user.id, { title: time, dueDate: d(TODAY), dueTime: time });
    }

    const data = await getTodayData(user.id, "Asia/Kolkata", TODAY, TODAY);

    expect(data.sections.timed.map((t) => t.dueTime)).toEqual([
      "00:00",
      "09:00",
      "12:30",
      "23:59",
    ]);
  });
});

describe("agreement with the task table", () => {
  it("moves a task between days the moment its own date changes", async () => {
    const task = await createTestTask(user.id, { title: "Moves", dueDate: d(TODAY) });

    expect((await load()).progress.total).toBe(1);

    // The only write is to the task. There is no day record to keep in sync.
    await db.task.update({ where: { id: task.id }, data: { dueDate: d("2026-09-25") } });

    expect((await load()).progress.total).toBe(0);
    expect((await load("2026-09-25")).progress.total).toBe(1);
  });

  it("drops a task from every day when its date is cleared", async () => {
    const task = await createTestTask(user.id, { title: "Unscheduled now", dueDate: d(TODAY) });
    await db.task.update({ where: { id: task.id }, data: { dueDate: null } });

    const data = await load();

    expect(data.progress.total).toBe(0);
    expect(data.unscheduled.tasks.map((t) => t.title)).toEqual(["Unscheduled now"]);
  });

  it("reflects completion written by the existing task service", async () => {
    const { setTaskCompletion } = await import("@/lib/tasks/service");
    const task = await createTestTask(user.id, {
      title: "Finish me",
      dueDate: d(TODAY),
      xpReward: 30,
    });

    await setTaskCompletion(user.id, task.id, true, "UTC");

    const data = await load();

    expect(data.sections.completed.map((t) => t.title)).toEqual(["Finish me"]);
    expect(data.progress).toMatchObject({ total: 1, completed: 1, percent: 100 });
    // XP came from the existing ledger write, not from anything Today did.
    expect(data.xpEarned).toBe(30);
  });
});

describe("streak", () => {
  it("reuses the existing streak state rather than recomputing it", async () => {
    await db.userStats.update({
      where: { userId: user.id },
      data: { currentStreak: 6, longestStreak: 9, lastCompletedDate: TODAY },
    });

    const data = await load();

    expect(data.streak.current).toBe(6);
    expect(data.streak.atRisk).toBe(false);
  });

  it("reports a streak at risk exactly as the streak module does", async () => {
    await db.userStats.update({
      where: { userId: user.id },
      data: { currentStreak: 3, longestStreak: 9, lastCompletedDate: "2026-09-20" },
    });

    const data = await load();

    expect(data.streak.current).toBe(3);
    expect(data.streak.atRisk).toBe(true);
  });
});

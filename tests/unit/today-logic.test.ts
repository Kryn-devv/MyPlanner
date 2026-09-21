import { describe, expect, it } from "vitest";
import {
  bucketTasks,
  deriveDayFocus,
  calculateDailyProgress,
  calculateWorkload,
  classifyTask,
  compareTodayTasks,
  getDayRelation,
  isTaskOverdue,
  sortTodayTasks,
  splitDaySections,
} from "@/lib/today/logic";
import type { TodayTask } from "@/lib/today/types";

const TODAY = "2026-09-21";

function task(overrides: Partial<TodayTask> & { id: string }): TodayTask {
  return {
    title: overrides.id,
    description: null,
    completed: false,
    priority: "MEDIUM",
    categoryId: null,
    category: null,
    dueDate: TODAY,
    dueTime: null,
    estimatedMinutes: null,
    xpReward: 20,
    completedAt: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    projectId: null,
    project: null,
    milestoneId: null,
    milestone: null,
    isOverdue: false,
    ...overrides,
  };
}

const viewing = (selectedDate: string) => ({ today: TODAY, selectedDate });

describe("classification", () => {
  const context = viewing(TODAY);

  it("puts a task dated today in the day bucket", () => {
    expect(classifyTask(task({ id: "a" }), context)).toBe("day");
  });

  it("puts an outstanding task from a previous day in overdue", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-20" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2020-01-01" }), context)).toBe("overdue");
  });

  it("puts a later task in upcoming and never calls it overdue", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-22" }), context)).toBe("upcoming");
    expect(classifyTask(task({ id: "b", dueDate: "2027-01-01" }), context)).toBe("upcoming");
  });

  it("puts a dateless task in unscheduled, never in overdue", () => {
    expect(classifyTask(task({ id: "a", dueDate: null }), context)).toBe("unscheduled");
    // However old the row is: never committing to a day is not being late.
    expect(
      classifyTask(task({ id: "b", dueDate: null, createdAt: "2019-01-01T00:00:00.000Z" }), context),
    ).toBe("unscheduled");
  });

  it("keeps a completed overdue task out of the active overdue section", () => {
    const done = task({ id: "a", dueDate: "2026-09-10", completed: true });
    expect(classifyTask(done, context)).toBe("other");
    expect(isTaskOverdue(done, TODAY)).toBe(false);
  });

  it("keeps a completed task dated today in the day bucket", () => {
    expect(classifyTask(task({ id: "a", completed: true }), context)).toBe("day");
  });
});

describe("classification on a historical day", () => {
  const context = viewing("2026-09-18");

  it("shows that day's work as the day bucket, completed or not", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-18" }), context)).toBe("day");
    expect(classifyTask(task({ id: "b", dueDate: "2026-09-18", completed: true }), context)).toBe(
      "day",
    );
  });

  it("never lists the viewed day's own tasks as overdue as well — one bucket each", () => {
    const missed = task({ id: "a", dueDate: "2026-09-18" });
    // It is genuinely overdue as of today, but the day being viewed owns it,
    // so it appears once rather than in two places on one page.
    expect(isTaskOverdue(missed, TODAY)).toBe(true);
    expect(classifyTask(missed, context)).toBe("day");
  });

  it("still reports outstanding work from other past days as overdue", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-19" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2026-09-17" }), context)).toBe("overdue");
  });

  it("does not demote a genuinely overdue task to 'upcoming' just because it is after the viewed day", () => {
    // 19 Sept is after the day being reviewed but before today: it is late,
    // and calling it upcoming would be wrong.
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-19" }), context)).toBe("overdue");
  });

  it("files work completed on some other past day as neither", () => {
    // After the day under review, but already behind us — not "upcoming".
    expect(
      classifyTask(task({ id: "a", dueDate: "2026-09-19", completed: true }), context),
    ).toBe("other");
  });

  it("only previews work that is genuinely still ahead", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-25" }), context)).toBe("upcoming");
  });
});

describe("classification on a future day", () => {
  const context = viewing("2026-09-25");

  it("never labels a future task overdue", () => {
    for (const date of ["2026-09-22", "2026-09-25", "2026-12-31"]) {
      const entry = task({ id: date, dueDate: date });
      expect(isTaskOverdue(entry, TODAY)).toBe(false);
      expect(classifyTask(entry, context)).not.toBe("overdue");
    }
  });

  it("still surfaces work that is late as of the real today", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-19" }), context)).toBe("overdue");
  });

  it("leaves the days between now and the viewed day to their own pages", () => {
    // Viewing the 25th: the 23rd is neither this day's work nor after it.
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-23" }), context)).toBe("other");
    expect(
      classifyTask(task({ id: "b", dueDate: "2026-09-23", completed: true }), context),
    ).toBe("other");
  });

  it("previews only what actually follows the viewed day", () => {
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-26" }), context)).toBe("upcoming");
  });
});

describe("overdue is measured against the real current date", () => {
  it("gives the same answer whichever day is being viewed", () => {
    const late = task({ id: "a", dueDate: "2026-09-15" });
    for (const selected of ["2026-09-01", "2026-09-21", "2026-10-01"]) {
      expect(isTaskOverdue(late, TODAY)).toBe(true);
      expect(getDayRelation(viewing(selected))).toBeTruthy();
    }
  });

  it("is false on the due date itself — a deadline today is not missed", () => {
    expect(isTaskOverdue(task({ id: "a", dueDate: TODAY }), TODAY)).toBe(false);
  });

  it("names how the viewed day relates to now", () => {
    expect(getDayRelation(viewing(TODAY))).toBe("today");
    expect(getDayRelation(viewing("2026-09-20"))).toBe("past");
    expect(getDayRelation(viewing("2026-09-22"))).toBe("future");
  });
});

describe("date boundaries", () => {
  it("handles month ends", () => {
    const context = { today: "2026-10-01", selectedDate: "2026-10-01" };
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-30" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2026-10-01" }), context)).toBe("day");
    expect(classifyTask(task({ id: "c", dueDate: "2026-10-02" }), context)).toBe("upcoming");
  });

  it("handles year ends", () => {
    const context = { today: "2027-01-01", selectedDate: "2027-01-01" };
    expect(classifyTask(task({ id: "a", dueDate: "2026-12-31" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2027-01-01" }), context)).toBe("day");
  });

  it("handles a leap day", () => {
    const context = { today: "2024-02-29", selectedDate: "2024-02-29" };
    expect(classifyTask(task({ id: "a", dueDate: "2024-02-28" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2024-02-29" }), context)).toBe("day");
    expect(classifyTask(task({ id: "c", dueDate: "2024-03-01" }), context)).toBe("upcoming");
  });

  it("compares as calendar days, not as strings that happen to sort", () => {
    // "2026-09-9" would break lexicographic comparison; the date layer never
    // produces it, and this pins the zero-padded form the rest relies on.
    const context = { today: "2026-09-10", selectedDate: "2026-09-10" };
    expect(classifyTask(task({ id: "a", dueDate: "2026-09-09" }), context)).toBe("overdue");
    expect(classifyTask(task({ id: "b", dueDate: "2026-09-11" }), context)).toBe("upcoming");
  });
});

describe("ordering", () => {
  it("puts outstanding work before finished work", () => {
    const sorted = sortTodayTasks([
      task({ id: "done", completed: true, dueTime: "08:00" }),
      task({ id: "open" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["open", "done"]);
  });

  it("orders timed tasks chronologically", () => {
    const sorted = sortTodayTasks([
      task({ id: "18:00", dueTime: "18:00" }),
      task({ id: "09:00", dueTime: "09:00" }),
      task({ id: "15:00", dueTime: "15:00" }),
      task({ id: "11:30", dueTime: "11:30" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["09:00", "11:30", "15:00", "18:00"]);
  });

  it("puts every timed task before every all-day task", () => {
    const sorted = sortTodayTasks([
      task({ id: "allday-urgent", priority: "URGENT" }),
      task({ id: "timed-low", dueTime: "23:59", priority: "LOW" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["timed-low", "allday-urgent"]);
  });

  it("orders all-day tasks by priority", () => {
    const sorted = sortTodayTasks([
      task({ id: "low", priority: "LOW" }),
      task({ id: "urgent", priority: "URGENT" }),
      task({ id: "medium", priority: "MEDIUM" }),
      task({ id: "high", priority: "HIGH" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["urgent", "high", "medium", "low"]);
  });

  it("puts the oldest deadline first across days", () => {
    const sorted = sortTodayTasks([
      task({ id: "yesterday", dueDate: "2026-09-20" }),
      task({ id: "last-week", dueDate: "2026-09-14" }),
      task({ id: "undated", dueDate: null }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["last-week", "yesterday", "undated"]);
  });

  it("breaks a priority tie by age, oldest first", () => {
    const sorted = sortTodayTasks([
      task({ id: "newer", createdAt: "2026-09-10T00:00:00.000Z" }),
      task({ id: "older", createdAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["older", "newer"]);
  });

  it("orders two tasks at the same time deterministically", () => {
    const sorted = sortTodayTasks([
      task({ id: "b", dueTime: "09:00", title: "B" }),
      task({ id: "a", dueTime: "09:00", title: "A" }),
    ]);
    // Same time, same priority, same createdAt — the id is the final, stable
    // tie-break, so the order cannot vary between renders.
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("is reflexive, antisymmetric and total", () => {
    const a = task({ id: "a" });
    const b = task({ id: "b" });
    expect(compareTodayTasks(a, a)).toBe(0);
    expect(compareTodayTasks(a, b)).toBeLessThan(0);
    expect(compareTodayTasks(b, a)).toBeGreaterThan(0);
  });

  it("produces the same order however the input is shuffled", () => {
    const input = [
      task({ id: "1", dueTime: "09:00" }),
      task({ id: "2", priority: "URGENT" }),
      task({ id: "3", completed: true }),
      task({ id: "4", dueTime: "09:00", priority: "HIGH" }),
      task({ id: "5" }),
    ];
    const expected = sortTodayTasks(input).map((entry) => entry.id);
    expect(sortTodayTasks([...input].reverse()).map((entry) => entry.id)).toEqual(expected);
    expect(sortTodayTasks([input[2]!, input[4]!, input[0]!, input[3]!, input[1]!]).map((e) => e.id))
      .toEqual(expected);
  });

  it("does not mutate its input", () => {
    const input = [task({ id: "z" }), task({ id: "a" })];
    const copy = [...input];
    sortTodayTasks(input);
    expect(input).toEqual(copy);
  });
});

describe("day sections", () => {
  it("splits a day into timed, all-day and completed", () => {
    const sections = splitDaySections([
      task({ id: "done", completed: true }),
      task({ id: "allday" }),
      task({ id: "timed", dueTime: "09:00" }),
      task({ id: "done-timed", completed: true, dueTime: "07:00" }),
    ]);
    expect(sections.timed.map((entry) => entry.id)).toEqual(["timed"]);
    expect(sections.allDay.map((entry) => entry.id)).toEqual(["allday"]);
    // Finished work is history, so it leaves the queue whether it was timed
    // or not.
    expect(sections.completed.map((entry) => entry.id)).toEqual(["done-timed", "done"]);
  });

  it("handles a day with nothing on it", () => {
    expect(splitDaySections([])).toEqual({ timed: [], allDay: [], completed: [] });
  });

  it("places every task in exactly one section", () => {
    const tasks = [
      task({ id: "a", dueTime: "09:00" }),
      task({ id: "b" }),
      task({ id: "c", completed: true }),
    ];
    const sections = splitDaySections(tasks);
    const all = [...sections.timed, ...sections.allDay, ...sections.completed];
    expect(all).toHaveLength(tasks.length);
    expect(new Set(all.map((entry) => entry.id)).size).toBe(tasks.length);
  });
});

describe("daily progress", () => {
  it("counts completed against scheduled", () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task({ id: `done${i}`, completed: true })),
      ...Array.from({ length: 4 }, (_, i) => task({ id: `open${i}` })),
    ];
    expect(calculateDailyProgress(tasks)).toEqual({
      total: 10,
      completed: 6,
      remaining: 4,
      percent: 60,
      isEmpty: false,
      isComplete: false,
    });
  });

  it("reports zero rather than NaN for an empty day", () => {
    expect(calculateDailyProgress([])).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      percent: 0,
      isEmpty: true,
      isComplete: false,
    });
  });

  it("recognises a finished day", () => {
    const progress = calculateDailyProgress([task({ id: "a", completed: true })]);
    expect(progress.percent).toBe(100);
    expect(progress.isComplete).toBe(true);
  });

  it("rounds to whole percent", () => {
    const tasks = [task({ id: "a", completed: true }), task({ id: "b" }), task({ id: "c" })];
    expect(calculateDailyProgress(tasks).percent).toBe(33);
  });
});

describe("estimated workload", () => {
  it("adds up the day's estimates", () => {
    const tasks = [
      task({ id: "a", estimatedMinutes: 30 }),
      task({ id: "b", estimatedMinutes: 45 }),
      task({ id: "c", estimatedMinutes: 20 }),
    ];
    expect(calculateWorkload(tasks).planned).toBe(95);
  });

  it("separates completed from remaining", () => {
    const workload = calculateWorkload([
      task({ id: "a", estimatedMinutes: 60, completed: true }),
      task({ id: "b", estimatedMinutes: 90 }),
    ]);
    expect(workload).toEqual({
      planned: 150,
      completed: 60,
      remaining: 90,
      estimated: 2,
      unestimated: 0,
      isEmpty: false,
    });
  });

  it("counts tasks with no estimate rather than guessing one", () => {
    const workload = calculateWorkload([
      task({ id: "a", estimatedMinutes: 30 }),
      task({ id: "b" }),
      task({ id: "c", estimatedMinutes: null }),
    ]);
    expect(workload.planned).toBe(30);
    expect(workload.estimated).toBe(1);
    expect(workload.unestimated).toBe(2);
  });

  it("ignores a zero or negative estimate instead of trusting it", () => {
    const workload = calculateWorkload([
      task({ id: "a", estimatedMinutes: 0 }),
      task({ id: "b", estimatedMinutes: -30 }),
    ]);
    expect(workload.planned).toBe(0);
    expect(workload.estimated).toBe(0);
    expect(workload.unestimated).toBe(2);
    expect(workload.isEmpty).toBe(true);
  });

  it("reports an empty day as zero", () => {
    expect(calculateWorkload([])).toEqual({
      planned: 0,
      completed: 0,
      remaining: 0,
      estimated: 0,
      unestimated: 0,
      isEmpty: true,
    });
  });
});

describe("what the day is for", () => {
  const withGoal = (id: string, goalId: string | null, goalTitle = goalId ?? "") =>
    task({
      id,
      project: goalId
        ? { id: `p-${id}`, name: "P", color: "violet", goal: { id: goalId, title: goalTitle } }
        : { id: `p-${id}`, name: "P", color: "violet", goal: null },
    });

  it("lists each goal once, with how much of the day it accounts for", () => {
    expect(
      deriveDayFocus([
        withGoal("a", "g1", "Get into MIT"),
        withGoal("b", "g1", "Get into MIT"),
        withGoal("c", "g2", "Ship the portfolio"),
      ]),
    ).toEqual([
      { id: "g1", title: "Get into MIT", taskCount: 2 },
      { id: "g2", title: "Ship the portfolio", taskCount: 1 },
    ]);
  });

  it("ignores work that serves no goal", () => {
    expect(deriveDayFocus([task({ id: "loose" }), withGoal("b", null)])).toEqual([]);
  });

  it("orders ties by title so the line never reshuffles", () => {
    const focus = deriveDayFocus([withGoal("a", "g2", "Beta"), withGoal("b", "g1", "Alpha")]);
    expect(focus.map((entry) => entry.title)).toEqual(["Alpha", "Beta"]);
  });

  it("returns nothing for an empty day", () => {
    expect(deriveDayFocus([])).toEqual([]);
  });
});

describe("bucketing a mixed set", () => {
  it("files every task in exactly one bucket", () => {
    const context = viewing(TODAY);
    const tasks = [
      task({ id: "today-open" }),
      task({ id: "today-done", completed: true }),
      task({ id: "late", dueDate: "2026-09-19" }),
      task({ id: "late-done", dueDate: "2026-09-19", completed: true }),
      task({ id: "soon", dueDate: "2026-09-23" }),
      task({ id: "someday", dueDate: null }),
    ];

    const buckets = bucketTasks(tasks, context);

    expect(buckets.day.map((entry) => entry.id)).toEqual(["today-open", "today-done"]);
    expect(buckets.overdue.map((entry) => entry.id)).toEqual(["late"]);
    expect(buckets.upcoming.map((entry) => entry.id)).toEqual(["soon"]);
    expect(buckets.unscheduled.map((entry) => entry.id)).toEqual(["someday"]);
    expect(buckets.other.map((entry) => entry.id)).toEqual(["late-done"]);

    const total = Object.values(buckets).reduce((sum, bucket) => sum + bucket.length, 0);
    expect(total).toBe(tasks.length);
  });

  it("returns every bucket even when empty, so the page never reads undefined", () => {
    const buckets = bucketTasks([], viewing(TODAY));
    expect(Object.keys(buckets).sort()).toEqual([
      "day",
      "other",
      "overdue",
      "unscheduled",
      "upcoming",
    ]);
  });
});

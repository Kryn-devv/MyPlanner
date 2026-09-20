import { describe, expect, it } from "vitest";
import {
  compareCalendarItems,
  countByKind,
  filterByKinds,
  groupItemsByDate,
  isItemOverdue,
  sortCalendarItems,
  summarise,
  toCalendarDays,
  toOccupiedDays,
} from "@/lib/calendar/items";
import type { CalendarItem } from "@/lib/calendar/types";

function item(overrides: Partial<CalendarItem> & { id: string }): CalendarItem {
  return {
    kind: "task",
    anchor: "due",
    sourceId: overrides.id,
    title: overrides.id,
    date: "2026-09-20",
    time: null,
    completed: false,
    priority: null,
    color: null,
    context: null,
    href: "/app/tasks",
    ...overrides,
  };
}

describe("ordering", () => {
  it("puts timed items before all-day ones, earliest first", () => {
    const sorted = sortCalendarItems([
      item({ id: "allday" }),
      item({ id: "late", time: "17:00" }),
      item({ id: "early", time: "09:00" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["early", "late", "allday"]);
  });

  it("puts outstanding work before finished work", () => {
    const sorted = sortCalendarItems([
      item({ id: "done", completed: true }),
      item({ id: "open" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["open", "done"]);
  });

  it("reads the larger commitment first", () => {
    const sorted = sortCalendarItems([
      item({ id: "task", kind: "task" }),
      item({ id: "milestone", kind: "milestone" }),
      item({ id: "goal", kind: "goal" }),
      item({ id: "project", kind: "project" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["goal", "project", "milestone", "task"]);
  });

  it("breaks a kind tie by urgency, then by title", () => {
    const sorted = sortCalendarItems([
      item({ id: "b", title: "B", priority: "LOW" }),
      item({ id: "a", title: "A", priority: "URGENT" }),
      item({ id: "c", title: "C", priority: "LOW" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("orders across days before anything else", () => {
    const sorted = sortCalendarItems([
      item({ id: "tomorrow", date: "2026-09-21", time: "08:00" }),
      item({ id: "today", date: "2026-09-20", time: "23:00" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["today", "tomorrow"]);
  });

  it("is a total order, so equal items never swap between renders", () => {
    const a = item({ id: "a", title: "Same" });
    const b = item({ id: "b", title: "Same" });
    expect(compareCalendarItems(a, b)).toBeLessThan(0);
    expect(compareCalendarItems(b, a)).toBeGreaterThan(0);
    expect(compareCalendarItems(a, a)).toBe(0);
  });

  it("does not mutate its input", () => {
    const input = [item({ id: "z" }), item({ id: "a" })];
    const copy = [...input];
    sortCalendarItems(input);
    expect(input).toEqual(copy);
  });
});

describe("grouping", () => {
  const items = [
    item({ id: "b", date: "2026-09-21" }),
    item({ id: "a1", date: "2026-09-20", time: "09:00" }),
    item({ id: "a2", date: "2026-09-20" }),
  ];

  it("keys items by day with each day sorted", () => {
    const grouped = groupItemsByDate(items);
    expect([...grouped.keys()]).toEqual(["2026-09-20", "2026-09-21"]);
    expect(grouped.get("2026-09-20")?.map((entry) => entry.id)).toEqual(["a1", "a2"]);
  });

  it("keeps empty days when the view asks for them", () => {
    const days = toCalendarDays(["2026-09-19", "2026-09-20", "2026-09-21"], items);
    expect(days.map((day) => day.items.length)).toEqual([0, 2, 1]);
  });

  it("drops empty days when the view does not", () => {
    const days = toOccupiedDays(items);
    expect(days.map((day) => day.date)).toEqual(["2026-09-20", "2026-09-21"]);
  });

  it("handles no items at all", () => {
    expect(groupItemsByDate([]).size).toBe(0);
    expect(toOccupiedDays([])).toEqual([]);
    expect(toCalendarDays(["2026-09-20"], [])).toEqual([{ date: "2026-09-20", items: [] }]);
  });
});

describe("kind filtering", () => {
  const items = [
    item({ id: "t", kind: "task" }),
    item({ id: "m", kind: "milestone" }),
    item({ id: "p", kind: "project" }),
    item({ id: "g", kind: "goal" }),
  ];

  it("keeps only the selected kinds", () => {
    expect(filterByKinds(items, ["task", "goal"]).map((entry) => entry.id)).toEqual(["t", "g"]);
  });

  it("treats an empty or complete selection as no filter", () => {
    expect(filterByKinds(items, [])).toHaveLength(4);
    expect(filterByKinds(items, ["task", "milestone", "project", "goal"])).toHaveLength(4);
  });
});

describe("counting", () => {
  it("counts by kind and by state", () => {
    const summary = summarise([
      item({ id: "1", kind: "task" }),
      item({ id: "2", kind: "task", completed: true }),
      item({ id: "3", kind: "goal" }),
    ]);
    expect(summary).toEqual({
      total: 3,
      open: 2,
      completed: 1,
      byKind: { task: 2, milestone: 0, project: 0, goal: 1 },
    });
  });

  it("returns zeroes rather than gaps for an empty day", () => {
    expect(countByKind([])).toEqual({ task: 0, milestone: 0, project: 0, goal: 0 });
  });
});

describe("overdue", () => {
  const today = "2026-09-20";

  it("is a deadline in the past on outstanding work", () => {
    expect(isItemOverdue(item({ id: "a", date: "2026-09-19" }), today)).toBe(true);
    expect(isItemOverdue(item({ id: "b", date: today }), today)).toBe(false);
    expect(isItemOverdue(item({ id: "c", date: "2026-09-21" }), today)).toBe(false);
  });

  it("never applies to finished work, however old", () => {
    expect(isItemOverdue(item({ id: "d", date: "2020-01-01", completed: true }), today)).toBe(
      false,
    );
  });

  it("never applies to a start date — only a deadline can be missed", () => {
    expect(isItemOverdue(item({ id: "e", date: "2026-01-01", anchor: "start" }), today)).toBe(
      false,
    );
  });
});

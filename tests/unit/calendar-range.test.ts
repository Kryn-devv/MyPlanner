import { describe, expect, it } from "vitest";
import { MAX_RANGE_DAYS, TIMELINE_DAYS, WEEK_STARTS_ON } from "@/config/calendar";
import {
  addMonths,
  daysInMonth,
  eachDay,
  endOfMonth,
  endOfWeek,
  formatRangeLabel,
  formatSpan,
  getMonthGrid,
  getViewRange,
  getWeekDays,
  getWeekdayOrder,
  isQueryableRange,
  isWithinRange,
  normalizeAnchor,
  rangeLength,
  shiftAnchor,
  startOfMonth,
  startOfWeek,
} from "@/lib/calendar/range";

describe("month boundaries", () => {
  it("finds the first and last day of a month", () => {
    expect(startOfMonth("2026-09-20")).toBe("2026-09-01");
    expect(endOfMonth("2026-09-20")).toBe("2026-09-30");
  });

  it("handles February in a leap year and a common year", () => {
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
  });

  it("handles December, where the next month is a new year", () => {
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("addMonths", () => {
  it("clamps rather than rolling over", () => {
    // Date.setUTCMonth would turn this into 3 March, skipping February.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("is a no-op at zero and walks whole years", () => {
    expect(addMonths("2026-09-20", 0)).toBe("2026-09-20");
    expect(addMonths("2026-09-20", 12)).toBe("2027-09-20");
    expect(addMonths("2026-09-20", -12)).toBe("2025-09-20");
  });
});

describe("week boundaries", () => {
  it("starts weeks on Monday", () => {
    expect(WEEK_STARTS_ON).toBe(1);
    // 2026-09-20 is a Sunday, so its week began on the 14th.
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14");
    expect(endOfWeek("2026-09-20")).toBe("2026-09-20");
    // A Monday is its own start.
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14");
    expect(endOfWeek("2026-09-14")).toBe("2026-09-20");
  });

  it("returns seven consecutive days", () => {
    const days = getWeekDays("2026-09-17");
    expect(days).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("crosses a month boundary without breaking", () => {
    expect(getWeekDays("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("orders weekday headings Monday-first", () => {
    expect(getWeekdayOrder()).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("month grid", () => {
  it("is always six rows of seven days", () => {
    for (const anchor of ["2026-02-01", "2026-09-20", "2027-05-31", "2024-02-15"]) {
      const grid = getMonthGrid(anchor);
      expect(grid.weeks).toHaveLength(6);
      for (const week of grid.weeks) expect(week).toHaveLength(7);
    }
  });

  it("starts on the Monday on or before the 1st", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Monday the 31st.
    const grid = getMonthGrid("2026-09-20");
    expect(grid.anchor).toBe("2026-09-01");
    expect(grid.weeks[0]?.[0]?.date).toBe("2026-08-31");
    expect(grid.weeks[0]?.[0]?.inMonth).toBe(false);
    expect(grid.weeks[0]?.[1]?.date).toBe("2026-09-01");
    expect(grid.weeks[0]?.[1]?.inMonth).toBe(true);
  });

  it("marks exactly the month's own days as in-month", () => {
    const grid = getMonthGrid("2026-09-01");
    const inMonth = grid.weeks.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]?.date).toBe("2026-09-01");
    expect(inMonth[29]?.date).toBe("2026-09-30");
  });

  it("produces 42 distinct consecutive days", () => {
    const cells = getMonthGrid("2026-09-20").weeks.flat();
    expect(new Set(cells.map((cell) => cell.date)).size).toBe(42);
    expect(cells.map((cell) => cell.date)).toEqual(
      eachDay({ start: cells[0]!.date, end: cells[41]!.date }),
    );
  });

  it("covers the whole grid in its range, not just the month", () => {
    const grid = getMonthGrid("2026-09-20");
    expect(grid.range.start).toBe("2026-08-31");
    expect(grid.range.end).toBe("2026-10-11");
    expect(rangeLength(grid.range)).toBe(42);
  });

  it("handles a February that starts on a Monday", () => {
    // 1 February 2027 is a Monday — no leading days at all.
    const grid = getMonthGrid("2027-02-10");
    expect(grid.weeks[0]?.[0]?.date).toBe("2027-02-01");
    expect(grid.weeks[0]?.[0]?.inMonth).toBe(true);
  });
});

describe("view ranges", () => {
  it("bounds every view", () => {
    expect(getViewRange("day", "2026-09-20")).toEqual({
      start: "2026-09-20",
      end: "2026-09-20",
    });
    expect(getViewRange("week", "2026-09-20")).toEqual({
      start: "2026-09-14",
      end: "2026-09-20",
    });
    expect(getViewRange("month", "2026-09-20")).toEqual({
      start: "2026-08-31",
      end: "2026-10-11",
    });
    expect(getViewRange("timeline", "2026-09-20")).toEqual({
      start: "2026-09-20",
      end: "2026-10-19",
    });
  });

  it("keeps every view's range small enough to query", () => {
    for (const view of ["day", "week", "month", "timeline"] as const) {
      const range = getViewRange(view, "2026-09-20");
      expect(isQueryableRange(range)).toBe(true);
      expect(rangeLength(range)).toBeLessThanOrEqual(42);
    }
    expect(rangeLength(getViewRange("timeline", "2026-09-20"))).toBe(TIMELINE_DAYS);
  });
});

describe("navigation", () => {
  it("moves by the unit the view is made of", () => {
    expect(shiftAnchor("day", "2026-09-20", 1)).toBe("2026-09-21");
    expect(shiftAnchor("day", "2026-09-20", -1)).toBe("2026-09-19");
    expect(shiftAnchor("week", "2026-09-20", 1)).toBe("2026-09-21");
    expect(shiftAnchor("week", "2026-09-16", 1)).toBe("2026-09-21");
    expect(shiftAnchor("month", "2026-09-20", 1)).toBe("2026-10-01");
    expect(shiftAnchor("month", "2026-09-20", -1)).toBe("2026-08-01");
    expect(shiftAnchor("timeline", "2026-09-20", 1)).toBe("2026-10-20");
  });

  it("round-trips: forward then back returns to the same range", () => {
    for (const view of ["day", "week", "month", "timeline"] as const) {
      const anchor = normalizeAnchor(view, "2026-09-20");
      const there = shiftAnchor(view, anchor, 1);
      expect(shiftAnchor(view, there, -1)).toBe(anchor);
    }
  });

  it("never drifts across twelve months of stepping", () => {
    let anchor = normalizeAnchor("month", "2026-01-15");
    for (let i = 0; i < 12; i += 1) anchor = shiftAnchor("month", anchor, 1);
    expect(anchor).toBe("2027-01-01");
    for (let i = 0; i < 12; i += 1) anchor = shiftAnchor("month", anchor, -1);
    expect(anchor).toBe("2026-01-01");
  });

  it("normalises the anchor so the URL matches what is drawn", () => {
    expect(normalizeAnchor("month", "2026-09-20")).toBe("2026-09-01");
    expect(normalizeAnchor("week", "2026-09-20")).toBe("2026-09-14");
    expect(normalizeAnchor("day", "2026-09-20")).toBe("2026-09-20");
    expect(normalizeAnchor("timeline", "2026-09-20")).toBe("2026-09-20");
  });
});

describe("range helpers", () => {
  const range = { start: "2026-09-14", end: "2026-09-20" };

  it("tests membership inclusively at both ends", () => {
    expect(isWithinRange("2026-09-14", range)).toBe(true);
    expect(isWithinRange("2026-09-20", range)).toBe(true);
    expect(isWithinRange("2026-09-13", range)).toBe(false);
    expect(isWithinRange("2026-09-21", range)).toBe(false);
  });

  it("counts both endpoints", () => {
    expect(rangeLength(range)).toBe(7);
    expect(rangeLength({ start: "2026-09-20", end: "2026-09-20" })).toBe(1);
  });

  it("rejects inverted and oversized ranges", () => {
    expect(isQueryableRange({ start: "2026-09-20", end: "2026-09-19" })).toBe(false);
    expect(isQueryableRange({ start: "2026-01-01", end: "2030-01-01" })).toBe(false);
    expect(isQueryableRange({ start: "2026-01-01", end: "2026-01-01" })).toBe(true);
  });

  it("accepts a range of exactly the maximum length", () => {
    const start = "2026-01-01";
    const days = eachDay({ start, end: "2027-12-31" });
    const last = days[MAX_RANGE_DAYS - 1]!;
    expect(isQueryableRange({ start, end: last })).toBe(true);
    expect(isQueryableRange({ start, end: days[MAX_RANGE_DAYS]! })).toBe(false);
  });

  it("enumerates days in order", () => {
    expect(eachDay({ start: "2026-09-29", end: "2026-10-02" })).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(eachDay({ start: "2026-09-20", end: "2026-09-19" })).toEqual([]);
  });
});

describe("labels", () => {
  it("names a month, a day and a span without Intl", () => {
    expect(formatRangeLabel("month", "2026-09-01")).toBe("September 2026");
    expect(formatRangeLabel("day", "2026-09-20")).toBe("20 September 2026");
    expect(formatRangeLabel("week", "2026-09-14")).toBe("14 – 20 Sep 2026");
    expect(formatRangeLabel("timeline", "2026-09-20")).toBe("20 Sep – 19 Oct 2026");
  });

  it("collapses a span's shared parts and expands what differs", () => {
    expect(formatSpan({ start: "2026-09-14", end: "2026-09-20" })).toBe("14 – 20 Sep 2026");
    expect(formatSpan({ start: "2026-09-28", end: "2026-10-04" })).toBe("28 Sep – 4 Oct 2026");
    expect(formatSpan({ start: "2026-12-28", end: "2027-01-03" })).toBe(
      "28 Dec 2026 – 3 Jan 2027",
    );
    expect(formatSpan({ start: "2026-09-20", end: "2026-09-20" })).toBe("20 Sep 2026");
  });

  it("uses no locale-dependent separators, which is what breaks hydration", () => {
    const labels = [
      formatRangeLabel("month", "2026-09-01"),
      formatRangeLabel("week", "2026-09-14"),
      formatRangeLabel("day", "2026-09-20"),
    ];
    // Narrow no-break space and comma are how ICU versions differ from
    // each other; either one appearing means a locale formatter leaked in.
    for (const label of labels) expect(label).not.toMatch(/[,  ]/);
  });
});

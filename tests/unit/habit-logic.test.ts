import { describe, expect, it } from "vitest";
import { HABIT_HISTORY_DAYS } from "@/config/habits";
import { addDays } from "@/lib/datetime";
import {
  canCompleteOn,
  compareHabitsForDay,
  completionRate,
  computeHabitStreaks,
  dayState,
  isAvailableOn,
  isHabitScheduledOnDate,
  isPausedOn,
  pausedFor,
  weekOf,
  weeklyProgress,
  type HabitSchedule,
} from "@/lib/habits/logic";

// 2026-09-21 is a Monday. The week runs Mon 21 … Sun 27.
const MON = "2026-09-21";
const TUE = "2026-09-22";
const WED = "2026-09-23";
const THU = "2026-09-24";
const FRI = "2026-09-25";
const SAT = "2026-09-26";
const SUN = "2026-09-27";

function schedule(overrides: Partial<HabitSchedule> = {}): HabitSchedule {
  return {
    frequency: "DAILY",
    weekdays: [],
    weeklyTarget: null,
    startDate: "2026-01-01",
    endDate: null,
    pauses: [],
    ...overrides,
  };
}

/** Mon / Wed / Fri, in the date layer's Sunday-first numbering. */
const MWF = schedule({ frequency: "WEEKDAYS", weekdays: [1, 3, 5] });
const THRICE = schedule({ frequency: "WEEKLY", weeklyTarget: 3 });

const done = (...dates: string[]) => new Set(dates);

describe("scheduling", () => {
  it("is due every day for a daily habit", () => {
    for (const day of [MON, TUE, WED, THU, FRI, SAT, SUN]) {
      expect(isHabitScheduledOnDate(schedule(), day)).toBe(true);
    }
  });

  it("is due only on the chosen weekdays", () => {
    expect(isHabitScheduledOnDate(MWF, MON)).toBe(true);
    expect(isHabitScheduledOnDate(MWF, TUE)).toBe(false);
    expect(isHabitScheduledOnDate(MWF, WED)).toBe(true);
    expect(isHabitScheduledOnDate(MWF, THU)).toBe(false);
    expect(isHabitScheduledOnDate(MWF, FRI)).toBe(true);
    expect(isHabitScheduledOnDate(MWF, SAT)).toBe(false);
    expect(isHabitScheduledOnDate(MWF, SUN)).toBe(false);
  });

  it("uses the date layer's numbering, where Sunday is 0", () => {
    const sundays = schedule({ frequency: "WEEKDAYS", weekdays: [0] });
    expect(isHabitScheduledOnDate(sundays, SUN)).toBe(true);
    expect(isHabitScheduledOnDate(sundays, MON)).toBe(false);
  });

  it("may be done on any available day for a weekly target", () => {
    for (const day of [MON, TUE, SAT, SUN]) {
      expect(isHabitScheduledOnDate(THRICE, day)).toBe(true);
      expect(canCompleteOn(THRICE, day)).toBe(true);
    }
  });

  it("does not exist before its start date", () => {
    const fresh = schedule({ startDate: WED });
    expect(isHabitScheduledOnDate(fresh, TUE)).toBe(false);
    expect(isHabitScheduledOnDate(fresh, WED)).toBe(true);
  });

  it("stops after its end date, inclusive", () => {
    const ending = schedule({ endDate: WED });
    expect(isHabitScheduledOnDate(ending, WED)).toBe(true);
    expect(isHabitScheduledOnDate(ending, THU)).toBe(false);
  });

  it("schedules nothing inside a pause, inclusive at both ends", () => {
    const paused = schedule({ pauses: [{ start: TUE, end: THU }] });
    expect(isPausedOn(paused, MON)).toBe(false);
    expect(isPausedOn(paused, TUE)).toBe(true);
    expect(isPausedOn(paused, THU)).toBe(true);
    expect(isPausedOn(paused, FRI)).toBe(false);
    expect(isHabitScheduledOnDate(paused, WED)).toBe(false);
    expect(isAvailableOn(paused, WED)).toBe(false);
  });

  it("treats an open pause as running to the end of time", () => {
    const paused = schedule({ pauses: [{ start: TUE, end: null }] });
    expect(isHabitScheduledOnDate(paused, MON)).toBe(true);
    expect(isHabitScheduledOnDate(paused, "2027-06-01")).toBe(false);
    // Inclusive: Tue, Wed, Thu and Fri are all days it was not due.
    expect(pausedFor(paused, FRI)).toBe(4);
    // Paused today is one day, not zero.
    expect(pausedFor(paused, TUE)).toBe(1);
    expect(pausedFor(schedule(), FRI)).toBeNull();
  });

  it("puts weeks Monday to Sunday", () => {
    expect(weekOf(WED)).toEqual({ start: MON, end: SUN });
    expect(weekOf(SUN)).toEqual({ start: MON, end: SUN });
    expect(weekOf("2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });
});

describe("daily streaks", () => {
  it("counts consecutive completed days", () => {
    const streaks = computeHabitStreaks(schedule(), done(MON, TUE, WED), WED);
    expect(streaks.current).toBe(3);
    expect(streaks.longest).toBe(3);
  });

  it("restarts after a missed day", () => {
    // Mon ✓ Tue ✓ Wed ✗ Thu ✓ → Thursday starts a new streak.
    const streaks = computeHabitStreaks(schedule(), done(MON, TUE, THU), THU);
    expect(streaks.current).toBe(1);
    expect(streaks.longest).toBe(2);
  });

  it("does not break on a day that is still open", () => {
    // It is Thursday morning; nothing done yet. Yesterday's run still stands.
    const streaks = computeHabitStreaks(schedule(), done(MON, TUE, WED), THU);
    expect(streaks.current).toBe(3);
  });

  it("breaks once an open day has passed", () => {
    // Friday: Thursday came and went with nothing.
    const streaks = computeHabitStreaks(schedule(), done(MON, TUE, WED), FRI);
    expect(streaks.current).toBe(0);
    expect(streaks.longest).toBe(3);
  });

  it("is zero with no completions", () => {
    expect(computeHabitStreaks(schedule(), done(), WED)).toEqual({
      current: 0,
      longest: 0,
      currentClipped: false,
      longestClipped: false,
    });
  });

  it("ignores completions before the start date", () => {
    const fresh = schedule({ startDate: WED });
    // Rows from before the habit began cannot exist through the UI, but the
    // arithmetic must not count them if they do.
    const streaks = computeHabitStreaks(fresh, done(MON, TUE, WED, THU), THU);
    expect(streaks.current).toBe(2);
    expect(streaks.longest).toBe(2);
  });

  it("gives a habit started and completed today a streak of one", () => {
    expect(computeHabitStreaks(schedule({ startDate: THU }), done(THU), THU).current).toBe(1);
  });

  it("is judged as of its end date once it has ended", () => {
    const ended = schedule({ endDate: WED });
    // Thursday and Friday were never occurrences, so they cannot break it.
    expect(computeHabitStreaks(ended, done(MON, TUE, WED), FRI).current).toBe(3);
  });
});

describe("chosen-weekday streaks", () => {
  it("steps over days the habit is not due", () => {
    // Mon ✓ Tue — Wed ✓ Thu — Fri ✓ → three scheduled occurrences.
    const streaks = computeHabitStreaks(MWF, done(MON, WED, FRI), FRI);
    expect(streaks.current).toBe(3);
    expect(streaks.longest).toBe(3);
  });

  it("does not break over a weekend", () => {
    const nextMon = "2026-09-28";
    const streaks = computeHabitStreaks(MWF, done(MON, WED, FRI, nextMon), nextMon);
    expect(streaks.current).toBe(4);
  });

  it("breaks on a missed scheduled day, not an unscheduled one", () => {
    // Wednesday was due and skipped; Tuesday and Thursday were never due.
    const streaks = computeHabitStreaks(MWF, done(MON, FRI), FRI);
    expect(streaks.current).toBe(1);
    expect(streaks.longest).toBe(1);
  });

  it("treats an unscheduled today as neutral", () => {
    // Saturday: the habit is not due, so Friday's run simply stands.
    expect(computeHabitStreaks(MWF, done(MON, WED, FRI), SAT).current).toBe(3);
  });
});

describe("pauses and streaks", () => {
  it("does not count paused days as misses", () => {
    // Daily habit, paused Tue–Thu, completed Mon and Fri: an unbroken 2.
    const paused = schedule({ pauses: [{ start: TUE, end: THU }] });
    const streaks = computeHabitStreaks(paused, done(MON, FRI), FRI);
    expect(streaks.current).toBe(2);
  });

  it("keeps the streak intact while paused", () => {
    const paused = schedule({ pauses: [{ start: THU, end: null }] });
    // Sunday, still paused: nothing has been due since Wednesday.
    expect(computeHabitStreaks(paused, done(MON, TUE, WED), SUN).current).toBe(3);
  });

  it("credits a completion recorded inside a pause", () => {
    const paused = schedule({ pauses: [{ start: TUE, end: THU }] });
    // A pause removes the obligation, never the credit: the Wednesday was
    // done, and a schedule describes what is owed rather than what happened.
    expect(computeHabitStreaks(paused, done(MON, WED, FRI), FRI).current).toBe(3);
  });

  it("does not drop a day from the record when the habit is paused on it", () => {
    // Kept Mon, Tue and Wed, then paused on the Wednesday — a holiday
    // starting after the day's work was already done. Both the current run
    // and the all-time best must survive it, or a lifecycle action would be
    // rewriting history.
    const before = computeHabitStreaks(schedule(), done(MON, TUE, WED), WED);
    const after = computeHabitStreaks(
      schedule({ pauses: [{ start: WED, end: null }] }),
      done(MON, TUE, WED),
      WED,
    );

    expect(before.current).toBe(3);
    expect(after.current).toBe(3);
    expect(after.longest).toBe(3);
  });
});

describe("weekly-target streaks", () => {
  const w0 = "2026-09-07"; // Mon
  const w1 = "2026-09-14"; // Mon
  const w2 = MON; // 2026-09-21

  it("counts consecutive kept weeks", () => {
    const completions = done(
      w0, addDays(w0, 2), addDays(w0, 4),
      w1, addDays(w1, 1), addDays(w1, 3),
      w2, addDays(w2, 1), addDays(w2, 2),
    );
    const streaks = computeHabitStreaks(THRICE, completions, WED);
    expect(streaks.current).toBe(3);
    expect(streaks.longest).toBe(3);
  });

  it("treats the current week as neutral until it is over", () => {
    // Two prior weeks kept; this week has one so far, and it is Wednesday.
    const completions = done(
      w0, addDays(w0, 2), addDays(w0, 4),
      w1, addDays(w1, 1), addDays(w1, 3),
      w2,
    );
    expect(computeHabitStreaks(THRICE, completions, WED).current).toBe(2);
  });

  it("breaks on a week that ended short", () => {
    // Week 0 kept, week 1 only two, week 2 kept → streak is 1.
    const completions = done(
      w0, addDays(w0, 2), addDays(w0, 4),
      w1, addDays(w1, 1),
      w2, addDays(w2, 1), addDays(w2, 2),
    );
    const streaks = computeHabitStreaks(THRICE, completions, SUN);
    expect(streaks.current).toBe(1);
    expect(streaks.longest).toBe(1);
  });

  it("does not care which days the completions fell on", () => {
    const completions = done(addDays(w2, 4), addDays(w2, 5), addDays(w2, 6));
    expect(computeHabitStreaks(THRICE, completions, SUN).current).toBe(1);
  });

  it("skips a week spent entirely paused", () => {
    const paused = schedule({
      frequency: "WEEKLY",
      weeklyTarget: 3,
      pauses: [{ start: w1, end: addDays(w1, 6) }],
    });
    const completions = done(
      w0, addDays(w0, 2), addDays(w0, 4),
      w2, addDays(w2, 1), addDays(w2, 2),
    );
    expect(computeHabitStreaks(paused, completions, WED).current).toBe(2);
  });

  it("reports weekly progress for the week in view", () => {
    expect(weeklyProgress(THRICE, done(MON, TUE), WED)).toEqual({ done: 2, target: 3 });
    expect(weeklyProgress(THRICE, done(MON, TUE), "2026-09-28")).toEqual({ done: 0, target: 3 });
  });
});

describe("a partly available week", () => {
  it("is judged against what was actually possible in it", () => {
    // Five times a week, but paused from the Thursday: only Mon–Wed were
    // available, so three completions is a kept week rather than a failure.
    const paused = schedule({
      frequency: "WEEKLY",
      weeklyTarget: 5,
      pauses: [{ start: THU, end: SUN }],
    });
    expect(computeHabitStreaks(paused, done(MON, TUE, WED), SUN).current).toBe(1);
  });

  it("is judged against what was possible when the habit started mid-week", () => {
    const fresh = schedule({ frequency: "WEEKLY", weeklyTarget: 5, startDate: THU });
    expect(computeHabitStreaks(fresh, done(THU, FRI, SAT, SUN), SUN).current).toBe(1);
  });

  it("is judged against what was possible when the habit ended mid-week", () => {
    const ending = schedule({ frequency: "WEEKLY", weeklyTarget: 5, endDate: WED });
    expect(computeHabitStreaks(ending, done(MON, TUE, WED), SUN).current).toBe(1);
  });

  it("is still missed when the available days went unused", () => {
    const paused = schedule({
      frequency: "WEEKLY",
      weeklyTarget: 5,
      pauses: [{ start: THU, end: SUN }],
    });
    expect(computeHabitStreaks(paused, done(MON), SUN).current).toBe(0);
  });
});

describe("the history window", () => {
  it("clips a streak longer than the window and says so", () => {
    const today = "2027-06-01";
    const start = addDays(today, -500);
    const completions = new Set<string>();
    for (let day = start; day <= today; day = addDays(day, 1)) completions.add(day);

    const streaks = computeHabitStreaks(schedule({ startDate: start }), completions, today);

    expect(streaks.current).toBe(HABIT_HISTORY_DAYS);
    expect(streaks.currentClipped).toBe(true);
  });

  it("does not claim clipping when the walk stopped at the start date", () => {
    const streaks = computeHabitStreaks(schedule({ startDate: MON }), done(MON, TUE, WED), WED);
    expect(streaks.current).toBe(3);
    expect(streaks.currentClipped).toBe(false);
    expect(streaks.longestClipped).toBe(false);
  });

  it("reports clipping on every weekday, not only the ones that are occurrences", () => {
    // A Mon/Wed/Fri habit kept without a break for well over the window. The
    // backwards walk runs out of window on whatever day of the week it is, and
    // the last day inside the window is usually not an occurrence — so a flag
    // set only when an occurrence lands on the floor would be silent on four
    // days in seven, for the same unbroken run.
    for (let offset = 0; offset < 7; offset += 1) {
      const today = addDays("2027-06-01", offset);
      const start = addDays(today, -500);
      const completions = new Set<string>();
      for (let day = start; day <= today; day = addDays(day, 1)) completions.add(day);

      const streaks = computeHabitStreaks(
        { ...MWF, startDate: start },
        completions,
        today,
      );

      expect(streaks.current).toBeGreaterThan(0);
      expect(streaks.currentClipped).toBe(true);
    }
  });

  it("flags a longest run that reaches the window edge", () => {
    const today = "2027-06-01";
    const start = addDays(today, -800);
    const completions = new Set<string>();
    // An unbroken run from long before the window, stopping a month ago.
    for (let day = start; day <= addDays(today, -30); day = addDays(day, 1)) {
      completions.add(day);
    }

    const streaks = computeHabitStreaks(schedule({ startDate: start }), completions, today);

    expect(streaks.current).toBe(0);
    expect(streaks.longestClipped).toBe(true);
  });

  it("does not flag a longest run that began inside the window", () => {
    const today = "2027-06-01";
    const start = addDays(today, -800);
    const completions = new Set<string>();
    // Begins well after the window edge, so nothing older is hidden.
    for (let day = addDays(today, -40); day <= addDays(today, -10); day = addDays(day, 1)) {
      completions.add(day);
    }

    const streaks = computeHabitStreaks(schedule({ startDate: start }), completions, today);

    expect(streaks.longest).toBe(31);
    expect(streaks.longestClipped).toBe(false);
  });

  it("does not invent a missed week at the edge of a weekly habit's window", () => {
    // Kept every Monday for three years. The weekly walk rounds the window
    // edge back to a Monday, and the read layer loads from the same boundary,
    // so the oldest week must not read as missed whatever weekday today is.
    for (let offset = 0; offset < 7; offset += 1) {
      const today = addDays("2027-06-01", offset);
      const start = addDays(today, -1100);
      const completions = new Set<string>();
      for (let day = start; day <= today; day = addDays(day, 1)) {
        if (weekOf(day).start === day) completions.add(day);
      }

      const streaks = computeHabitStreaks(
        { ...schedule({ frequency: "WEEKLY", weeklyTarget: 1, startDate: start }) },
        completions,
        today,
      );

      // 366 days is 52 whole weeks plus a remainder; the run fills the window.
      expect(streaks.current).toBeGreaterThanOrEqual(52);
      expect(streaks.currentClipped).toBe(true);
    }
  });
});

describe("a week's completion rate", () => {
  it("counts a whole week that sits inside the range", () => {
    const rate = completionRate(THRICE, done(MON, TUE, WED), MON, SUN, SUN);
    expect(rate).toMatchObject({ scheduled: 1, completed: 1, percent: 100 });
  });

  it("leaves out a week that began before the range", () => {
    // The week of Mon 21 started before Wed 23, so judging it here would let
    // days outside the range decide the figure — a 30-day rate that reached
    // 36 days back.
    const rate = completionRate(THRICE, done(MON, TUE, WED), WED, SUN, SUN);
    expect(rate).toMatchObject({ scheduled: 0, completed: 0, percent: 0 });
  });
});

describe("date boundaries", () => {
  it("runs across a month end", () => {
    const streaks = computeHabitStreaks(
      schedule(),
      done("2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"),
      "2026-10-02",
    );
    expect(streaks.current).toBe(4);
  });

  it("runs across a year end", () => {
    const streaks = computeHabitStreaks(
      schedule(),
      done("2026-12-30", "2026-12-31", "2027-01-01"),
      "2027-01-01",
    );
    expect(streaks.current).toBe(3);
  });

  it("runs across a leap day", () => {
    const streaks = computeHabitStreaks(
      schedule({ startDate: "2024-01-01" }),
      done("2024-02-28", "2024-02-29", "2024-03-01"),
      "2024-03-01",
    );
    expect(streaks.current).toBe(3);
  });

  it("keeps weekly weeks aligned across a year end", () => {
    // 2026-12-28 is a Monday; that week ends on 2027-01-03.
    expect(weekOf("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });
});

describe("completion rate", () => {
  it("measures done against due, leaving today out while it is open", () => {
    const rate = completionRate(schedule(), done(MON, WED), MON, THU, THU);
    // Mon ✓ Tue ✗ Wed ✓ Thu (open) → 2 of 3.
    expect(rate).toEqual({ scheduled: 3, completed: 2, percent: 67 });
  });

  it("counts today once it is done", () => {
    const rate = completionRate(schedule(), done(MON, WED, THU), MON, THU, THU);
    expect(rate).toEqual({ scheduled: 4, completed: 3, percent: 75 });
  });

  it("ignores days the habit was not due", () => {
    const rate = completionRate(MWF, done(MON, WED), MON, SUN, "2026-10-05");
    expect(rate).toEqual({ scheduled: 3, completed: 2, percent: 67 });
  });

  it("is zero, not NaN, when nothing was due", () => {
    expect(completionRate(schedule({ startDate: "2027-01-01" }), done(), MON, SUN, SUN).percent).toBe(0);
  });

  it("measures weeks for a weekly habit", () => {
    const w1 = "2026-09-14";
    const rate = completionRate(
      THRICE,
      done(w1, addDays(w1, 1), addDays(w1, 2), MON),
      w1,
      SUN,
      "2026-10-05",
    );
    // Week 1 kept, week 2 missed.
    expect(rate).toEqual({ scheduled: 2, completed: 1, percent: 50 });
  });
});

describe("how a day reads", () => {
  it("names every state", () => {
    const paused = schedule({ startDate: TUE, pauses: [{ start: THU, end: THU }] });
    const completions = done(WED);
    expect(dayState(paused, completions, MON, SUN)).toBe("before-start");
    expect(dayState(paused, completions, TUE, SUN)).toBe("missed");
    expect(dayState(paused, completions, WED, SUN)).toBe("completed");
    expect(dayState(paused, completions, THU, SUN)).toBe("paused");
    expect(dayState(paused, completions, SUN, SUN)).toBe("due");
    expect(dayState(paused, completions, "2026-10-01", SUN)).toBe("due");
    expect(dayState(MWF, completions, TUE, SUN)).toBe("not-scheduled");
  });

  it("never marks a single day missed for a weekly habit", () => {
    expect(dayState(THRICE, done(), MON, SUN)).toBe("not-scheduled");
  });
});

describe("ordering habits for a day", () => {
  it("puts open work first, then done, then not due, then by name", () => {
    const rows = [
      { id: "1", name: "Zeta", due: false, satisfied: false },
      { id: "2", name: "Beta", due: true, satisfied: true },
      { id: "3", name: "Alpha", due: true, satisfied: false },
      { id: "4", name: "Gamma", due: true, satisfied: false },
    ];
    expect([...rows].sort(compareHabitsForDay).map((r) => r.name)).toEqual([
      "Alpha",
      "Gamma",
      "Beta",
      "Zeta",
    ]);
  });

  it("is total, so equal rows never swap", () => {
    const a = { id: "a", name: "Same", due: true, satisfied: false };
    const b = { id: "b", name: "Same", due: true, satisfied: false };
    expect(compareHabitsForDay(a, a)).toBe(0);
    expect(compareHabitsForDay(a, b)).toBeLessThan(0);
    expect(compareHabitsForDay(b, a)).toBeGreaterThan(0);
  });
});

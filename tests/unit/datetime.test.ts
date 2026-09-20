import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  dbDateToLocalDate,
  formatDuration,
  formatLongDate,
  formatRelativeDay,
  formatTime,
  getGreeting,
  getLocalToday,
  isLocalDate,
  isValidTimeString,
  isValidTimezone,
  localDateTimeToInstant,
  localDateToDbDate,
  normalizeTimezone,
  toLocalDate,
} from "@/lib/datetime";

describe("timezone handling", () => {
  it("accepts real IANA zones and rejects nonsense", () => {
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("falls back to UTC instead of throwing on bad stored values", () => {
    expect(normalizeTimezone("Not/AZone")).toBe("UTC");
    expect(normalizeTimezone(null)).toBe("UTC");
    expect(normalizeTimezone(undefined)).toBe("UTC");
    expect(normalizeTimezone("Pacific/Auckland")).toBe("Pacific/Auckland");
  });

  it("resolves the same instant to different calendar days by zone", () => {
    // 2026-09-20T23:30Z is already the 21st in Tokyo and still the 20th in NYC.
    const instant = new Date("2026-09-20T23:30:00.000Z");
    expect(toLocalDate(instant, "UTC")).toBe("2026-09-20");
    expect(toLocalDate(instant, "Asia/Tokyo")).toBe("2026-09-21");
    expect(toLocalDate(instant, "America/New_York")).toBe("2026-09-20");
  });

  it("resolves a pre-dawn instant to the previous day west of UTC", () => {
    const instant = new Date("2026-09-20T02:00:00.000Z");
    expect(toLocalDate(instant, "America/Los_Angeles")).toBe("2026-09-19");
    expect(toLocalDate(instant, "UTC")).toBe("2026-09-20");
  });

  it("getLocalToday uses the supplied clock, never the host's", () => {
    const now = new Date("2026-01-01T00:30:00.000Z");
    expect(getLocalToday("UTC", now)).toBe("2026-01-01");
    expect(getLocalToday("America/New_York", now)).toBe("2025-12-31");
  });
});

describe("calendar arithmetic", () => {
  it("adds and subtracts days across month and year ends", () => {
    expect(addDays("2026-09-20", 1)).toBe("2026-09-21");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("measures whole days between calendar dates", () => {
    expect(daysBetween("2026-09-20", "2026-09-20")).toBe(0);
    expect(daysBetween("2026-09-21", "2026-09-20")).toBe(1);
    expect(daysBetween("2026-09-19", "2026-09-20")).toBe(-1);
    expect(daysBetween("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("is unaffected by DST, where a local day is 23 or 25 hours long", () => {
    // European DST ends 2026-10-25.
    expect(daysBetween("2026-10-26", "2026-10-25")).toBe(1);
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("DATE column round-tripping", () => {
  it("survives a round trip without shifting a day", () => {
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31", "2028-02-29"]) {
      expect(dbDateToLocalDate(localDateToDbDate(date))).toBe(date);
    }
  });

  it("reads a DATE column as midnight UTC", () => {
    expect(localDateToDbDate("2026-09-20").toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("returns null for an absent due date", () => {
    expect(dbDateToLocalDate(null)).toBeNull();
    expect(dbDateToLocalDate(undefined)).toBeNull();
  });
});

describe("localDateTimeToInstant", () => {
  it("interprets wall-clock time in the user's zone", () => {
    expect(localDateTimeToInstant("2026-09-20", "17:00", "UTC").toISOString()).toBe(
      "2026-09-20T17:00:00.000Z",
    );
    // Tokyo is UTC+9 year round.
    expect(localDateTimeToInstant("2026-09-20", "17:00", "Asia/Tokyo").toISOString()).toBe(
      "2026-09-20T08:00:00.000Z",
    );
  });

  it("applies the offset in force on that date, not today's", () => {
    // New York is UTC-4 in summer and UTC-5 in winter.
    expect(localDateTimeToInstant("2026-07-01", "12:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    expect(localDateTimeToInstant("2026-01-01", "12:00", "America/New_York").toISOString()).toBe(
      "2026-01-01T17:00:00.000Z",
    );
  });

  it("treats a missing time as the start of the day", () => {
    expect(localDateTimeToInstant("2026-09-20", null, "UTC").toISOString()).toBe(
      "2026-09-20T00:00:00.000Z",
    );
  });

  it("produces an instant that reads back as the same local day", () => {
    for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"]) {
      const instant = localDateTimeToInstant("2026-09-20", "00:00", zone);
      expect(toLocalDate(instant, zone)).toBe("2026-09-20");
    }
  });

  it("handles half-hour offset zones", () => {
    // Kolkata is UTC+05:30.
    expect(localDateTimeToInstant("2026-09-20", "10:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-09-20T04:30:00.000Z",
    );
  });
});

describe("input guards", () => {
  it("validates calendar date strings", () => {
    expect(isLocalDate("2026-09-20")).toBe(true);
    expect(isLocalDate("2026-9-20")).toBe(false);
    expect(isLocalDate("20-09-2026")).toBe(false);
    expect(isLocalDate("2026-13-45")).toBe(false);
    expect(isLocalDate("")).toBe(false);
    expect(isLocalDate(null)).toBe(false);
    expect(isLocalDate(20260920)).toBe(false);
  });

  it("validates 24-hour time strings", () => {
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("9:00")).toBe(false);
    expect(isValidTimeString("12:60")).toBe(false);
    expect(isValidTimeString(null)).toBe(false);
  });
});

describe("presentation", () => {
  it("names the days around today", () => {
    expect(formatRelativeDay("2026-09-20", "2026-09-20")).toBe("Today");
    expect(formatRelativeDay("2026-09-21", "2026-09-20")).toBe("Tomorrow");
    expect(formatRelativeDay("2026-09-19", "2026-09-20")).toBe("Yesterday");
  });

  // These assert exact strings on purpose. The labels are built from fixed
  // tables rather than Intl precisely because Node and Chrome disagree about
  // en-GB date patterns, and that difference surfaces as a hydration mismatch
  // in client components. Pinning the output is what stops it coming back.
  it("names nearby days by weekday", () => {
    expect(formatRelativeDay("2026-09-17", "2026-09-20")).toBe("Thu 17 Sep");
    expect(formatRelativeDay("2026-09-22", "2026-09-20")).toBe("Tue 22 Sep");
    expect(formatRelativeDay("2026-09-25", "2026-09-20")).toBe("Fri 25 Sep");
  });

  it("drops the weekday beyond a week and the year within this year", () => {
    expect(formatRelativeDay("2026-09-27", "2026-09-20")).toBe("27 Sep");
    expect(formatRelativeDay("2026-11-24", "2026-09-20")).toBe("24 Nov");
  });

  it("includes the year only when it differs from today's", () => {
    expect(formatRelativeDay("2027-10-25", "2026-09-20")).toBe("25 Oct 2027");
    expect(formatRelativeDay("2025-01-06", "2026-09-20")).toBe("6 Jan 2025");
  });

  it("formats the long date line exactly", () => {
    expect(formatLongDate("2026-09-20")).toBe("Sunday · 20 September");
    expect(formatLongDate("2026-01-01")).toBe("Thursday · 1 January");
    expect(formatLongDate("2028-02-29")).toBe("Tuesday · 29 February");
  });

  it("produces no separator characters that vary between ICU builds", () => {
    // A comma or a narrow no-break space here is the exact shape of the
    // Node-vs-Chrome divergence this replaced.
    for (const date of ["2026-09-17", "2026-09-27", "2027-10-25"]) {
      const label = formatRelativeDay(date, "2026-09-20");
      expect(label).not.toMatch(/[,\u202f\u00a0]/);
    }
  });

  it("converts 24-hour times to a readable clock", () => {
    expect(formatTime("17:00")).toBe("5:00 PM");
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("23:45")).toBe("11:45 PM");
  });

  it("formats durations", () => {
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });

  it("greets by the user's local hour, not the server's", () => {
    const instant = new Date("2026-09-20T09:00:00.000Z");
    expect(getGreeting("UTC", instant)).toBe("Good morning");
    // Same instant, 18:00 in Tokyo.
    expect(getGreeting("Asia/Tokyo", instant)).toBe("Good evening");
    expect(getGreeting("America/Los_Angeles", instant)).toBe("Still up");
  });
});

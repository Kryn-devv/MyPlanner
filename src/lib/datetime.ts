/**
 * Timezone-aware date helpers.
 *
 * Two distinct concepts are deliberately kept apart:
 *
 *  - An *instant* (`Date`) — a point on the global timeline. Used for
 *    `createdAt`, `completedAt`, session expiry.
 *  - A *local calendar day* (`"YYYY-MM-DD"` string) — what the user calls
 *    "today". This is not a point in time and storing it as one is exactly
 *    what makes streaks break when someone travels.
 *
 * Everything here resolves days through the user's configured IANA timezone,
 * never through the server's clock.
 */

/** A calendar day in `YYYY-MM-DD` form, as read on someone's own calendar. */
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_TIMEZONE = "UTC";

/** True if `timezone` is an IANA zone this runtime understands. */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Falls back to UTC rather than throwing, so a bad stored value cannot 500 a page. */
export function normalizeTimezone(timezone: string | null | undefined): string {
  if (timezone && isValidTimezone(timezone)) return timezone;
  return DEFAULT_TIMEZONE;
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;

  // `Date` silently rolls impossible dates forward ("2026-02-31" becomes
  // 3 March), so a shape check alone would let them through. Round-tripping is
  // what actually rejects them.
  return parsed.toISOString().slice(0, 10) === value;
}

/** `"HH:mm"` in 24-hour form. */
export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * The calendar day `instant` falls on, as seen from `timezone`.
 * `en-CA` formats as `YYYY-MM-DD`, which is exactly the shape we store.
 */
export function toLocalDate(instant: Date, timezone: string): LocalDate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(instant);
}

/** The user's "today". */
export function getLocalToday(timezone: string, now: Date = new Date()): LocalDate {
  return toLocalDate(now, timezone);
}

/** Shift a calendar day by whole days, with no timezone involvement at all. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** `a - b`, in whole days. Positive when `a` is later. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const msPerDay = 86_400_000;
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Math.round((left - right) / msPerDay);
}

/**
 * Convert a stored `@db.Date` column to a calendar day.
 *
 * Prisma hands back a `Date` pinned to midnight UTC for DATE columns, so it
 * must be read in UTC — reading it locally is the classic off-by-one-day bug.
 */
export function dbDateToLocalDate(value: Date | null | undefined): LocalDate | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Convert a calendar day back into the midnight-UTC `Date` a DATE column wants. */
export function localDateToDbDate(value: LocalDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * The instant a task is actually due, for ordering timed tasks correctly.
 * Interprets `HH:mm` as wall-clock time in the user's zone.
 */
export function localDateTimeToInstant(date: LocalDate, time: string | null, timezone: string): Date {
  const zone = normalizeTimezone(timezone);
  const [hours, minutes] = isValidTimeString(time) ? time.split(":").map(Number) : [0, 0];

  const hh = String(hours ?? 0).padStart(2, "0");
  const mm = String(minutes ?? 0).padStart(2, "0");
  /** The wall-clock reading interpreted as if it were UTC. */
  const naive = Date.parse(`${date}T${hh}:${mm}:00.000Z`);

  // Subtract the zone's offset to get the real instant. Two passes, because
  // the offset itself depends on the instant across a DST boundary.
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(naive - getTimezoneOffsetMs(instant, zone));
  }

  // A wall-clock reading inside a spring-forward gap names a time that never
  // happened, and the loop above settles on the last instant *before* the gap
  // — which reads back as the previous day when the gap starts at midnight
  // (America/Santiago, America/Havana). A day boundary that lands inside the
  // day it is meant to close makes the XP ledger and the streak disagree about
  // the same completion, so a nonexistent local time resolves forward to the
  // first instant that does exist instead.
  if (toLocalDateTime(instant, zone) !== `${date}T${hh}:${mm}`) {
    const offsetBefore = getTimezoneOffsetMs(new Date(instant.getTime() - HOUR_MS), zone);
    const offsetAfter = getTimezoneOffsetMs(new Date(instant.getTime() + HOUR_MS), zone);
    const gap = offsetAfter - offsetBefore;
    if (gap > 0) return new Date(instant.getTime() + gap);
  }

  return instant;
}

const HOUR_MS = 3_600_000;

/** `"YYYY-MM-DDTHH:mm"` as the clock in `timezone` reads at `instant`. */
function toLocalDateTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** How far `timezone` is ahead of UTC at `instant`, in milliseconds. */
function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour: "2-digit"` with hour12:false emits 24 for midnight in some runtimes.
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));

  // Drop sub-second precision on both sides so only the offset remains.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Date labels are built from these tables rather than `Intl.DateTimeFormat`.
 *
 * Node and Chrome ship different ICU versions, and their en-GB patterns
 * genuinely disagree — Node renders "Thu 17 Sept" where Chrome renders
 * "Thu, 17 Sept". These labels are rendered inside client components, so that
 * difference shows up as a React hydration mismatch on any date two to six
 * days away. Fixed tables make the output identical everywhere, immune to ICU
 * drift, and exactly assertable in tests.
 */
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export interface DateParts {
  readonly weekday: number;
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/** Splits a calendar day into its parts, read in UTC so nothing shifts. */
export function partsOf(date: LocalDate): DateParts {
  const parsed = new Date(`${date}T00:00:00Z`);
  return {
    weekday: parsed.getUTCDay(),
    day: parsed.getUTCDate(),
    month: parsed.getUTCMonth(),
    year: parsed.getUTCFullYear(),
  };
}

/** "Today", "Tomorrow", "Yesterday", "Thu 17 Sep", "27 Sep" or "25 Oct 2027". */
export function formatRelativeDay(date: LocalDate, today: LocalDate): string {
  const delta = daysBetween(date, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";

  const { weekday, day, month, year } = partsOf(date);
  const dayMonth = `${day} ${MONTHS_SHORT[month]}`;

  // Within the week, the weekday name is the most useful anchor.
  if (Math.abs(delta) < 7) return `${WEEKDAYS_SHORT[weekday]} ${dayMonth}`;
  // Beyond that, only show the year when it is not the current one.
  return year === partsOf(today).year ? dayMonth : `${dayMonth} ${year}`;
}

/** "Sunday · 20 September" — the dashboard's date line. */
export function formatLongDate(date: LocalDate): string {
  const { weekday, day, month } = partsOf(date);
  return `${WEEKDAYS_LONG[weekday]} · ${day} ${MONTHS_LONG[month]}`;
}

/** `"17:00"` -> `"5:00 PM"`. */
export function formatTime(time: string): string {
  if (!isValidTimeString(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const hour = h ?? 0;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** `95` -> `"1h 35m"`. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Time-of-day greeting, resolved in the user's zone. */
export function getGreeting(timezone: string, now: Date = new Date()): string {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number(hourText) % 24;

  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good evening";
}

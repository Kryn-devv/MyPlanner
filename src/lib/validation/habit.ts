import {
  HABIT_FREQUENCIES,
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_NAME_LENGTH,
  MAX_WEEKLY_TARGET,
  MIN_WEEKLY_TARGET,
} from "@/config/habits";
import type { HabitFrequency } from "@/generated/prisma/enums";
import { daysBetween, isLocalDate, type LocalDate } from "@/lib/datetime";
import { MAX_XP_REWARD } from "@/lib/xp";
import { ErrorBag, invalid, readOptionalString, readString, valid, type ValidationResult } from "./result";

/**
 * Habit input validation.
 *
 * Same contract as the task, project and goal validators: parse a `FormData`,
 * report every problem at once, and return a value the service can trust for
 * *shape*. Ownership is not checked here — that needs the database and lives
 * in the service, inside the transaction that performs the write.
 *
 * The recurrence is validated as a whole, not field by field: a WEEKDAYS habit
 * with no days is not a habit, and a WEEKLY habit needs a target. Fields that
 * do not apply to the chosen frequency are discarded rather than stored, so a
 * habit switched from chosen days to daily does not carry stale weekdays.
 */

function isFrequency(value: string): value is HabitFrequency {
  return (HABIT_FREQUENCIES as readonly string[]).includes(value);
}

export interface HabitInput {
  readonly name: string;
  readonly description: string | null;
  readonly frequency: HabitFrequency;
  /** 0 = Sunday … 6 = Saturday; empty unless WEEKDAYS. Sorted, deduplicated. */
  readonly weekdays: readonly number[];
  /** Null unless WEEKLY. */
  readonly weeklyTarget: number | null;
  readonly xpReward: number;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
}

/** `FormData.getAll("weekdays")` arrives as strings; keep only real weekdays. */
function readWeekdays(form: FormData): number[] {
  const seen = new Set<number>();
  for (const raw of form.getAll("weekdays")) {
    if (typeof raw !== "string") continue;
    const day = Number(raw);
    if (Number.isInteger(day) && day >= 0 && day <= 6) seen.add(day);
  }
  return [...seen].sort((a, b) => a - b);
}

export function validateHabit(
  form: FormData,
  /** Used when the form leaves the start date blank. */
  today: LocalDate,
): ValidationResult<HabitInput> {
  const bag = new ErrorBag();

  const name = readString(form, "name");
  const description = readOptionalString(form, "description");
  const rawFrequency = readString(form, "frequency") || "DAILY";
  const weekdays = readWeekdays(form);
  const rawTarget = readOptionalString(form, "weeklyTarget");
  const rawXp = readOptionalString(form, "xpReward");
  const rawStart = readOptionalString(form, "startDate");
  const rawEnd = readOptionalString(form, "endDate");

  // -- name / description ---------------------------------------------------
  if (!name) bag.add("name", "A habit needs a name.");
  else if (name.length > MAX_HABIT_NAME_LENGTH)
    bag.add("name", `Habit names are limited to ${MAX_HABIT_NAME_LENGTH} characters.`);

  if (description && description.length > MAX_HABIT_DESCRIPTION_LENGTH)
    bag.add("description", `Descriptions are limited to ${MAX_HABIT_DESCRIPTION_LENGTH} characters.`);

  // -- recurrence -----------------------------------------------------------
  const frequency: HabitFrequency = isFrequency(rawFrequency) ? rawFrequency : "DAILY";
  if (!isFrequency(rawFrequency)) bag.add("frequency", "Choose how often this habit recurs.");

  if (frequency === "WEEKDAYS" && weekdays.length === 0) {
    bag.add("weekdays", "Pick at least one day of the week.");
  }

  let weeklyTarget: number | null = null;
  if (frequency === "WEEKLY") {
    const parsed = rawTarget === null ? Number.NaN : Number(rawTarget);
    if (!Number.isInteger(parsed)) bag.add("weeklyTarget", "Enter how many times per week.");
    else if (parsed < MIN_WEEKLY_TARGET || parsed > MAX_WEEKLY_TARGET)
      bag.add("weeklyTarget", `Aim for between ${MIN_WEEKLY_TARGET} and ${MAX_WEEKLY_TARGET} times a week.`);
    else weeklyTarget = parsed;
  }

  // -- xp -------------------------------------------------------------------
  let xpReward = 10;
  if (rawXp !== null) {
    const parsed = Number(rawXp);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) bag.add("xpReward", "Enter a whole number of XP.");
    else if (parsed < 0) bag.add("xpReward", "XP cannot be negative.");
    else if (parsed > MAX_XP_REWARD) bag.add("xpReward", `XP is capped at ${MAX_XP_REWARD} per completion.`);
    else xpReward = parsed;
  }

  // -- dates ----------------------------------------------------------------
  // `isLocalDate` rejects rolled-over dates like 2026-02-31, which a plain
  // shape check would let through.
  const startDate = rawStart ?? today;
  if (!isLocalDate(startDate)) bag.add("startDate", "Enter a valid start date.");
  if (rawEnd && !isLocalDate(rawEnd)) bag.add("endDate", "Enter a valid end date.");

  if (rawEnd && isLocalDate(startDate) && isLocalDate(rawEnd) && daysBetween(rawEnd, startDate) < 0) {
    bag.add("endDate", "The end date cannot be before the start date.");
  }

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    name,
    description,
    frequency,
    // Only the fields the chosen frequency uses are kept.
    weekdays: frequency === "WEEKDAYS" ? weekdays : [],
    weeklyTarget: frequency === "WEEKLY" ? weeklyTarget : null,
    xpReward,
    startDate: startDate as LocalDate,
    endDate: (rawEnd as LocalDate | null) ?? null,
  });
}

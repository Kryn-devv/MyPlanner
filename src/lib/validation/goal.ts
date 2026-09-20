import {
  GOAL_STATUSES,
  MAX_GOAL_DESCRIPTION_LENGTH,
  MAX_GOAL_TITLE_LENGTH,
} from "@/config/goals";
import { PRIORITIES } from "@/config/priorities";
import { daysBetween, isLocalDate, type LocalDate } from "@/lib/datetime";
import type { GoalStatus, Priority } from "@/generated/prisma/enums";
import { ErrorBag, invalid, readOptionalString, readString, valid, type ValidationResult } from "./result";

/**
 * Goal input validation.
 *
 * Same contract as the project and task validators: parse a `FormData`, report
 * every problem at once, and return a value the service can trust for *shape*.
 * Ownership is deliberately not checked here — that needs the database and is
 * enforced in the service layer, inside the transaction that performs the write.
 */

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

function isGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value);
}

export interface GoalInput {
  readonly title: string;
  readonly description: string | null;
  readonly priority: Priority;
  readonly status: GoalStatus;
  readonly startDate: LocalDate | null;
  readonly targetDate: LocalDate | null;
}

export function validateGoal(form: FormData): ValidationResult<GoalInput> {
  const bag = new ErrorBag();

  const title = readString(form, "title");
  const description = readOptionalString(form, "description");
  const rawPriority = readString(form, "priority") || "MEDIUM";
  const rawStatus = readString(form, "status") || "ACTIVE";
  const startDate = readOptionalString(form, "startDate");
  const targetDate = readOptionalString(form, "targetDate");

  // -- title ----------------------------------------------------------------
  if (!title) bag.add("title", "A goal needs a title.");
  else if (title.length > MAX_GOAL_TITLE_LENGTH)
    bag.add("title", `Goal titles are limited to ${MAX_GOAL_TITLE_LENGTH} characters.`);

  // -- description ----------------------------------------------------------
  if (description && description.length > MAX_GOAL_DESCRIPTION_LENGTH)
    bag.add("description", `Descriptions are limited to ${MAX_GOAL_DESCRIPTION_LENGTH} characters.`);

  // -- priority / status ----------------------------------------------------
  if (!isPriority(rawPriority)) bag.add("priority", "Choose a valid priority.");
  if (!isGoalStatus(rawStatus)) bag.add("status", "Choose a valid status.");

  // -- dates ----------------------------------------------------------------
  // `isLocalDate` rejects rolled-over dates like 2026-02-31, which a plain
  // shape check would let through.
  if (startDate && !isLocalDate(startDate)) bag.add("startDate", "Enter a valid start date.");
  if (targetDate && !isLocalDate(targetDate)) bag.add("targetDate", "Enter a valid target date.");

  // A goal that ends before it starts is a data-entry slip, not a plan.
  if (
    startDate &&
    targetDate &&
    isLocalDate(startDate) &&
    isLocalDate(targetDate) &&
    daysBetween(targetDate, startDate) < 0
  ) {
    bag.add("targetDate", "The target date cannot be before the start date.");
  }

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    title,
    description,
    priority: isPriority(rawPriority) ? rawPriority : "MEDIUM",
    status: isGoalStatus(rawStatus) ? rawStatus : "ACTIVE",
    startDate: (startDate as LocalDate | null) ?? null,
    targetDate: (targetDate as LocalDate | null) ?? null,
  });
}

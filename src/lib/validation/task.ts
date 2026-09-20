import { PRIORITIES } from "@/config/priorities";
import { isLocalDate, isValidTimeString, type LocalDate } from "@/lib/datetime";
import { MAX_XP_REWARD, resolveXpReward } from "@/lib/xp";
import type { Priority } from "@/generated/prisma/enums";
import { validateAssignmentShape } from "./project";
import { ErrorBag, invalid, readOptionalString, readString, valid, type ValidationResult } from "./result";

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
/** 24h * 60 — a single task longer than a day is a project, not a task. */
export const MAX_ESTIMATED_MINUTES = 1440;

export interface TaskInput {
  readonly title: string;
  readonly description: string | null;
  readonly priority: Priority;
  readonly categoryId: string | null;
  readonly dueDate: LocalDate | null;
  readonly dueTime: string | null;
  readonly estimatedMinutes: number | null;
  readonly xpReward: number;
  /**
   * Project / milestone assignment.
   *
   * Only the *shape* is checked here (a milestone always needs a project).
   * Whether these ids exist, belong to the caller, and belong to each other is
   * settled against the database in the service layer, inside the transaction
   * that performs the write — see `assertTaskAssignment`.
   */
  readonly projectId: string | null;
  readonly milestoneId: string | null;
}

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/**
 * Validates a task create/update payload.
 *
 * `availableCategoryIds` is the caller's own category set. Passing it here is
 * what prevents a user from attaching their task to someone else's category by
 * posting a foreign id — the check is structural, not advisory.
 */
export function validateTask(form: FormData, availableCategoryIds: readonly string[] = []): ValidationResult<TaskInput> {
  const bag = new ErrorBag();

  const title = readString(form, "title");
  const description = readOptionalString(form, "description");
  const rawPriority = readString(form, "priority") || "MEDIUM";
  const categoryId = readOptionalString(form, "categoryId");
  const dueDate = readOptionalString(form, "dueDate");
  const dueTime = readOptionalString(form, "dueTime");
  const rawEstimate = readOptionalString(form, "estimatedMinutes");
  const rawXp = readOptionalString(form, "xpReward");
  const projectId = readOptionalString(form, "projectId");
  const milestoneId = readOptionalString(form, "milestoneId");

  // -- title ---------------------------------------------------------------
  if (!title) bag.add("title", "A title is required.");
  else if (title.length > MAX_TITLE_LENGTH)
    bag.add("title", `Titles are limited to ${MAX_TITLE_LENGTH} characters.`);

  // -- description ---------------------------------------------------------
  if (description && description.length > MAX_DESCRIPTION_LENGTH)
    bag.add("description", `Descriptions are limited to ${MAX_DESCRIPTION_LENGTH} characters.`);

  // -- priority ------------------------------------------------------------
  if (!isPriority(rawPriority)) bag.add("priority", "Choose a valid priority.");
  const priority: Priority = isPriority(rawPriority) ? rawPriority : "MEDIUM";

  // -- category ------------------------------------------------------------
  if (categoryId && !availableCategoryIds.includes(categoryId))
    bag.add("categoryId", "That category does not exist.");

  // -- due date / time -----------------------------------------------------
  if (dueDate && !isLocalDate(dueDate)) bag.add("dueDate", "Enter a valid date.");
  if (dueTime && !isValidTimeString(dueTime)) bag.add("dueTime", "Enter a valid time (HH:MM).");
  if (dueTime && !dueDate) bag.add("dueDate", "Pick a date before setting a time.");

  // -- estimate ------------------------------------------------------------
  let estimatedMinutes: number | null = null;
  if (rawEstimate !== null) {
    const parsed = Number(rawEstimate);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed))
      bag.add("estimatedMinutes", "Enter a whole number of minutes.");
    else if (parsed <= 0) bag.add("estimatedMinutes", "Duration must be greater than zero.");
    else if (parsed > MAX_ESTIMATED_MINUTES)
      bag.add("estimatedMinutes", `Keep estimates under ${MAX_ESTIMATED_MINUTES} minutes.`);
    else estimatedMinutes = parsed;
  }

  // -- xp ------------------------------------------------------------------
  let xpReward: number | null = null;
  if (rawXp !== null) {
    const parsed = Number(rawXp);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) bag.add("xpReward", "Enter a whole number of XP.");
    else if (parsed < 0) bag.add("xpReward", "XP cannot be negative.");
    else if (parsed > MAX_XP_REWARD) bag.add("xpReward", `XP is capped at ${MAX_XP_REWARD} per task.`);
    else xpReward = parsed;
  }

  // -- project / milestone --------------------------------------------------
  const assignment = validateAssignmentShape(projectId, milestoneId);
  if (!assignment.ok) {
    for (const [field, message] of Object.entries(assignment.errors)) bag.add(field, message);
  }

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    title,
    description,
    priority,
    categoryId,
    projectId,
    milestoneId,
    dueDate: dueDate as LocalDate | null,
    dueTime,
    estimatedMinutes,
    // Server decides the final number; an omitted value tracks the priority default.
    xpReward: resolveXpReward(priority, xpReward),
  });
}

export const MAX_CATEGORY_NAME_LENGTH = 40;

export interface CategoryInput {
  readonly name: string;
  readonly color: string;
}

export function validateCategory(form: FormData, allowedColors: readonly string[]): ValidationResult<CategoryInput> {
  const bag = new ErrorBag();

  const name = readString(form, "name");
  const color = readString(form, "color") || "slate";

  if (!name) bag.add("name", "A name is required.");
  else if (name.length > MAX_CATEGORY_NAME_LENGTH)
    bag.add("name", `Category names are limited to ${MAX_CATEGORY_NAME_LENGTH} characters.`);

  if (!allowedColors.includes(color)) bag.add("color", "Choose a valid colour.");

  if (!bag.isEmpty) return invalid(bag.toObject());
  return valid({ name, color });
}

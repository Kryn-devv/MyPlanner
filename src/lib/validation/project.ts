import { ACCENT_COLOR_VALUES } from "@/config/colors";
import { PRIORITIES } from "@/config/priorities";
import {
  MAX_MILESTONE_DESCRIPTION_LENGTH,
  MAX_MILESTONE_TITLE_LENGTH,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_STATUSES,
} from "@/config/projects";
import { daysBetween, isLocalDate, type LocalDate } from "@/lib/datetime";
import type { Priority, ProjectStatus } from "@/generated/prisma/enums";
import { ErrorBag, invalid, readOptionalString, readString, valid, type ValidationResult } from "./result";

/**
 * Project and milestone input validation.
 *
 * Same contract as the task validators: parse a `FormData`, report every
 * problem at once, and return a narrowed value the service layer can trust for
 * *shape*. Ownership and cross-entity consistency are deliberately not checked
 * here — those need the database and are enforced in the service layer, inside
 * the same transaction as the write.
 */

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export interface ProjectInput {
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
  readonly priority: Priority;
  readonly status: ProjectStatus;
  readonly startDate: LocalDate | null;
  readonly dueDate: LocalDate | null;
}

export function validateProject(form: FormData): ValidationResult<ProjectInput> {
  const bag = new ErrorBag();

  const name = readString(form, "name");
  const description = readOptionalString(form, "description");
  const color = readString(form, "color") || "violet";
  const rawPriority = readString(form, "priority") || "MEDIUM";
  const rawStatus = readString(form, "status") || "ACTIVE";
  const startDate = readOptionalString(form, "startDate");
  const dueDate = readOptionalString(form, "dueDate");

  // -- name ----------------------------------------------------------------
  if (!name) bag.add("name", "A project name is required.");
  else if (name.length > MAX_PROJECT_NAME_LENGTH)
    bag.add("name", `Project names are limited to ${MAX_PROJECT_NAME_LENGTH} characters.`);

  // -- description ---------------------------------------------------------
  if (description && description.length > MAX_PROJECT_DESCRIPTION_LENGTH)
    bag.add("description", `Descriptions are limited to ${MAX_PROJECT_DESCRIPTION_LENGTH} characters.`);

  // -- colour --------------------------------------------------------------
  if (!ACCENT_COLOR_VALUES.includes(color)) bag.add("color", "Choose a valid colour.");

  // -- priority / status ---------------------------------------------------
  if (!isPriority(rawPriority)) bag.add("priority", "Choose a valid priority.");
  if (!isProjectStatus(rawStatus)) bag.add("status", "Choose a valid status.");

  // -- dates ---------------------------------------------------------------
  if (startDate && !isLocalDate(startDate)) bag.add("startDate", "Enter a valid start date.");
  if (dueDate && !isLocalDate(dueDate)) bag.add("dueDate", "Enter a valid due date.");

  // A project that finishes before it starts is a data-entry slip, not a plan.
  if (
    startDate &&
    dueDate &&
    isLocalDate(startDate) &&
    isLocalDate(dueDate) &&
    daysBetween(dueDate, startDate) < 0
  ) {
    bag.add("dueDate", "The due date cannot be before the start date.");
  }

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    name,
    description,
    color,
    priority: isPriority(rawPriority) ? rawPriority : "MEDIUM",
    status: isProjectStatus(rawStatus) ? rawStatus : "ACTIVE",
    startDate: (startDate as LocalDate | null) ?? null,
    dueDate: (dueDate as LocalDate | null) ?? null,
  });
}

export interface MilestoneInput {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: LocalDate | null;
}

export function validateMilestone(form: FormData): ValidationResult<MilestoneInput> {
  const bag = new ErrorBag();

  const title = readString(form, "title");
  const description = readOptionalString(form, "description");
  const dueDate = readOptionalString(form, "dueDate");

  if (!title) bag.add("title", "A milestone title is required.");
  else if (title.length > MAX_MILESTONE_TITLE_LENGTH)
    bag.add("title", `Milestone titles are limited to ${MAX_MILESTONE_TITLE_LENGTH} characters.`);

  if (description && description.length > MAX_MILESTONE_DESCRIPTION_LENGTH)
    bag.add("description", `Descriptions are limited to ${MAX_MILESTONE_DESCRIPTION_LENGTH} characters.`);

  if (dueDate && !isLocalDate(dueDate)) bag.add("dueDate", "Enter a valid date.");

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    title,
    description,
    dueDate: (dueDate as LocalDate | null) ?? null,
  });
}

/**
 * Shape-level check for a task's project/milestone pair.
 *
 * Catches the one invalid combination that needs no database to spot: a
 * milestone with no project. Everything else — do these ids exist, does the
 * caller own them, does the milestone actually belong to *that* project — is
 * settled against the database in the service layer.
 */
export function validateAssignmentShape(
  projectId: string | null,
  milestoneId: string | null,
): ValidationResult<{ projectId: string | null; milestoneId: string | null }> {
  if (milestoneId && !projectId) {
    return invalid({ milestoneId: "Choose a project before choosing a milestone." });
  }
  return valid({ projectId, milestoneId });
}

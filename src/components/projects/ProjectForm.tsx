"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ACCENT_COLORS } from "@/config/colors";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import {
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_STATUS_CONFIG,
  PROJECT_STATUSES,
} from "@/config/projects";
import { cn } from "@/lib/cn";
import { createProjectAction, updateProjectAction } from "@/lib/projects/actions";
import { IDLE_PROJECT_FORM_STATE, type ProjectFormState } from "@/lib/projects/form-state";
import type { GoalOption } from "@/lib/goals/queries";
import type { ProjectView } from "@/lib/projects/queries";
import type { Priority } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Create / edit a project.
 *
 * Mirrors TaskForm: a Server Action through `useActionState`, so it works
 * before hydration and its field errors come from the same validator the
 * server trusts. The client never re-implements a rule.
 */
export function ProjectForm({
  project,
  goals = [],
  defaultGoalId,
  onSuccess,
  onCancel,
}: {
  project?: ProjectView | null;
  /** Selectable goals. Empty when the user has not created any yet. */
  goals?: readonly GoalOption[];
  /** Prefilled when creating from inside a goal. */
  defaultGoalId?: string | null;
  onSuccess: (state: ProjectFormState) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(project);
  const action = isEditing ? updateProjectAction : createProjectAction;
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    action,
    IDLE_PROJECT_FORM_STATE,
  );

  /**
   * Every field is controlled.
   *
   * React resets an uncontrolled form once its action completes, so a single
   * validation error would otherwise wipe everything the user had typed —
   * including a long description. Holding the values here means a rejected
   * submission comes back with the form exactly as it was left.
   */
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [priority, setPriority] = useState(project?.priority ?? "MEDIUM");
  const [status, setStatus] = useState(project?.status ?? "ACTIVE");
  const [color, setColor] = useState(project?.color ?? "violet");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  // Controlled like every other field, so the chosen goal survives a
  // validation error elsewhere in the form.
  const [goalId, setGoalId] = useState(project?.goalId ?? defaultGoalId ?? "");

  const handledRef = useRef<ProjectFormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {isEditing && <input type="hidden" name="projectId" value={project?.id} />}
      <input type="hidden" name="color" value={color} />

      <FormError message={errors._form} />

      <TextField
        label="Name"
        name="name"
        required
        autoFocus
        maxLength={MAX_PROJECT_NAME_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Build IRIS AI Assistant"
        error={errors.name}
        autoComplete="off"
      />

      <TextAreaField
        label="Description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What is this project for, and what does done look like?"
        error={errors.description}
        rows={3}
      />

      {goals.length > 0 && (
        <SelectField
          label="Goal"
          name="goalId"
          value={goalId}
          onChange={(event) => setGoalId(event.target.value)}
          error={errors.goalId}
          hint="What this project is ultimately for. Optional."
        >
          <option value="">No goal</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </SelectField>
      )}

      {/* With no goals yet there is nothing to choose, but a project created
          from inside a goal still has to carry it through. */}
      {goals.length === 0 && goalId && <input type="hidden" name="goalId" value={goalId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Priority"
          name="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as typeof priority)}
          error={errors.priority}
        >
          {PRIORITIES.map((value: Priority) => (
            <option key={value} value={value}>
              {PRIORITY_CONFIG[value].label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Status"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          error={errors.status}
        >
          {PROJECT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PROJECT_STATUS_CONFIG[value].label}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Start date"
          name="startDate"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Due date"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          // The server enforces this too; the attribute just stops the picker
          // offering an impossible date in the first place.
          min={startDate || undefined}
          error={errors.dueDate}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink-muted">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_COLORS.map((option) => {
            const selected = color === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setColor(option.value)}
                aria-pressed={selected}
                aria-label={option.label}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border transition-all",
                  selected ? "scale-110 border-white/40" : "border-line hover:border-line-strong",
                )}
              >
                <span aria-hidden="true" className={cn("h-3 w-3 rounded-full", option.dotClass)} />
              </button>
            );
          })}
        </div>
        {errors.color && (
          <p role="alert" className="mt-1.5 text-[0.75rem] text-critical">
            {errors.color}
          </p>
        )}
      </fieldset>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEditing ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import { formatDuration } from "@/lib/datetime";
import { getDefaultXpForPriority, MAX_XP_REWARD } from "@/lib/xp";
import { createTaskAction, updateTaskAction } from "@/lib/tasks/actions";
import { IDLE_TASK_FORM_STATE, type TaskFormState } from "@/lib/tasks/form-state";
import { MAX_ESTIMATED_MINUTES, MAX_TITLE_LENGTH } from "@/lib/validation/task";
import type { ProjectOption } from "@/lib/projects/queries";
import type { CategoryView, TaskView } from "@/lib/tasks/queries";
import type { Priority } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Create / edit form.
 *
 * Backed by a Server Action through `useActionState`, so it submits and
 * reports validation errors with or without JavaScript. Field errors come back
 * from the same validator the server trusts — the client never re-implements
 * the rules, it just renders their output.
 */
export interface TaskFormProps {
  categories: readonly CategoryView[];
  projects: readonly ProjectOption[];
  /** Present when editing. */
  task?: TaskView | null;
  /** Prefills the due date when adding from a dated context. */
  defaultDueDate?: string | null;
  /** Prefilled when adding from inside a project or milestone. */
  defaultProjectId?: string | null;
  defaultMilestoneId?: string | null;
  onSuccess: (state: TaskFormState) => void;
  onCancel: () => void;
  formId: string;
}

export function TaskForm({
  categories,
  projects,
  task,
  defaultDueDate,
  defaultProjectId,
  defaultMilestoneId,
  onSuccess,
  onCancel,
  formId,
}: TaskFormProps) {
  const isEditing = Boolean(task);
  const action = isEditing ? updateTaskAction : createTaskAction;
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(action, IDLE_TASK_FORM_STATE);

  const [priority, setPriority] = useState<Priority>(task?.priority ?? "MEDIUM");
  // `null` means "track the priority default"; a number means the user chose.
  const [xpOverride, setXpOverride] = useState<number | null>(
    task && task.xpReward !== getDefaultXpForPriority(task.priority) ? task.xpReward : null,
  );
  /**
   * Every field is controlled.
   *
   * React resets an uncontrolled form once its action completes, so a single
   * rejected field would otherwise wipe the whole form — losing a typed
   * description is a real cost for a validation slip elsewhere.
   */
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? defaultDueDate ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task?.estimatedMinutes !== null && task?.estimatedMinutes !== undefined
      ? String(task.estimatedMinutes)
      : "",
  );

  // Project and milestone are linked: changing the project invalidates any
  // milestone chosen under the previous one, so the milestone is cleared.
  // The server rejects a mismatched pair regardless — this just stops the UI
  // ever presenting one.
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? defaultMilestoneId ?? "");

  const milestoneOptions = useMemo(
    () => projects.find((p) => p.id === projectId)?.milestones ?? [],
    [projects, projectId],
  );

  const xpValue = xpOverride ?? getDefaultXpForPriority(priority);
  const errors = state.errors ?? {};

  // Bubble success up once, after the action settles.
  const handledRef = useRef<TaskFormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  return (
    <form id={formId} action={formAction} className="space-y-4" noValidate>
      {isEditing && <input type="hidden" name="taskId" value={task?.id} />}

      <FormError message={errors._form} />

      <TextField
        label="Title"
        name="title"
        required
        autoFocus
        maxLength={MAX_TITLE_LENGTH}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs doing?"
        error={errors.title}
        autoComplete="off"
      />

      <TextAreaField
        label="Description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Extra context, links, acceptance criteria…"
        error={errors.description}
        rows={3}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Priority"
          name="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
          error={errors.priority}
          hint={xpOverride === null ? `Default reward: ${getDefaultXpForPriority(priority)} XP` : undefined}
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_CONFIG[value].label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Category"
          name="categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          error={errors.categoryId}
        >
          <option value="">No category</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Project"
          name="projectId"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setMilestoneId("");
          }}
          error={errors.projectId}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Milestone"
          name="milestoneId"
          value={milestoneId}
          onChange={(event) => setMilestoneId(event.target.value)}
          // A milestone only means something inside a project.
          disabled={!projectId || milestoneOptions.length === 0}
          error={errors.milestoneId}
          hint={
            !projectId
              ? "Pick a project first"
              : milestoneOptions.length === 0
                ? "This project has no milestones"
                : undefined
          }
        >
          <option value="">No milestone</option>
          {milestoneOptions.map((milestone) => (
            <option key={milestone.id} value={milestone.id}>
              {milestone.title}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Due date"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value);
            // A time with no date is rejected by the validator, so clearing
            // the date clears the time rather than leaving an invalid pair.
            if (!event.target.value) setDueTime("");
          }}
          error={errors.dueDate}
        />
        <TextField
          label="Due time"
          name="dueTime"
          type="time"
          value={dueTime}
          onChange={(event) => setDueTime(event.target.value)}
          error={errors.dueTime}
          // A time with no date has nothing to anchor to.
          disabled={!dueDate}
          hint={!dueDate ? "Pick a date first" : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Estimated duration"
          name="estimatedMinutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_ESTIMATED_MINUTES}
          step={5}
          value={estimatedMinutes}
          onChange={(event) => setEstimatedMinutes(event.target.value)}
          placeholder="Minutes"
          error={errors.estimatedMinutes}
          hint={
            Number(estimatedMinutes) > 0 ? formatDuration(Number(estimatedMinutes)) : "Optional"
          }
        />

        <TextField
          label="XP reward"
          name="xpReward"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_XP_REWARD}
          value={xpValue}
          onChange={(event) => {
            const next = event.target.value;
            setXpOverride(next === "" ? null : Number(next));
          }}
          error={errors.xpReward}
          hint={
            xpOverride === null
              ? "Follows priority"
              : `Custom — ${getDefaultXpForPriority(priority)} XP is the ${PRIORITY_CONFIG[priority].label.toLowerCase()} default`
          }
        />
      </div>

      {xpOverride !== null && (
        <button
          type="button"
          onClick={() => setXpOverride(null)}
          className="text-[0.75rem] text-accent-strong underline-offset-4 hover:underline"
        >
          Reset XP to the priority default
        </button>
      )}

      {/* Kept inside the <form> rather than in the dialog footer so that
          submission works identically before hydration. */}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEditing ? "Save changes" : "Create task"}
        </Button>
      </div>
    </form>
  );
}

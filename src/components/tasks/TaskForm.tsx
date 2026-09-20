"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import { formatDuration } from "@/lib/datetime";
import { getDefaultXpForPriority, MAX_XP_REWARD } from "@/lib/xp";
import { createTaskAction, updateTaskAction } from "@/lib/tasks/actions";
import { IDLE_TASK_FORM_STATE, type TaskFormState } from "@/lib/tasks/form-state";
import { MAX_ESTIMATED_MINUTES, MAX_TITLE_LENGTH } from "@/lib/validation/task";
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
  /** Present when editing. */
  task?: TaskView | null;
  /** Prefills the due date when adding from a dated context. */
  defaultDueDate?: string | null;
  onSuccess: (state: TaskFormState) => void;
  onCancel: () => void;
  formId: string;
}

export function TaskForm({ categories, task, defaultDueDate, onSuccess, onCancel, formId }: TaskFormProps) {
  const isEditing = Boolean(task);
  const action = isEditing ? updateTaskAction : createTaskAction;
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(action, IDLE_TASK_FORM_STATE);

  const [priority, setPriority] = useState<Priority>(task?.priority ?? "MEDIUM");
  // `null` means "track the priority default"; a number means the user chose.
  const [xpOverride, setXpOverride] = useState<number | null>(
    task && task.xpReward !== getDefaultXpForPriority(task.priority) ? task.xpReward : null,
  );
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? defaultDueDate ?? "");

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
        defaultValue={task?.description ?? ""}
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
          defaultValue={task?.categoryId ?? ""}
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
        <TextField
          label="Due date"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          error={errors.dueDate}
        />
        <TextField
          label="Due time"
          name="dueTime"
          type="time"
          defaultValue={task?.dueTime ?? ""}
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
          defaultValue={task?.estimatedMinutes ?? ""}
          placeholder="Minutes"
          error={errors.estimatedMinutes}
          hint={task?.estimatedMinutes ? formatDuration(task.estimatedMinutes) : "Optional"}
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

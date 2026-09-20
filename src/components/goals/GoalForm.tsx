"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GOAL_STATUS_CONFIG, GOAL_STATUSES, MAX_GOAL_TITLE_LENGTH } from "@/config/goals";
import { PRIORITIES, PRIORITY_CONFIG } from "@/config/priorities";
import { createGoalAction, updateGoalAction } from "@/lib/goals/actions";
import { IDLE_GOAL_FORM_STATE, type GoalFormState } from "@/lib/goals/form-state";
import type { GoalView } from "@/lib/goals/queries";
import type { Priority } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Create / edit a goal.
 *
 * Mirrors ProjectForm: a Server Action through `useActionState`, so it works
 * before hydration and its field errors come from the same validator the
 * server trusts. The client never re-implements a rule.
 *
 * Every field is controlled, for the reason Phase 2 uncovered: React resets an
 * uncontrolled form once its action completes, so a single validation error
 * would otherwise discard everything the user had typed.
 */
export function GoalForm({
  goal,
  onSuccess,
  onCancel,
}: {
  goal?: GoalView | null;
  onSuccess: (state: GoalFormState) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(goal);
  const action = isEditing ? updateGoalAction : createGoalAction;
  const [state, formAction, pending] = useActionState<GoalFormState, FormData>(
    action,
    IDLE_GOAL_FORM_STATE,
  );

  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? "MEDIUM");
  const [status, setStatus] = useState(goal?.status ?? "ACTIVE");
  const [startDate, setStartDate] = useState(goal?.startDate ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");

  const handledRef = useRef<GoalFormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {isEditing && <input type="hidden" name="goalId" value={goal?.id} />}

      <FormError message={errors._form} />

      <TextField
        label="Goal"
        name="title"
        required
        autoFocus
        maxLength={MAX_GOAL_TITLE_LENGTH}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. Get into a top engineering university"
        hint="What are you trying to reach? Projects go underneath."
        error={errors.title}
        autoComplete="off"
      />

      <TextAreaField
        label="Why it matters"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What would reaching this actually change?"
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
        >
          {PRIORITIES.map((value) => (
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
          {GOAL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {GOAL_STATUS_CONFIG[value].label}
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
          label="Target date"
          name="targetDate"
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          // The server enforces this too; the attribute just stops the picker
          // offering an impossible date in the first place.
          min={startDate || undefined}
          error={errors.targetDate}
          hint="Optional — a goal without a deadline is still a goal."
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEditing ? "Save changes" : "Create goal"}
        </Button>
      </div>
    </form>
  );
}
